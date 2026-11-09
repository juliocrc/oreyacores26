import { NextRequest } from "next/server";
import { POST } from "@/app/api/stock/[id]/movimentos/route";
import { GET as lookup } from "@/app/api/stock/by-barcode/route";
import { getAccessContext } from "@/lib/access-control";
import { canEditPath, canViewPath } from "@/lib/user-permissions";
import prisma from "@/lib/prisma";

jest.mock("@/lib/access-control", () => ({ getAccessContext: jest.fn() }));
jest.mock("@/lib/user-permissions", () => ({ canEditPath: jest.fn(), canViewPath: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ __esModule: true, default: {
  $transaction: jest.fn(), stock: { findMany: jest.fn() },
} }));

const initial = { id: 41, referencia: "REF", codigoBarras: "LOT-A", lote: "A", quantidade: 5,
  quantidadeReservada: 1, serviceStationId: 7, estadoArtigo: "ATIVO" };
let row: typeof initial;
let version: number;
let audit: Record<string, unknown>[];
let failAudit: boolean;
let loseCompareAndSwap: boolean;
const findFirst = jest.fn();
const updateMany = jest.fn();
const request = (body: unknown, cookie = "") => new NextRequest("http://localhost/api/stock/41/movimentos", {
  method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body),
});
const move = (body: unknown = { operacao: "saida", quantidade: 2 }, id = "41", cookie = "") =>
  POST(request(body, cookie), { params: Promise.resolve({ id }) });

beforeEach(() => {
  jest.clearAllMocks();
  row = { ...initial }; version = 0; audit = []; failAudit = false; loseCompareAndSwap = false;
  jest.mocked(getAccessContext).mockResolvedValue({ userId: 3, email: "operator@example.com", isAdmin: false,
    stationId: null, allowedStationIds: [7, 8], permissions: {} } as never);
  jest.mocked(canEditPath).mockReturnValue(true);
  jest.mocked(canViewPath).mockReturnValue(true);
  // Optimistic serializable database model: each transaction has an isolated snapshot,
  // commits stock + audit together, and conflicts force the production retry path.
  (prisma.$transaction as jest.Mock).mockImplementation(async fn => {
    const snapshotVersion = version;
    let local = { ...row };
    const pending: Record<string, unknown>[] = [];
    const read = async ({ where }: any) => {
      findFirst({ where });
      const scope = where.AND[1];
      const allowed = scope.OR?.some((clause: any) => clause.serviceStationId === local.serviceStationId ||
        clause.serviceStationId?.in?.includes(local.serviceStationId));
      return where.AND[0].id === local.id && (allowed || !scope.OR) ? { ...local } : null;
    };
    const result = await fn({ stock: {
      findFirst: read,
      updateMany: async (args: any) => {
        updateMany(args);
        if (loseCompareAndSwap) return { count: 0 };
        const delta = args.data.quantidade;
        local = { ...local, quantidade: local.quantidade + (delta.increment ?? -delta.decrement) };
        return { count: 1 };
      },
    }, movimentacaoStock: { create: async ({ data }: any) => {
      if (failAudit) throw new Error("Audit unavailable");
      pending.push(data);
    } } });
    if (snapshotVersion !== version) throw Object.assign(new Error("Serialization conflict"), { code: "P2034" });
    row = local; audit.push(...pending); version++;
    return result;
  });
});

test("movement changes only the exact row and audits authenticated actor, ignoring client stock/actor", async () => {
  const response = await move({ operacao: "saida", quantidade: 2, stock: 999, stockId: 42, usuario: "admin" });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ id: 41, quantidade: 3, lote: "A" });
  expect(updateMany).toHaveBeenCalledWith({ where: { id: 41, quantidade: 5, quantidadeReservada: 1,
    serviceStationId: 7, estadoArtigo: "ATIVO" }, data: { quantidade: { decrement: 2 } } });
  expect(audit).toEqual([expect.objectContaining({ stockId: 41, tipo: "saida", quantidade: 2,
    quantidadeAntes: 5, quantidadeDepois: 3, usuario: "3:operator@example.com" })]);
  expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
});

test("entry uses a delta and returns persisted quantity", async () => {
  expect((await move({ operacao: "entrada", quantidade: 3 })).status).toBe(200);
  expect(row.quantidade).toBe(8);
  expect(audit[0]).toMatchObject({ quantidadeAntes: 5, quantidadeDepois: 8, tipo: "entrada" });
});

test.each(['L-DSB', 'L-CIL', 'L-CER', 'ES012741'])('rejects entries and exits for resource %s without changing stock', async reference => {
  row.referencia = reference;
  for (const operacao of ['entrada', 'saida']) {
    expect((await move({ operacao, quantidade: 1 })).status).toBe(400);
  }
  expect(updateMany).not.toHaveBeenCalled();
  expect(row.quantidade).toBe(initial.quantidade);
  expect(audit).toEqual([]);
});

test.each([0, -1, 0.1, 1.9, "2", null, true, 2_147_483_648])("rejects invalid quantity %s without a transaction", async quantidade => {
  expect((await move({ operacao: "saida", quantidade })).status).toBe(400);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});
test.each([{}, null, [], { operacao: "adjust", quantidade: 1 }, { operacao: "saida" }])("rejects invalid body %j", async body => {
  expect((await move(body)).status).toBe(400);
});
test.each(["0", "-1", "1.5", "1e2", "0x29", " 41", "41x", "01", "2147483648", "9007199254740993"]) (
  "rejects noncanonical/out-of-range ID %s", async id => {
    expect((await move(undefined, id)).status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
test("rejects malformed JSON", async () => {
  const req = new NextRequest("http://localhost/api/stock/41/movimentos", { method: "POST", body: "{" });
  expect((await POST(req, { params: Promise.resolve({ id: "41" }) })).status).toBe(400);
});
test("requires authentication and edit permission", async () => {
  jest.mocked(getAccessContext).mockResolvedValueOnce(null);
  expect((await move()).status).toBe(401);
  jest.mocked(canEditPath).mockReturnValue(false);
  expect((await move()).status).toBe(403);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});
test("rejects a different station, including an allowed but inactive station", async () => {
  row.serviceStationId = 99;
  expect((await move()).status).toBe(404);
  row.serviceStationId = 8;
  expect((await move(undefined, "41", "active_service_station_id=7")).status).toBe(404);
  expect(audit).toEqual([]);
});
test("forged station cookie cannot grant access", async () => {
  row.serviceStationId = 99;
  expect((await move(undefined, "41", "active_service_station_id=99")).status).toBe(404);
});
test("missing ID never falls back to another lot", async () => {
  expect((await move(undefined, "42")).status).toBe(404);
  expect(updateMany).not.toHaveBeenCalled();
});
test.each([5, 6])("rejects unavailable/reserved stock (%s), without clamping or audit", async quantidade => {
  expect((await move({ operacao: "saida", quantidade })).status).toBe(409);
  expect(row.quantidade).toBe(5);
  expect(audit).toEqual([]);
});
test("inactive article, overflow and compare-and-swap conflict cannot write", async () => {
  row.estadoArtigo = "INATIVO";
  expect((await move()).status).toBe(409);
  row.estadoArtigo = "ATIVO";
  expect((await move({ operacao: "entrada", quantidade: 2_147_483_647 })).status).toBe(400);
  loseCompareAndSwap = true;
  expect((await move()).status).toBe(409);
  expect(row.quantidade).toBe(5);
  expect(audit).toEqual([]);
});
test("audit failure rolls back quantity", async () => {
  failAudit = true;
  expect((await move()).status).toBe(500);
  expect(row.quantidade).toBe(5);
  expect(audit).toEqual([]);
});
test("concurrent withdrawals cannot oversell; retry revalidates fresh stock", async () => {
  const responses = await Promise.all([move({ operacao: "saida", quantidade: 3 }), move({ operacao: "saida", quantidade: 3 })]);
  expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
  expect(row.quantidade).toBe(2);
  expect(audit).toHaveLength(1);
  expect(prisma.$transaction).toHaveBeenCalledTimes(3);
});
test("concurrent entries preserve both deltas and sequential audit quantities", async () => {
  const responses = await Promise.all([move({ operacao: "entrada", quantidade: 2 }), move({ operacao: "entrada", quantidade: 3 })]);
  expect(responses.map(r => r.status)).toEqual([200, 200]);
  expect(row.quantidade).toBe(10);
  expect(audit).toEqual([expect.objectContaining({ quantidadeAntes: 5, quantidadeDepois: 7 }),
    expect.objectContaining({ quantidadeAntes: 7, quantidadeDepois: 10 })]);
});
test("lookup contract accepts code, returns raw quantidade, and refuses ambiguous lots", async () => {
  jest.mocked(prisma.stock.findMany).mockResolvedValueOnce([initial] as never);
  const response = await lookup(new NextRequest("http://localhost/api/stock/by-barcode?code=LOT-A"));
  expect(await response.json()).toMatchObject({ id: 41, quantidade: 5 });
  jest.mocked(prisma.stock.findMany).mockResolvedValueOnce([initial, { ...initial, id: 42 }] as never);
  expect((await lookup(new NextRequest("http://localhost/api/stock/by-barcode?code=REF"))).status).toBe(409);
  expect((await lookup(new NextRequest("http://localhost/api/stock/by-barcode?barcode=LOT-A"))).status).toBe(400);
});
