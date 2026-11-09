import { NextRequest } from "next/server";
import { GET, PUT, PATCH } from "@/app/api/ordens-servico/[id]/route";
import { getAccessContext } from "../access-control";
import prisma from "../prisma";

jest.mock("../access-control", () => ({ getAccessContext: jest.fn() }));
jest.mock("../auditoria", () => ({ logAuditoria: jest.fn() }));
jest.mock("../agenda-sync", () => ({ syncNextInspectionAgenda: jest.fn(), parseFlexibleDate: jest.fn() }));
jest.mock("../ordens-servico", () => ({
  ...jest.requireActual("../ordens-servico"),
  syncPedidoAssistenciaFromOrdem: jest.fn(),
}));
jest.mock("../prisma", () => ({ __esModule: true, default: {
  ordemServico: { findUnique: jest.fn(), update: jest.fn() },
  ordemServicoLog: { create: jest.fn(), createMany: jest.fn() },
  faturaOrdemServico: { findFirst: jest.fn() },
  $transaction: jest.fn(),
} }));

const before = {
  id: 42, numeroOrdem: "OT-42", status: "pendente", orcamentoStatus: "Rascunho",
  serviceStationId: 2, valorPecas: 10, valorMaoObra: 0, valorDesconto: 0, valorTotal: 11.6,
  isPesca: false, isIsentoIva: false, codigoIsencaoIva: null,
  updatedAt: new Date("2026-01-01T00:00:00Z"), metadados: JSON.stringify({ observacao: "legacy", linhas: [{ id: "a", stockId: 3, consumido: true, quantidade: 1, unitPrice: 10, total: 10 }] }),
};
const request = (method: string, body: object = {}) => new NextRequest("http://localhost/api/ordens-servico/42", {
  method, ...(method === "GET" ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
});

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: true, email: "admin@test", allowedStationIds: [], stationId: null } as never);
  jest.mocked(prisma.ordemServico.findUnique).mockResolvedValue(before as never);
  jest.mocked(prisma.ordemServico.update).mockImplementation((({ data }: { data: object }) => {
    const updated = { ...before, ...data };
    jest.mocked(prisma.ordemServico.findUnique).mockResolvedValue(updated as never);
    return Promise.resolve(updated);
  }) as never);
  jest.mocked(prisma.$transaction).mockImplementation(async (callback: unknown) => (callback as (tx: typeof prisma) => unknown)(prisma) as never);
});

it.each([GET, PUT, PATCH])("requires a session", async (handler) => {
  jest.mocked(getAccessContext).mockResolvedValue(null);
  expect((await handler(request(handler === GET ? "GET" : handler === PUT ? "PUT" : "PATCH"))).status).toBe(401);
  expect(prisma.ordemServico.findUnique).not.toHaveBeenCalled();
});

it.each([PUT, PATCH])("blocks every invoice financial shape before writes", async (handler) => {
  jest.mocked(prisma.faturaOrdemServico.findFirst).mockResolvedValue({ fatura: { id: 1, numeroFatura: "F1" } } as never);
  for (const body of [{ linhas: [] }, { metadados: { linhas: [] } }, { codigoIsencaoIva: "M01" }, { orcamentoStatus: "Rejeitado" }]) {
    expect((await handler(request(handler === PUT ? "PUT" : "PATCH", body))).status).toBe(400);
  }
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it.each([PUT, PATCH])("does not allow quote requests to invent invoice references or payment statuses", async handler => {
  for (const body of [{ metadados: { faturaNumero: "FT-invented" } }, { metadados: { pagamentoStatus: "Pago" } }]) {
    expect((await handler(request(handler === PUT ? "PUT" : "PATCH", body))).status).toBe(400);
  }
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it("saves lines and approval together, guards the write and returns parsed metadata", async () => {
  const response = await PATCH(request("PATCH", {
    linhas: [{ id: "a", quantidade: 2, unitPrice: 3.335, total: 999 }],
    valorPecas: 999, orcamentoStatus: "aprovado", updatedAt: before.updatedAt.toISOString(),
  }));
  expect(response.status).toBe(200);
  expect(prisma.ordemServico.update).toHaveBeenCalledWith({
    where: { id: 42, updatedAt: before.updatedAt },
    data: expect.objectContaining({ valorPecas: 6.67, orcamentoStatus: "Aprovado" }),
  });
  expect(await response.json()).toMatchObject({ orcamentoStatus: "Aprovado", metadados: {
    observacao: "legacy", linhas: [expect.objectContaining({ id: "a", stockId: 3, consumido: true, total: 6.67 })],
  } });
  expect(prisma.ordemServicoLog.create).toHaveBeenCalled();
});

it.each([PUT, PATCH])("persists net lines and applies the existing global discount afterwards", async handler => {
  const response = await handler(request(handler === PUT ? "PUT" : "PATCH", {
    linhas: [
      { id: "a", quantidade: 3, unitPrice: 1.115, descontoPercentual: 10, total: 999 },
      { id: "free", quantidade: 2, unitPrice: 50, descontoPercentual: 100, total: 999 },
    ],
    valorPecas: 999, valorMaoObra: 10, valorDesconto: 2,
  }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ valorPecas: 3.01, valorDesconto: 2, valorTotal: 12.77,
    metadados: { linhas: [
      expect.objectContaining({ id: "a", descontoPercentual: 10, total: 3.01, stockId: 3, consumido: true }),
      expect.objectContaining({ id: "free", descontoPercentual: 100, total: 0 }),
    ], totais: { subtotal: 11.01, iva: 1.76, totalComIva: 12.77 } },
  });
  const reopened = await GET(request("GET"));
  expect(await reopened.json()).toMatchObject({ metadados: { linhas: [
    expect.objectContaining({ descontoPercentual: 10, total: 3.01 }),
    expect.objectContaining({ descontoPercentual: 100, total: 0 }),
  ] } });
});

it.each([PUT, PATCH])("rejects out-of-range discounts in both financial request shapes", async handler => {
  for (const descontoPercentual of [-1, 101, null, "NaN"]) {
    const linhas = [{ id: "a", quantidade: 1, unitPrice: 10, descontoPercentual }];
    for (const body of [{ linhas }, { metadados: { linhas } }]) {
      expect((await handler(request(handler === PUT ? "PUT" : "PATCH", body))).status).toBe(400);
    }
  }
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it("returns conflict when the conditional write loses a race", async () => {
  jest.mocked(prisma.ordemServico.update).mockRejectedValue({ code: "P2025" });
  expect((await PATCH(request("PATCH", { orcamentoStatus: "Aprovado", updatedAt: before.updatedAt.toISOString() }))).status).toBe(409);
  expect(prisma.ordemServicoLog.create).not.toHaveBeenCalled();
});

it("rejects invalid dates and statuses before writes", async () => {
  for (const body of [{ updatedAt: "no" }, { orcamentoStatus: "no" }, { linhas: [{ quantidade: -1, unitPrice: 2 }] }]) {
    expect((await PATCH(request("PATCH", body))).status).toBe(400);
  }
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it("blocks financial changes for a regular user and scopes technical PUT", async () => {
  jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: false, email: "tech@test", allowedStationIds: [2], stationId: 2 } as never);
  expect((await PUT(request("PUT", { valorPecas: 30 }))).status).toBe(403);
  expect(prisma.$transaction).not.toHaveBeenCalled();
  expect((await PUT(request("PUT", { descricao: "Technical update" }))).status).toBe(200);
  expect(prisma.ordemServico.update).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 42, serviceStationId: { in: [2] }, updatedAt: before.updatedAt },
    data: expect.objectContaining({ descricao: "Technical update" }),
  }));
});

it("GET exposes financial scalars and parsed metadata", async () => {
  const response = await GET(request("GET"));
  expect(await response.json()).toMatchObject({ valorPecas: 10, valorMaoObra: 0, valorDesconto: 0, valorTotal: 11.6, orcamentoStatus: "Rascunho", metadados: { observacao: "legacy" } });
});

it.each(["linhas", "metadados"])("PUT uses canonical normalization for %s", async (shape) => {
  const linhas = [{ id: "a", quantidade: 2, unitPrice: 4, total: 999 }];
  const response = await PUT(request("PUT", shape === "linhas" ? { linhas } : { metadados: { linhas } }));
  expect(response.status).toBe(200);
  expect(prisma.ordemServico.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
    valorPecas: 8, metadados: expect.any(String),
  }) }));
  expect(await response.json()).toMatchObject({ metadados: { linhas: [expect.objectContaining({ total: 8, stockId: 3, consumido: true })] } });
});

it("does not rewrite unchanged legacy invoice lines during technical PUT", async () => {
  const legacy = { ...before, metadados: JSON.stringify({ linhas: [{ descricao: "Old total only", total: 10 }] }) };
  jest.mocked(prisma.ordemServico.findUnique).mockResolvedValue(legacy as never);
  jest.mocked(prisma.faturaOrdemServico.findFirst).mockResolvedValue({ fatura: { id: 1, numeroFatura: "F1" } } as never);
  jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: false, email: "tech@test", allowedStationIds: [2], stationId: 2 } as never);
  const response = await PUT(request("PUT", { descricao: "Technical update", metadados: JSON.parse(legacy.metadados) }));
  expect(response.status).toBe(200);
  expect(prisma.ordemServico.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
    valorPecas: before.valorPecas, valorTotal: before.valorTotal,
  }) }));
});

it("updates workflow when operational status changes instead of keeping a stale workflow", async () => {
  jest.mocked(prisma.ordemServico.findUnique).mockResolvedValue({ ...before,
    metadados: JSON.stringify({ workflowStatus: "orcamento_em_preparacao" }),
  } as never);
  const response = await PUT(request("PUT", { status: "em_progresso" }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ status: "em_progresso", workflowStatus: "em_execucao" });
});

it.each([PUT, PATCH])("returns a client error for malformed JSON", async handler => {
  const response = await handler(new NextRequest("http://localhost/api/ordens-servico/42", {
    method: handler === PUT ? "PUT" : "PATCH", body: "{",
  }));
  expect(response.status).toBe(400);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it.each([{ status: "inventado" }, { workflowStatus: "inventado" }])("does not silently replace an invalid operational status with a default", async body => {
  expect((await PUT(request("PUT", body))).status).toBe(400);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});
