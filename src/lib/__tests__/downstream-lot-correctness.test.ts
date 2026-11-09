import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLotStock } from "@/lib/ordens-servico";
import { reverterMovimentosInspecao } from "@/lib/stock/inspecao-sync";
import { POST, DELETE } from "@/app/api/ordens-servico/[id]/materiais/route";
import { POST as replaceArticle } from "@/app/api/jangadas/substituir-artigo/route";
import { POST as replaceHru } from "@/app/api/jangadas/substituir-hru/route";

jest.mock("@/lib/prisma", () => ({ __esModule: true, default: {
  stock: { findMany: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
  ordemServico: { findUnique: jest.fn(), update: jest.fn() },
  movimentacaoStock: { create: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn() },
  jangada: { findUnique: jest.fn(), update: jest.fn() },
  artigoJangada: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
  inspecao: { findFirst: jest.fn(), update: jest.fn() },
  auditoria: { create: jest.fn() },
  $transaction: jest.fn(),
} }));
jest.mock("@/lib/agenda-sync", () => ({ parseFlexibleDate: jest.fn() }));
jest.mock("@/lib/access-control", () => ({ getAccessContext: jest.fn(async () => ({ email: "tecnico@orey.pt", isAdmin: true, allowedStationIds: [] })) }));
jest.mock("@/lib/database-errors", () => ({ buildDatabaseErrorResponse: (error: Error) => Response.json({ error: error.message }, { status: 400 }) }));

const db = prisma as unknown as {
  stock: Record<string, jest.Mock>;
  ordemServico: Record<string, jest.Mock>;
  movimentacaoStock: Record<string, jest.Mock>;
  $transaction: jest.Mock;
};
let rows: Array<Record<string, any>>;
let order: Record<string, any>;
let movements: Array<Record<string, any>>;
const request = (body: object, method = "POST") => new NextRequest("http://localhost/api/ordens-servico/9/materiais", { method, body: JSON.stringify(body) });

beforeEach(() => {
  jest.clearAllMocks();
  rows = [
    { id: 1, referencia: "FLARE", descricao: "Flare", lote: "A", validade: "2028-01", serviceStationId: 7, quantidade: 10, quantidadeReservada: 0 },
    { id: 2, referencia: "FLARE", descricao: "Flare", lote: "B", validade: "2029-01", serviceStationId: 7, quantidade: 10, quantidadeReservada: 0 },
    { id: 3, referencia: "FLARE", descricao: "Flare", lote: "C", validade: "2030-01", serviceStationId: 8, quantidade: 10, quantidadeReservada: 0 },
  ];
  order = { id: 9, numeroOrdem: "OT-9", serviceStationId: 7, metadados: JSON.stringify({ materials: [{ id: "b", stockId: 2, referencia: "FLARE", lote: "B-snapshot", quantidadePrevista: 2, quantidadeUsada: 2 }] }) };
  movements = [];
  db.$transaction.mockImplementation(async callback => callback(prisma));
  db.stock.findMany.mockImplementation(async ({ where }) => rows.filter(row =>
    (where.serviceStationId === undefined || row.serviceStationId === where.serviceStationId) &&
    (!where.OR || where.OR.some((scope: { serviceStationId: number | null }) => row.serviceStationId === scope.serviceStationId)) &&
    (where.referencia === undefined || row.referencia === where.referencia) &&
    (where.id === undefined || (typeof where.id === "number" ? row.id === where.id : where.id.in.includes(row.id)))).map(row => ({ ...row })));
  db.stock.findUnique.mockImplementation(async ({ where }) => { const row = rows.find(row => row.id === where.id); return row ? { ...row } : null; });
  const apply = (row: Record<string, any>, data: Record<string, any>) => {
    for (const [key, value] of Object.entries(data)) row[key] = typeof value === "object" ? row[key] + (value.increment ?? -value.decrement) : value;
  };
  db.stock.updateMany.mockImplementation(async ({ where, data }) => {
    const row = rows.find(row => row.id === where.id);
    if (!row || (where.quantidadeReservada !== undefined && row.quantidadeReservada !== where.quantidadeReservada)) return { count: 0 };
    if (where.quantidade?.gte !== undefined && row.quantidade < where.quantidade.gte) return { count: 0 };
    apply(row, data);
    return { count: 1 };
  });
  db.stock.update.mockImplementation(async ({ where, data }) => { const row = rows.find(row => row.id === where.id)!; apply(row, data); return row; });
  db.ordemServico.findUnique.mockImplementation(async () => ({ ...order }));
  db.ordemServico.update.mockImplementation(async ({ data }) => { Object.assign(order, data); return order; });
  db.movimentacaoStock.create.mockImplementation(async ({ data }) => { movements.push({ ...data }); return data; });
  db.movimentacaoStock.findMany.mockImplementation(async ({ where }) => movements.filter(m => m.inspecaoId === where.inspecaoId && where.tipo.in.includes(m.tipo)));
  db.movimentacaoStock.deleteMany.mockImplementation(async ({ where }) => { movements = movements.filter(m => !(m.inspecaoId === where.inspecaoId && where.tipo.in.includes(m.tipo))); return { count: 1 }; });
});

test("explicit B resolves independently of same-reference A; cross-station IDs never fall back", async () => {
  expect(await resolveLotStock(prisma, { stockId: 2, referencia: "FLARE" }, 7)).toMatchObject({ id: 2, lote: "B" });
  await expect(resolveLotStock(prisma, { stockId: 3, referencia: "FLARE" }, 7)).rejects.toThrow("estacao");
  await expect(resolveLotStock(prisma, { stockId: 99, referencia: "FLARE" }, 7)).rejects.toThrow("estacao");
});

test("a concrete station accepts the exact general lot, including historical lookups", async () => {
  rows.push({ ...rows[1], id: 4, serviceStationId: null, lote: "GENERAL" });
  for (const historical of [false, true]) {
    expect(await resolveLotStock(prisma, { stockId: 4, referencia: "FLARE" }, 7, historical))
      .toMatchObject({ id: 4, serviceStationId: null, lote: "GENERAL" });
    await expect(resolveLotStock(prisma, { stockId: 3, referencia: "FLARE" }, 7, historical)).rejects.toThrow("estacao");
  }
  await expect(resolveLotStock(prisma, { stockId: 99, referencia: "FLARE" }, 7)).rejects.toThrow("estacao");
  expect(await resolveLotStock(prisma, { stockId: 99, referencia: "FLARE" }, 7, true)).toBeNull();
  await expect(resolveLotStock(prisma, { stockId: 4, referencia: "OTHER" }, 7)).rejects.toThrow("referencia");
});

test("general scope does not accept station stock and legacy lookup includes general rows", async () => {
  rows.push({ id: 4, referencia: "PADDLE", descricao: "Paddle", lote: "", validade: null, serviceStationId: null });
  expect(await resolveLotStock(prisma, { referencia: "PADDLE" }, 7)).toMatchObject({ id: 4 });
  expect(await resolveLotStock(prisma, { stockId: 4 }, null)).toMatchObject({ id: 4 });
  await expect(resolveLotStock(prisma, { stockId: 2 }, null)).rejects.toThrow("estacao");
  rows.push({ ...rows[3], id: 5, serviceStationId: 7 });
  await expect(resolveLotStock(prisma, { referencia: "PADDLE" }, 7)).rejects.toThrow("stockId");
});

test("dated and ambiguous references require a concrete row; unambiguous non-dated legacy refs work", async () => {
  await expect(resolveLotStock(prisma, { referencia: "FLARE" }, 7)).rejects.toThrow("stockId");
  rows = [rows[1]];
  await expect(resolveLotStock(prisma, { referencia: "FLARE" }, 7)).rejects.toThrow("stockId");
  rows = [{ id: 4, referencia: "PADDLE", descricao: "Paddle", lote: "", validade: null, serviceStationId: 7 }];
  expect(await resolveLotStock(prisma, { referencia: "PADDLE" }, 7)).toMatchObject({ id: 4 });
});

test("missing historical ID remains missing instead of rebinding to A or B", async () => {
  expect(await resolveLotStock(prisma, { stockId: 99, referencia: "FLARE" }, 7, true)).toBeNull();
  await expect(resolveLotStock(prisma, { stockId: 3, referencia: "FLARE" }, 7, true)).rejects.toThrow("estacao");
});

test("reserve, repeat, release B leaves A untouched and retains the lot snapshot", async () => {
  expect((await POST(request({ action: "reserve", materialId: "b" }))).status).toBe(200);
  expect((await POST(request({ action: "reserve", materialId: "b" }))).status).toBe(200);
  expect(rows[1].quantidadeReservada).toBe(2);
  expect(JSON.parse(order.metadados).materials[0].lote).toBe("B-snapshot");
  expect((await DELETE(request({ materialId: "b" }, "DELETE"))).status).toBe(200);
  expect(rows[1].quantidadeReservada).toBe(0);
  expect(rows[0]).toMatchObject({ quantidade: 10, quantidadeReservada: 0 });
  expect(movements.every(m => m.stockId === 2)).toBe(true);
});

test("only B is consumed once after reservation; inspection reversal restores B not A", async () => {
  await POST(request({ action: "reserve", materialId: "b" }));
  rows[1].lote = "edited-catalogue-lot";
  expect((await POST(request({ action: "consume", materialId: "b" }))).status).toBe(200);
  expect((await POST(request({ action: "consume", materialId: "b" }))).status).toBe(200);
  expect(rows[1]).toMatchObject({ quantidade: 8, quantidadeReservada: 0 });
  expect(rows[0]).toMatchObject({ quantidade: 10, quantidadeReservada: 0 });
  expect(JSON.parse(order.metadados).materials[0].lote).toBe("B-snapshot");
  movements.forEach(m => { m.inspecaoId = 40; });
  await reverterMovimentosInspecao(prisma, 40);
  await reverterMovimentosInspecao(prisma, 40);
  expect(rows[1]).toMatchObject({ quantidade: 10, quantidadeReservada: 0 });
  expect(rows[0]).toMatchObject({ quantidade: 10, quantidadeReservada: 0 });
});

test("cannot consume or reserve more than chosen B or use a cross-station material", async () => {
  rows[1].quantidade = 1;
  expect((await POST(request({ action: "reserve", materialId: "b" }))).status).toBe(400);
  expect((await POST(request({ action: "consume", materialId: "b" }))).status).toBe(400);
  expect(rows[0].quantidade).toBe(10);
  expect(movements).toEqual([]);
  const meta = JSON.parse(order.metadados); meta.materials[0].stockId = 3; order.metadados = JSON.stringify(meta);
  expect((await POST(request({ action: "consume", materialId: "b" }))).status).toBe(400);
  expect(movements).toEqual([]);
});

test("inspection material sync retains A/B rows, deleted historical IDs and saved lots", async () => {
  order.metadados = "{}";
  order.inspecao = { certificadoNumero: "AZ-40", artigos: [
    { id: 11, stockId: 1, referencia: "FLARE", name: "Flare A", quantidade: 1 },
    { id: 12, stockId: 2, referencia: "FLARE", name: "Flare B", quantidade: 2 },
    { id: 13, stockId: 99, referencia: "FLARE", name: "Deleted lot", quantidade: 1 },
  ], checklistSnapshot: { _articleExpiry: { replacements: [
    { stockId: 1, lote: "original-A" }, { stockId: 2, lote: "original-B" }, { stockId: 99, lote: "historical-lot" },
  ] } } };
  const response = await POST(request({ action: "sync_inspection" }));
  expect(response.status).toBe(200);
  expect((await response.json()).materials).toEqual(expect.arrayContaining([
    expect.objectContaining({ stockId: 1, lote: "original-A" }),
    expect.objectContaining({ stockId: 2, lote: "original-B" }),
    expect.objectContaining({ stockId: 99, lote: "historical-lot" }),
  ]));
  await POST(request({ action: "sync_inspection" }));
  expect(JSON.parse(order.metadados).materials).toHaveLength(3);
  expect(db.stock.updateMany).not.toHaveBeenCalled();
});

test("replacement consumes selected B, preserves A budget line and snapshots B", async () => {
  const raft = prisma.jangada.findUnique as jest.Mock;
  const articles = prisma.artigoJangada;
  const inspections = prisma.inspecao;
  raft.mockResolvedValue({ serviceStationId: 7 });
  (articles.findMany as jest.Mock).mockResolvedValue([{ id: 20, jangadaId: 5, quantidade: 2, stockId: 1, name: "Old flare" }]);
  (articles.findFirst as jest.Mock).mockResolvedValue(null);
  (articles.update as jest.Mock).mockImplementation(async ({ data }) => ({ id: 20, ...data }));
  (inspections.findFirst as jest.Mock).mockResolvedValue({ id: 40, checklistSnapshot: { unrelated: "kept" }, orcamento: { linhas: [{ stockId: 1, referencia: "FLARE", quantidade: 1 }] } });
  rows[1].precoVenda = 5;
  const response = await replaceArticle(new NextRequest("http://localhost/api/jangadas/substituir-artigo", { method: "POST", body: JSON.stringify({ jangadaId: 5, artigoId: 20, novaReferencia: "FLARE", stockId: 2, quantidade: 2 }) }));
  expect(response.status).toBe(200);
  expect(rows[0].quantidade).toBe(10);
  expect(rows[1].quantidade).toBe(8);
  expect(inspections.update).toHaveBeenCalledWith(expect.objectContaining({ data: { checklistSnapshot: expect.objectContaining({ unrelated: "kept", _articleExpiry: expect.objectContaining({ replacements: [expect.objectContaining({ stockId: 2, lote: "B" })] }) }) } }));
  expect(inspections.update).toHaveBeenCalledWith(expect.objectContaining({ data: { orcamento: expect.objectContaining({ linhas: [expect.objectContaining({ stockId: 1 }), expect.objectContaining({ stockId: 2, lote: "B" })] }) } }));
  expect(prisma.auditoria.create).toHaveBeenCalledWith({ data: expect.objectContaining({
    tabela: "JangadaEquipment", idRegisto: 5, usuario: "tecnico@orey.pt",
    dadosDepois: expect.stringContaining('"validade":"2029-01-01"'),
  }) });
  expect(prisma.movimentacaoStock.create).toHaveBeenCalledWith({ data: expect.objectContaining({ usuario: "tecnico@orey.pt" }) });
});

test("HRU replacement records the exact selected lot in article and inspection JSON", async () => {
  (prisma.jangada.findUnique as jest.Mock).mockResolvedValue({ id: 5, serial: "RAFT", serviceStationId: 7 });
  (prisma.jangada.update as jest.Mock).mockImplementation(async ({ data }) => ({ id: 5, ...data }));
  (prisma.artigoJangada.findFirst as jest.Mock).mockResolvedValue(null);
  (prisma.inspecao.findFirst as jest.Mock).mockResolvedValue({ id: 40, checklistSnapshot: {} });
  const response = await replaceHru(new NextRequest("http://localhost/api/jangadas/substituir-hru", { method: "POST", body: JSON.stringify({ jangadaId: 5, novaReferencia: "FLARE", stockId: 2, dataInstalacao: "2026-10-25" }) }));
  expect(response.status).toBe(200);
  expect(rows[0].quantidade).toBe(10);
  expect(rows[1].quantidade).toBe(9);
  expect(prisma.artigoJangada.create).toHaveBeenCalledWith({ data: expect.objectContaining({ stockId: 2 }) });
  expect(prisma.inspecao.update).toHaveBeenCalledWith(expect.objectContaining({ data: { checklistSnapshot: expect.objectContaining({ _articleExpiry: expect.objectContaining({ replacements: [expect.objectContaining({ stockId: 2, lote: "B" })] }) }) } }));
  expect(prisma.auditoria.create).toHaveBeenCalledWith({ data: expect.objectContaining({
    tabela: "JangadaEquipment", idRegisto: 5, usuario: "tecnico@orey.pt",
    dadosDepois: expect.stringContaining('"hruValidade":"2028-10-25"'),
  }) });
});

test.each([undefined, 3])("replacement rejects ambiguous reference or cross-station ID %s without writes", async stockId => {
  (prisma.jangada.findUnique as jest.Mock).mockResolvedValue({ id: 5, serviceStationId: 7 });
  (prisma.artigoJangada.findMany as jest.Mock).mockResolvedValue([{ id: 20, jangadaId: 5, quantidade: 2 }]);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    const response = await replaceArticle(new NextRequest("http://localhost/api/jangadas/substituir-artigo", { method: "POST", body: JSON.stringify({ jangadaId: 5, artigoId: 20, novaReferencia: "FLARE", stockId, quantidade: 2 }) }));
    expect(response.status).toBe(400);
    expect(db.stock.updateMany).not.toHaveBeenCalled();
    expect(prisma.artigoJangada.update).not.toHaveBeenCalled();
    expect(movements).toEqual([]);
  } finally {
    jest.restoreAllMocks();
  }
});
