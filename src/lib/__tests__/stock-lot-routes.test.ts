import { NextRequest } from "next/server";
import { PUT } from "@/app/api/stock/[id]/route";
import { GET as barcode } from "@/app/api/stock/by-barcode/route";
import { POST as bulkImport } from "@/app/api/stock/importar-lote/route";
import { POST as create } from "@/app/api/stock/route";
import { getAccessContext } from "@/lib/access-control";
import prisma from "@/lib/prisma";

jest.mock("@/lib/access-control", () => ({ getAccessContext: jest.fn() }));
jest.mock("@/lib/user-permissions", () => ({ canEditPath: () => true, canViewPath: () => true }));
jest.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true }) }));
jest.mock("@/lib/prisma", () => ({ __esModule: true, default: {
  $transaction: jest.fn(), stock: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), findMany: jest.fn(), update: jest.fn(), create: jest.fn() },
  movimentacaoStock: { findFirst: jest.fn(), create: jest.fn() }, artigoJangada: { findFirst: jest.fn() },
} }));

const current = { id: 41, referencia: "CUSTOM-LEGACY-REF", descricao: "Hand flare", categoria: "PIROTECNICOS",
  serviceStationId: 7, lote: "A", validade: "2028-01", codigoBarras: "BAR-A", quantidade: 12, quantidadeReservada: 3,
  observacoes: null, updatedAt: new Date("2026-01-01"), estadoArtigo: "ATIVO" };
const context = { params: Promise.resolve({ id: "41" }) };
const req = (method: string, body: unknown) => new NextRequest("http://localhost/api/stock/41", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: false, stationId: null, allowedStationIds: [7, 8], permissions: {} } as never);
  jest.mocked(prisma.stock.findUnique).mockResolvedValue(current as never);
  jest.mocked(prisma.stock.findUniqueOrThrow).mockResolvedValue(current as never);
  jest.mocked(prisma.stock.findMany).mockResolvedValue([]);
  (prisma.stock.update as jest.Mock).mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...current, ...data }));
  jest.mocked(prisma.movimentacaoStock.findFirst).mockResolvedValue({ id: 1 } as never);
  jest.mocked(prisma.artigoJangada.findFirst).mockResolvedValue(null);
  (prisma.$transaction as jest.Mock).mockImplementation(fn => fn(prisma));
});

test("partial location edit keeps legacy reference and lot identity with historical movements", async () => {
  const response = await PUT(req("PUT", { localizacao: "P02" }), context);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ id: 41, referencia: current.referencia, lote: "A", validade: "2028-01", codigoBarras: "BAR-A" });
});

test("full admin form does not silently recanonicalize a historical reference", async () => {
  const response = await PUT(req("PUT", { ...current, localizacao: "P02" }), context);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ referencia: current.referencia, lote: "A", validade: "2028-01" });
});

test("legacy NULL lot stays NULL through a full admin edit with history", async () => {
  const row = { ...current, lote: null };
  jest.mocked(prisma.stock.findUnique).mockResolvedValue(row as never);
  jest.mocked(prisma.stock.findUniqueOrThrow).mockResolvedValue(row as never);
  const response = await PUT(req("PUT", { ...row, localizacao: "P02" }), context);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ id: 41, lote: null });
});

test("partial expiry edit uses merged classification, normalizes and protects historical identity", async () => {
  jest.mocked(prisma.stock.findUnique).mockResolvedValue({ ...current, quantidadeReservada: 0 } as never);
  jest.mocked(prisma.stock.findUniqueOrThrow).mockResolvedValue({ ...current, quantidadeReservada: 0 } as never);
  jest.mocked(prisma.movimentacaoStock.findFirst).mockResolvedValue(null);
  const response = await PUT(req("PUT", { validade: "02/2029" }), context);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ validade: "2029-02", lote: "A" });
  jest.mocked(prisma.movimentacaoStock.findFirst).mockResolvedValue({ id: 1 } as never);
  expect((await PUT(req("PUT", { lote: "B" }), context)).status).toBe(409);
});

test("forbidden station IDs cannot be updated without an active cookie", async () => {
  jest.mocked(prisma.stock.findUnique).mockResolvedValue({ ...current, serviceStationId: 99 } as never);
  expect((await PUT(req("PUT", { localizacao: "P02" }), context)).status).toBe(403);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

test("barcode/reference collisions return ambiguity instead of selecting first row", async () => {
  jest.mocked(prisma.stock.findMany).mockResolvedValue([current, { ...current, id: 42, lote: "B", codigoBarras: "BAR-B" }] as never);
  expect((await barcode(new NextRequest("http://localhost/api/stock/by-barcode?code=CUSTOM-LEGACY-REF"))).status).toBe(409);
  expect((await bulkImport(req("POST", { text: "CUSTOM-LEGACY-REF;2" }))).status).toBe(409);
  expect(prisma.stock.update).not.toHaveBeenCalled();
});

test("portable import updates exactly the barcode's row ID and records its movement", async () => {
  jest.mocked(prisma.stock.findMany).mockResolvedValue([current] as never);
  const response = await bulkImport(req("POST", { text: "BAR-A;2" }));
  expect(response.status).toBe(200);
  expect(prisma.stock.update).toHaveBeenCalledWith({ where: { id: 41 }, data: { quantidade: 14 } });
  expect(prisma.movimentacaoStock.create).toHaveBeenCalledWith({ data: expect.objectContaining({ stockId: 41, quantidadeAntes: 12, quantidadeDepois: 14 }) });
  expect(prisma.stock.findMany).toHaveBeenCalledWith({ where: { AND: expect.arrayContaining([{ OR: [{ serviceStationId: { in: [7, 8] } }, { serviceStationId: null }] }]) } });
});

test("bulk creation sees earlier rows in the same transaction and rejects trimmed duplicate lots", async () => {
  const rows: typeof current[] = [];
  (prisma.stock.findMany as jest.Mock).mockImplementation(async () => rows);
  (prisma.stock.create as jest.Mock).mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    const row = { ...data, id: rows.length + 100 } as typeof current;
    rows.push(row);
    return row as never;
  });
  const item = { referencia: "REF-1", descricao: "Hand flare", lote: "A", validade: "2028-01", quantidade: 1 };
  const response = await create(req("POST", [item, { ...item, lote: " A " }]));
  expect(response.status).toBe(409);
  expect(prisma.stock.create).toHaveBeenCalledTimes(1);
  expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
});

test.each([false, "NAO"])("PUT accepts explicit %s without letting expiring heuristics override it", async validadeAplicavel => {
  const row = { ...current, quantidadeReservada: 0, validade: null, lote: "" };
  jest.mocked(prisma.stock.findUnique).mockResolvedValue(row as never);
  jest.mocked(prisma.stock.findUniqueOrThrow).mockResolvedValue(row as never);
  jest.mocked(prisma.movimentacaoStock.findFirst).mockResolvedValue(null);
  const response = await PUT(req("PUT", { validadeAplicavel, validade: "2028-01" }), context);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ validadeAplicavelManual: "NAO", validade: null });
});

test("manual SIM cannot enable resource validity or manufacture a stock movement", async () => {
  const row = { ...current, referencia: "L-HORA", descricao: "Service", quantidadeReservada: 0, validade: null, lote: "" };
  jest.mocked(prisma.stock.findUnique).mockResolvedValue(row as never);
  jest.mocked(prisma.stock.findUniqueOrThrow).mockResolvedValue(row as never);
  const response = await PUT(req("PUT", { validadeAplicavelManual: "SIM", validade: "2028-01" }), context);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ validade: null });
  expect(prisma.movimentacaoStock.create).not.toHaveBeenCalled();
});
