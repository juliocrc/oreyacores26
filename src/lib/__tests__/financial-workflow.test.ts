import prisma from "@/lib/prisma";
import { NextRequest } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import { GET as listInvoices } from "@/app/api/faturas/route";
import { PATCH as payInvoice } from "@/app/api/faturas/[id]/route";
import { POST as issueInvoice } from "@/app/api/ordens-servico/[id]/faturar/route";
import { POST as issueGroupedInvoice } from "@/app/api/ordens-servico/faturar-agrupado/route";
import { POST as cancelInvoice } from "@/app/api/faturas/[id]/cancelar/route";
import { atualizarPagamentoStatusFatura, calcularSaldoFatura, cancelarFatura, emitirFatura, resumoFatura } from "@/lib/faturamento";

jest.mock("@/lib/prisma", () => ({ __esModule: true, default: { $transaction: jest.fn(), fatura: { findMany: jest.fn() } } }));
jest.mock("@/lib/access-control", () => ({ getAccessContext: jest.fn() }));
jest.mock("@/lib/navios-page-helpers", () => ({ getCanonicalNavioLocationLabel: () => null }));
jest.mock("@/lib/auditoria", () => ({ logAuditoria: jest.fn() }));
jest.mock("@/lib/ordens-servico", () => ({
  appendOrdemServicoLog: (meta: object) => meta,
  appendWorkflowTransition: (meta: object) => meta,
  ensureClienteNumero: jest.fn(),
  generateNumeroFatura: jest.fn().mockResolvedValue("FAT-1"),
  generateNumeroRecibo: jest.fn().mockResolvedValue("REC-2"),
  generateNumeroNotaCredito: jest.fn().mockResolvedValue("NC-1"),
   parseOrdemServicoMeta: (value: string | null) => value ? JSON.parse(value) : {},
  toOrdemServicoMetaJson: JSON.stringify,
}));

const tx = {
  cliente: { findUnique: jest.fn().mockResolvedValue({ nome: "Cliente", nif: "123456789", morada: "Rua real" }) },
  fatura: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  recibo: { create: jest.fn() },
  notaCredito: { create: jest.fn() },
  ordemServico: { findMany: jest.fn(), update: jest.fn() },
  faturaOrdemServico: { findMany: jest.fn(), create: jest.fn() },
  ordemServicoLog: { create: jest.fn() },
};
const transaction = prisma.$transaction as jest.Mock;
const invoice = (paid = 30) => ({
  id: 10, numeroFatura: "FAT-1", valorTotal: 100, cancelada: false, pagamentoStatus: "Pago Parcialmente",
  ordemServicos: [{ ordemServico: { id: 1, numeroOrdem: "OT-1", metadados: null } }],
  recibos: paid ? [{ numeroRecibo: "REC-1", valorPago: paid }] : [],
});
const order = (id = 1) => ({
  id, numeroOrdem: `OT-${id}`, status: "concluida", orcamentoStatus: "Aprovado", clienteId: null,
  shipId: null, isIsentoIva: true, codigoIsencaoIva: null, valorPecas: 100, valorMaoObra: 0,
  valorDesconto: 0, metadados: JSON.stringify({ destinatarioFaturacao: { nome: "Cliente", nif: "123456789", morada: "Rua real", localidade: "", ilha: "" } }),
});
const payment = (pagamentoStatus: string, valorPago?: number) => atualizarPagamentoStatusFatura({
  faturaId: 10, pagamentoStatus, valorPago, emitidaPor: "admin@test",
});
const issue = (ids = [1], pagamentoStatus = "Pendente") => emitirFatura({
  ordemServicoIds: ids, pagamentoStatus, emitidaPor: "admin@test",
});

beforeEach(() => {
  jest.clearAllMocks();
  transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
  tx.fatura.findUnique.mockResolvedValue(invoice());
  tx.fatura.update.mockImplementation(async ({ data }) => ({ ...invoice(), ...data }));
  tx.fatura.create.mockImplementation(async ({ data }) => ({ id: 10, ...data }));
  tx.notaCredito.create.mockImplementation(async ({ data }) => ({ id: 20, ...data }));
  tx.ordemServico.findMany.mockResolvedValue([order()]);
  tx.faturaOrdemServico.findMany.mockResolvedValue([]);
});

describe("receipt-backed payment accounting", () => {
  test("30 partial then Paid creates only the remaining 70 and returns receipt and balances", async () => {
    const result = await payment("Pago");
    expect(tx.recibo.create).toHaveBeenCalledWith({ data: expect.objectContaining({ valorPago: 70, numeroRecibo: "REC-2", pagamentoStatus: "Pago" }) });
    expect(result).toMatchObject({ valorPago: 100, valorPendente: 0, numeroRecibo: "REC-2" });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
  });

  test("partial amounts remain incremental", async () => {
    expect(await payment("Pago Parcialmente", 20)).toMatchObject({ valorPago: 50, valorPendente: 50 });
    expect(tx.recibo.create).toHaveBeenCalledWith({ data: expect.objectContaining({ valorPago: 20 }) });
  });

  test("repeated Paid does not create a receipt or update", async () => {
    tx.fatura.findUnique.mockResolvedValue({ ...invoice(100), pagamentoStatus: "Pago" });
    expect(await payment("Pago")).toMatchObject({ valorPago: 100, valorPendente: 0, numeroRecibo: "REC-1" });
    expect(tx.recibo.create).not.toHaveBeenCalled();
    expect(tx.fatura.update).not.toHaveBeenCalled();
  });

  test.each([
    ["arbitrary", undefined], ["Pago Parcialmente", undefined], ["Pago Parcialmente", 0],
    ["Pago Parcialmente", -1], ["Pago Parcialmente", 71], ["Pago Parcialmente", 70],
    ["Pago", 100], ["Pago", 20], ["Pendente", undefined], ["Vencido", 10],
  ])("rejects incompatible status/amount %s %s before writing", async (status, amount) => {
    await expect(payment(status, amount)).rejects.toMatchObject({ status: 400 });
    expect(tx.recibo.create).not.toHaveBeenCalled();
    expect(tx.fatura.update).not.toHaveBeenCalled();
  });

  test("cancelled invoices cannot receive money", async () => {
    tx.fatura.findUnique.mockResolvedValue({ ...invoice(), cancelada: true });
    await expect(payment("Pago")).rejects.toMatchObject({ status: 400 });
    expect(tx.recibo.create).not.toHaveBeenCalled();
  });

  test("existing overpayments require reconciliation", async () => {
    tx.fatura.findUnique.mockResolvedValue({ ...invoice(130), pagamentoStatus: "Pago" });
    await expect(payment("Pago")).rejects.toMatchObject({ status: 409 });
    expect(calcularSaldoFatura({ ...invoice(130), pagamentoStatus: "Pago" })).toEqual({ valorPago: 130, valorPendente: 0, pagamentoHistoricoSemRecibo: false });
    expect(tx.recibo.create).not.toHaveBeenCalled();
    expect(tx.fatura.update).not.toHaveBeenCalled();
  });

  test.each([0, 30])("historical Paid with receipts totalling %s is flagged without collecting again", async (paid) => {
    tx.fatura.findUnique.mockResolvedValue({ ...invoice(paid), pagamentoStatus: "Pago" });
    expect(await payment("Pago")).toMatchObject({
      pagamentoStatus: "Pago", valorPago: paid, valorPendente: 0,
      numeroRecibo: paid ? "REC-1" : null, pagamentoHistoricoSemRecibo: true,
    });
    expect(tx.recibo.create).not.toHaveBeenCalled();
    expect(tx.fatura.update).not.toHaveBeenCalled();
  });

  test.each([["Pago", 100], ["Pago Parcialmente", 10], ["Pendente", undefined], ["Vencido", undefined]])(
    "historical Paid cannot be silently recollected or reopened: %s %s", async (status, amount) => {
      tx.fatura.findUnique.mockResolvedValue({ ...invoice(0), pagamentoStatus: "Pago" });
      await expect(payment(status as string, amount as number | undefined)).rejects.toMatchObject({ status: 409 });
      expect(tx.recibo.create).not.toHaveBeenCalled();
      expect(tx.fatura.update).not.toHaveBeenCalled();
    },
  );

  test("a pending invoice without receipts still owes its full balance and can settle normally", async () => {
    const pending = { ...invoice(0), pagamentoStatus: "Pendente" };
    expect(calcularSaldoFatura(pending)).toEqual({ valorPago: 0, valorPendente: 100, pagamentoHistoricoSemRecibo: false });
    tx.fatura.findUnique.mockResolvedValue(pending);
    expect(await payment("Pago")).toMatchObject({ valorPago: 100, valorPendente: 0, pagamentoHistoricoSemRecibo: false });
    expect(tx.recibo.create).toHaveBeenCalledWith({ data: expect.objectContaining({ valorPago: 100 }) });
  });

  test("zero-value invoices cannot produce zero receipts", async () => {
    tx.fatura.findUnique.mockResolvedValue({ ...invoice(0), valorTotal: 0 });
    await expect(payment("Pago")).rejects.toMatchObject({ status: 400 });
  });

  test("overdue balances subtract receipts and cancelled invoices contribute no outstanding balance", () => {
    expect(calcularSaldoFatura({ ...invoice(), pagamentoStatus: "Vencido" })).toEqual({ valorPago: 30, valorPendente: 70, pagamentoHistoricoSemRecibo: false });
    expect(calcularSaldoFatura({ ...invoice(), cancelada: true })).toEqual({ valorPago: 30, valorPendente: 0, pagamentoHistoricoSemRecibo: false });
  });

  test("receipt sums and balance differences are calculated in cents", () => {
    expect(calcularSaldoFatura({ valorTotal: 0.3, cancelada: false, recibos: [{ valorPago: 0.1 }, { valorPago: 0.2 }] })).toMatchObject({ valorPago: 0.3, valorPendente: 0 });
    expect(calcularSaldoFatura({ valorTotal: 0, cancelada: false, pagamentoStatus: "Pago", recibos: [] })).toMatchObject({ pagamentoHistoricoSemRecibo: false });
  });

  test.each([NaN, Infinity, -1])("invalid stored receipt amount %s requires reconciliation", (valorPago) => {
    expect(() => calcularSaldoFatura({ valorTotal: 100, cancelada: false, recibos: [{ valorPago }] })).toThrow("reconciliação");
  });
});

describe("invoice cancellation and credit notes", () => {
  const cancel = () => cancelarFatura({ faturaId: 10, emitidaPor: "admin@test", motivo: "Correção" });

  test("cancels the full invoice with a credit note while preserving the partial receipts", async () => {
    const result = await cancel();
    expect(result).toMatchObject({ fatura: { cancelada: true, pagamentoStatus: "Cancelado" }, notaCredito: { numeroNotaCredito: "NC-1", valorTotal: 100 }, valorPago: 30, valorPendente: 0, alreadyCancelled: false });
    expect(tx.recibo.create).not.toHaveBeenCalled();
    expect(tx.notaCredito.create).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(tx.ordemServico.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 1 }, data: { metadados: expect.stringContaining('"Cancelado"') } }));
  });

  test("repeated cancellation returns the existing credit note without any writes", async () => {
    tx.fatura.findUnique.mockResolvedValue({ ...invoice(), cancelada: true, notaCredito: { id: 20, numeroNotaCredito: "NC-1" } });
    expect(await cancel()).toMatchObject({ alreadyCancelled: true, notaCredito: { numeroNotaCredito: "NC-1" }, valorPago: 30, valorPendente: 0 });
    expect(tx.fatura.update).not.toHaveBeenCalled();
    expect(tx.notaCredito.create).not.toHaveBeenCalled();
    expect(tx.ordemServico.update).not.toHaveBeenCalled();
  });

  test("credit note failure rejects cancellation instead of reporting success", async () => {
    tx.notaCredito.create.mockRejectedValueOnce(new Error("credit note failure"));
    await expect(cancel()).rejects.toThrow("credit note failure");
    expect(tx.ordemServico.update).not.toHaveBeenCalled();
  });

  test("a concurrent cancellation/payment conflict is surfaced without retry", async () => {
    transaction.mockRejectedValueOnce({ code: "P2034" });
    await expect(cancel()).rejects.toMatchObject({ status: 409 });
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});

describe("invoice issuance", () => {
  test.each([["FO102600098", "FT1026000098"], ["FO022600020", "FT0226000020"], ["FO1026000098", "FT1026000098"]])("issues %s as %s and freezes the work reference", async (numeroOrdem, numeroFatura) => {
    tx.ordemServico.findMany.mockResolvedValue([{ ...order(), numeroOrdem }]);
    tx.fatura.findUnique.mockResolvedValue(null);
    await expect(issue()).resolves.toMatchObject({ numeroFatura, numeroObra: numeroOrdem, numerosObra: [numeroOrdem] });
    const frozen = JSON.parse(tx.fatura.create.mock.calls[0][0].data.metadados);
    expect(frozen).toMatchObject({ numeroObra: numeroOrdem, numerosObra: [numeroOrdem], ordensSnapshot: [{ id: 1, numeroOrdem, numeroObra: numeroOrdem }] });
    const summary = resumoFatura({ fatura: { numeroFatura, metadados: JSON.stringify(frozen),
      ordemServicos: [{ ordemServico: { ...order(), numeroOrdem: "FO012700999" } }],
    } } as never);
    expect(summary.numeroObra).toBe(numeroOrdem);
    expect(summary.ordens[0].numeroOrdem).toBe(numeroOrdem);
  });

  test.each([false, true])("rejects reuse of a derived number including cancelled=%s", async (cancelada) => {
    tx.ordemServico.findMany.mockResolvedValue([{ ...order(), numeroOrdem: " fo022600020 " }]);
    tx.fatura.findUnique.mockResolvedValue({ ...invoice(), numeroFatura: "FT0226000020", cancelada });
    await expect(issue()).rejects.toMatchObject({ status: 409 });
    expect(tx.fatura.findUnique).toHaveBeenCalledWith({ where: { numeroFatura: "FT0226000020" } });
    expect(tx.fatura.create).not.toHaveBeenCalled();
  });

  test("six-digit FO cannot reuse the FT derived from its five-digit representation", async () => {
    tx.ordemServico.findMany.mockResolvedValue([{ ...order(), numeroOrdem: "FO1026000098" }]);
    tx.fatura.findUnique.mockResolvedValue({ ...invoice(), numeroFatura: "FT1026000098" });
    await expect(issue()).rejects.toMatchObject({ status: 409 });
    expect(tx.fatura.findUnique).toHaveBeenCalledWith({ where: { numeroFatura: "FT1026000098" } });
    expect(tx.fatura.create).not.toHaveBeenCalled();
  });

  test("distinct grouped works retain generic numbering and every sorted reference", async () => {
    tx.ordemServico.findMany.mockResolvedValue([
      { ...order(1), clienteId: 1, numeroOrdem: "FO102600098" },
      { ...order(2), clienteId: 1, numeroOrdem: "FO022600020" },
    ]);
    await expect(issue([2, 1])).resolves.toMatchObject({ numeroFatura: "FAT-1", numeroObra: null, numerosObra: ["FO022600020", "FO102600098"] });
    const frozen = JSON.parse(tx.fatura.create.mock.calls[0][0].data.metadados);
    expect(frozen.numerosObra).toEqual(["FO022600020", "FO102600098"]);
  });

  test.each(["FO002600020", "FO132600020", "OS-2026-0001"])("invalid or legacy %s retains generic numbering", async (numeroOrdem) => {
    tx.ordemServico.findMany.mockResolvedValue([{ ...order(), numeroOrdem }]);
    await expect(issue()).resolves.toMatchObject({ numeroFatura: "FAT-1" });
  });

  test.each(["FAT-1", "FT260200020"])("an issued invoice keeps its original number %s and references even if the live work changed", async (numeroFatura) => {
    tx.ordemServico.findMany.mockResolvedValue([{ ...order(), numeroOrdem: "FO022600020" }]);
    const fatura = { ...invoice(), numeroFatura, metadados: JSON.stringify({ numeroOrdens: ["OT-1"] }), ordemServicos: [{ ordemServicoId: 1 }] };
    tx.faturaOrdemServico.findMany.mockResolvedValue([{ faturaId: 10, fatura }]);
    await expect(issue()).resolves.toMatchObject({ alreadyEmitted: true, numeroFatura, numerosObra: ["OT-1"] });
    expect(tx.fatura.create).not.toHaveBeenCalled();
    expect(tx.ordemServico.update).not.toHaveBeenCalled();
  });

  test.each(["P2002", "P2034"])("concurrent issuance conflict %s never invents another number", async (code) => {
    tx.ordemServico.findMany.mockResolvedValue([{ ...order(), numeroOrdem: "FO022600020" }]);
    tx.fatura.findUnique.mockResolvedValue(null);
    tx.fatura.create.mockRejectedValueOnce({ code });
    await expect(issue()).rejects.toMatchObject({ status: 409 });
    expect(tx.fatura.create).toHaveBeenCalledTimes(1);
    expect(tx.faturaOrdemServico.create).not.toHaveBeenCalled();
  });

  test("requires real billing fields before creating a fiscal document", async () => {
    tx.ordemServico.findMany.mockResolvedValue([{ ...order(), metadados: null }]);
    await expect(issue()).rejects.toMatchObject({ status: 400 });
    expect(tx.fatura.create).not.toHaveBeenCalled();
  });

  test("freezes the document recipient and canonical lines without modifying the client", async () => {
    await issue();
    const frozen = JSON.parse(tx.fatura.create.mock.calls[0][0].data.metadados);
    expect(frozen.destinatario).toMatchObject({ nome: "Cliente", nif: "123456789", morada: "Rua real" });
    expect(frozen.ordensSnapshot).toEqual([expect.objectContaining({ id: 1, metadados: order().metadados, valorPecas: 100 })]);
    const summary = resumoFatura({ fatura: {
      metadados: JSON.stringify(frozen), cliente: { nome: "Alterado depois", nif: "999", morada: "Outra rua" },
      ordemServicos: [{ ordemServico: { ...order(), valorPecas: 999, metadados: "{}" } }],
    } } as never);
    expect(summary.clienteNome).toBe("Cliente");
    expect(summary.cliente.morada).toBe("Rua real");
    expect(summary.ordens[0].valorPecas).toBe(100);
    expect(summary.ordens[0].metadados).toBe(order().metadados);
  });

  test("does not combine different document recipients even for the same customer", async () => {
    tx.ordemServico.findMany.mockResolvedValue([
      { ...order(1), clienteId: 17 },
      { ...order(2), clienteId: 17, metadados: JSON.stringify({ destinatarioFaturacao: { nome: "Outro", nif: "987654321", morada: "Outra rua" } }) },
    ]);
    await expect(issue([1, 2])).rejects.toMatchObject({ status: 400 });
    expect(tx.fatura.create).not.toHaveBeenCalled();
  });

  test("rejects an order changed since the confirmation", async () => {
    tx.ordemServico.findMany.mockResolvedValue([{ ...order(), updatedAt: new Date("2026-10-26") }]);
    await expect(emitirFatura({ ordemServicoIds: [1], emitidaPor: "admin@test", updatedAt: "2026-10-25" })).rejects.toMatchObject({ status: 409 });
    expect(tx.fatura.create).not.toHaveBeenCalled();
  });

  test.each([{ linhas: [] }, { linhas: [{ descricao: "Servico", quantidade: 0, unitPrice: 10 }] }])("rejects empty or invalid canonical articles: %j", async ({ linhas }) => {
    const meta = JSON.parse(order().metadados);
    tx.ordemServico.findMany.mockResolvedValue([{ ...order(), metadados: JSON.stringify({ ...meta, linhas }) }]);
    await expect(issue()).rejects.toMatchObject({ status: 400 });
    expect(tx.fatura.create).not.toHaveBeenCalled();
  });

  test.each(["Rascunho", "Enviado", "Rejeitado"])("rejects unapproved quote %s", async (orcamentoStatus) => {
    tx.ordemServico.findMany.mockResolvedValue([{ ...order(), orcamentoStatus }]);
    await expect(issue()).rejects.toMatchObject({ status: 400 });
    expect(tx.fatura.create).not.toHaveBeenCalled();
  });

  test("selects approval status and creates initially paid receipt in the same transaction", async () => {
    await expect(issue([1], "Pago")).resolves.toMatchObject({ alreadyEmitted: false });
    expect(tx.ordemServico.findMany).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ orcamentoStatus: true }) }));
    expect(tx.recibo.create).toHaveBeenCalledWith({ data: expect.objectContaining({ faturaId: 10, valorPago: 100, pagamentoStatus: "Pago" }) });
  });

  test.each(["Pago Parcialmente", "invalid"])("rejects unsupported initial status %s", async (status) => {
    await expect(issue([1], status)).rejects.toMatchObject({ status: 400 });
    expect(tx.fatura.create).not.toHaveBeenCalled();
  });

  test("pending issuance has no receipt", async () => {
    await expect(issue()).resolves.toMatchObject({ alreadyEmitted: false });
    expect(tx.recibo.create).not.toHaveBeenCalled();
  });

  test("grouped issuance rejects orders without a resolved customer", async () => {
    tx.ordemServico.findMany.mockResolvedValue([order(1), order(2)]);
    await expect(issue([1, 2])).rejects.toMatchObject({ status: 400 });
    expect(tx.fatura.create).not.toHaveBeenCalled();
  });

  test.each([
    { isIsentoIva: false, codigoIsencaoIva: "M01" },
    { isIsentoIva: true, codigoIsencaoIva: "M02" },
    { isIsentoIva: true, codigoIsencaoIva: null },
  ])("grouped issuance rejects incompatible IVA representation %j", async (iva) => {
    tx.ordemServico.findMany.mockResolvedValue([
      { ...order(1), clienteId: 1, codigoIsencaoIva: "M01" },
      { ...order(2), clienteId: 1, ...iva },
    ]);
    await expect(issue([1, 2])).rejects.toMatchObject({ status: 400 });
    expect(tx.fatura.create).not.toHaveBeenCalled();
    expect(tx.recibo.create).not.toHaveBeenCalled();
  });

  test("grouped issuance accepts a shared customer and matching IVA representation", async () => {
    tx.ordemServico.findMany.mockResolvedValue([1, 2].map((id) => ({ ...order(id), clienteId: 1, codigoIsencaoIva: "M01" })));
    await expect(issue([1, 2])).resolves.toMatchObject({ alreadyEmitted: false });
    expect(tx.fatura.create).toHaveBeenCalledWith({ data: expect.objectContaining({ clienteId: 1, isIsentoIva: true, codigoIsencaoIva: "M01", valorTotal: 200 }) });
  });

  test("exact existing grouped order set is idempotent regardless of order", async () => {
    tx.ordemServico.findMany.mockResolvedValue([order(1), order(2)]);
    const fatura = { id: 10, numeroFatura: "FAT-1", cancelada: false, ordemServicos: [{ ordemServicoId: 1 }, { ordemServicoId: 2 }] };
    tx.faturaOrdemServico.findMany.mockResolvedValue([1, 2].map((ordemServicoId) => ({ ordemServicoId, faturaId: 10, fatura })));
    await expect(issue([2, 1])).resolves.toMatchObject({ alreadyEmitted: true });
    expect(tx.fatura.create).not.toHaveBeenCalled();
  });

  test.each(["mixed", "subset", "different", "cancelled"])("rejects existing invoice composition: %s", async (kind) => {
    tx.ordemServico.findMany.mockResolvedValue([order(1), order(2)]);
    const fatura = { id: 10, numeroFatura: "FAT-1", cancelada: kind === "cancelled", ordemServicos: [{ ordemServicoId: 1 }, { ordemServicoId: 2 }, ...(kind === "subset" ? [{ ordemServicoId: 3 }] : [])] };
    tx.faturaOrdemServico.findMany.mockResolvedValue([
      { ordemServicoId: 1, faturaId: 10, fatura },
      ...(kind === "mixed" ? [] : [{ ordemServicoId: 2, faturaId: kind === "different" ? 11 : 10, fatura }]),
    ]);
    await expect(issue([1, 2])).rejects.toMatchObject({ status: 409 });
    expect(tx.fatura.create).not.toHaveBeenCalled();
  });

  test("receipt failure rejects the issuance transaction", async () => {
    tx.recibo.create.mockRejectedValueOnce(new Error("receipt failure"));
    await expect(issue([1], "Pago")).rejects.toThrow("receipt failure");
    expect(tx.faturaOrdemServico.create).not.toHaveBeenCalled();
  });
});

test.each(["P2034", "P2002"])("financial conflict %s is surfaced without retry", async (code) => {
  transaction.mockRejectedValueOnce({ code });
  await expect(payment("Pago")).rejects.toMatchObject({ status: 409 });
  expect(transaction).toHaveBeenCalledTimes(1);
});

describe("billing API contracts and authorization", () => {
  const context = { params: Promise.resolve({ id: "10" }) };
  const request = (body: object = {}) => new NextRequest("http://localhost/api/ordens-servico/10/faturar", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });

  test.each([false, true])("issuance API exposes frozen work references, grouped=%s", async (grouped) => {
    jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: true, email: "admin@test" } as never);
    tx.ordemServico.findMany.mockResolvedValue([{ ...order(), numeroOrdem: "FO022600020" }]);
    tx.fatura.findUnique.mockResolvedValue(null);
    const response = await (grouped ? issueGroupedInvoice : issueInvoice)(request({ ordemServicoIds: [1] }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ numeroFatura: "FT0226000020", numeroObra: "FO022600020", numerosObra: ["FO022600020"], alreadyEmitted: false });
  });

  test("listing exposes the issued references, never a later live work number", async () => {
    jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: true } as never);
    jest.mocked(prisma.fatura.findMany).mockResolvedValue([{
      ...invoice(), metadados: JSON.stringify({ numeroObra: "FO022600020", numerosObra: ["FO022600020"] }),
      ordemServicos: [{ ordemServico: { id: 1, numeroOrdem: "FO012700999" } }], notaCredito: null,
    }] as never);
    const response = await listInvoices(new NextRequest("http://localhost/api/faturas"));
    expect((await response.json()).faturas[0]).toMatchObject({ numeroObra: "FO022600020", numerosObra: ["FO022600020"] });
  });

  test("listing and summary prefer Navision display while retaining original FT and amounts", async () => {
    jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: true } as never);
    const recorded = { ...invoice(), numeroFatura: "FT0226000020", updatedAt: new Date("2026-10-26T12:00:00Z"),
      metadados: JSON.stringify({ numeroFaturaOficial: "NAV-2026/70", sistemaOrigem: "Navision", numerosObra: ["FO022600020"],
        pdfOficial: { key: "private-locator", storage: "encrypted-blob", filename: "official.pdf", sha256: "digest", size: 100 } }),
      ordemServicos: [], notaCredito: null };
    jest.mocked(prisma.fatura.findMany).mockResolvedValue([recorded] as never);
    const response = await listInvoices(new NextRequest("http://localhost/api/faturas"));
    const body = await response.json();
    expect(body.faturas[0]).toMatchObject({ numeroFatura: "FT0226000020", numeroFaturaInterno: "FT0226000020",
      numeroFaturaDisplay: "NAV-2026/70", numeroFaturaOficial: "NAV-2026/70", sistemaOrigem: "Navision", valorTotal: 100, numerosObra: ["FO022600020"] });
    expect(JSON.stringify(body)).not.toContain("private-locator");
    expect(resumoFatura({ fatura: recorded } as never)).toMatchObject({ numeroFatura: "FT0226000020", numeroFaturaDisplay: "NAV-2026/70", total: 100 });
    expect(transaction).not.toHaveBeenCalled();
  });

  test.each([null, { isAdmin: false }])("denies listing, payment, issuance and cancellation for %j", async (access) => {
    jest.mocked(getAccessContext).mockResolvedValue(access as never);
    const expectedStatus = access ? 403 : 401;
    expect((await listInvoices(new NextRequest("http://localhost/api/faturas"))).status).toBe(expectedStatus);
    expect((await payInvoice(request(), context)).status).toBe(expectedStatus);
    expect((await issueInvoice(request())).status).toBe(expectedStatus);
    expect((await issueGroupedInvoice(request())).status).toBe(expectedStatus);
    expect((await cancelInvoice(request(), context)).status).toBe(expectedStatus);
    expect(transaction).not.toHaveBeenCalled();
    expect(prisma.fatura.findMany).not.toHaveBeenCalled();
  });

  test("payment response exposes the real receipt and cumulative balance", async () => {
    jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: true, email: "admin@test" } as never);
    const response = await payInvoice(request({ pagamentoStatus: "Pago" }), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ numeroRecibo: "REC-2", valorPago: 100, valorPendente: 0 });
  });

  test.each([true, "10", null, {}, []])("rejects nonnumeric payment amount %j", async (valorPago) => {
    jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: true } as never);
    expect((await payInvoice(request({ pagamentoStatus: "Pago Parcialmente", valorPago }), context)).status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
  });

  test.each(["clienteId=invalid", "clienteId=1.5", "dataInicio=invalid", "dataInicio=2026-10-24&dataFim=2026-10-01", "pagamentoStatus=invalid"])("rejects invalid invoice filter %s", async (query) => {
    jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: true } as never);
    expect((await listInvoices(new NextRequest(`http://localhost/api/faturas?${query}`))).status).toBe(400);
    expect(prisma.fatura.findMany).not.toHaveBeenCalled();
  });

  test("payment response exposes a historical paid invoice without manufacturing a receipt", async () => {
    jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: true } as never);
    tx.fatura.findUnique.mockResolvedValue({ ...invoice(0), pagamentoStatus: "Pago" });
    const response = await payInvoice(request({ pagamentoStatus: "Pago" }), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      numeroRecibo: null, valorPago: 0, valorPendente: 0, pagamentoHistoricoSemRecibo: true,
      fatura: { pagamentoStatus: "Pago", pagamentoHistoricoSemRecibo: true },
    });
    expect(tx.recibo.create).not.toHaveBeenCalled();
  });

  test("listing totals partial and overdue outstanding amounts, excluding cancelled balances", async () => {
    jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: true } as never);
    jest.mocked(prisma.fatura.findMany).mockResolvedValue([
      { ...invoice(), ordemServicos: [], notaCredito: null },
      { ...invoice(20), id: 11, pagamentoStatus: "Vencido", ordemServicos: [], notaCredito: null },
      { ...invoice(0), id: 12, cancelada: true, ordemServicos: [], notaCredito: null },
      { ...invoice(0), id: 13, pagamentoStatus: "Pago", ordemServicos: [], notaCredito: null },
      { ...invoice(0), id: 14, pagamentoStatus: "Pendente", ordemServicos: [], notaCredito: null },
      { ...invoice(130), id: 15, pagamentoStatus: "Pago", ordemServicos: [], notaCredito: null },
      { ...invoice(30), id: 16, pagamentoStatus: "Pago", ordemServicos: [], notaCredito: null },
    ] as never);
    const response = await listInvoices(new NextRequest("http://localhost/api/faturas?incluirCanceladas=true"));
    const body = await response.json();
    expect(body.totalPendente).toBe(250);
    expect(body.faturas).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 10, valorPago: 30, valorPendente: 70 }),
      expect.objectContaining({ id: 11, valorPago: 20, valorPendente: 80 }),
      expect.objectContaining({ id: 12, valorPendente: 0 }),
      expect.objectContaining({ id: 13, pagamentoStatus: "Pago", valorPago: 0, valorPendente: 0, pagamentoHistoricoSemRecibo: true }),
      expect.objectContaining({ id: 14, valorPago: 0, valorPendente: 100, pagamentoHistoricoSemRecibo: false }),
      expect.objectContaining({ id: 15, valorPago: 130, valorPendente: 0, pagamentoHistoricoSemRecibo: false }),
      expect.objectContaining({ id: 16, valorPago: 30, valorPendente: 0, pagamentoHistoricoSemRecibo: true }),
    ]));
  });
});
