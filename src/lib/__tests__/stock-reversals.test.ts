import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { canEditPath, canViewPath } from "@/lib/user-permissions";
import { POST } from "@/app/api/stock/[id]/movimentos/[movementId]/estornar/route";
import { GET } from "@/app/api/stock/[id]/movimentos/route";
import { GET as legacyGET } from "@/app/api/stock/[id]/movimentacoes/route";

jest.mock("@/lib/access-control", () => ({ getAccessContext: jest.fn() }));
jest.mock("@/lib/user-permissions", () => ({ canEditPath: jest.fn(), canViewPath: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ __esModule: true, default: {
  $transaction: jest.fn(), stock: { findFirst: jest.fn() }, movimentacaoStock: { findMany: jest.fn() },
} }));

const originalRow = { id: 12, stockId: 41, tipo: "entrada", quantidade: 3,
  quantidadeAntes: 2, quantidadeDepois: 5, reversaoDeId: null,
  ordemServicoId: null, inspecaoId: null, pedidoReposicaoId: null,
  motivo: "Manual", usuario: "Old actor", createdAt: new Date() };
let original: any;
let stock: any;
let audits: any[];
let version: number;
let failAudit: boolean;
let conflict: boolean;
const updateMany = jest.fn();
const create = jest.fn();
const context = { params: Promise.resolve({ id: "41", movementId: "12" }) };
const request = (body: unknown = { motivo: "Contagem incorreta", usuario: "forged" }, cookie = "") =>
  new NextRequest("http://localhost/api/stock/41/movimentos/12/estornar", {
    method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify(body),
  });
const reverse = (body?: unknown, cookie?: string) => POST(request(body, cookie), context);
const scopedRead = async ({ where }: any) => {
  const scope = where.AND[1];
  const permitted = !scope.OR || scope.OR.some((entry: any) => entry.serviceStationId === stock.serviceStationId ||
    entry.serviceStationId?.in?.includes(stock.serviceStationId));
  return where.AND[0].id === stock.id && permitted ? { ...stock } : null;
};

beforeEach(() => {
  jest.clearAllMocks();
  original = { ...originalRow };
  stock = { id: 41, referencia: "REF", quantidade: 10, quantidadeReservada: 1,
    serviceStationId: 7, estadoArtigo: "ATIVO" };
  audits = []; version = 0; failAudit = false; conflict = false;
  jest.mocked(getAccessContext).mockResolvedValue({ userId: 3, email: "operator@example.com", isAdmin: false,
    stationId: null, allowedStationIds: [7, 8], permissions: {} } as never);
  jest.mocked(canEditPath).mockReturnValue(true);
  jest.mocked(canViewPath).mockReturnValue(true);
  jest.mocked(prisma.stock.findFirst).mockImplementation(scopedRead as never);
  (prisma.$transaction as jest.Mock).mockImplementation(async fn => {
    const snapshot = version;
    let local = { ...stock };
    const pending: any[] = [];
    const result = await fn({ stock: {
      findFirst: scopedRead,
      updateMany: async (args: any) => {
        updateMany(args);
        if (conflict) return { count: 0 };
        local.quantidade += args.data.quantidade.increment;
        return { count: 1 };
      },
    }, movimentacaoStock: {
      findFirst: async ({ where }: any) => where.id === original.id && where.stockId === original.stockId ? { ...original } : null,
      findUnique: async () => audits[0] ?? null,
      findMany: async () => [{ ...original, estorno: audits.length ? { id: audits[0].id } : null }],
      create: async ({ data }: any) => {
        create(data);
        if (failAudit) throw new Error("Audit failed");
        const row = { id: 13, ...data };
        pending.push(row);
        return row;
      },
    } });
    if (snapshot !== version) throw Object.assign(new Error("Serialization"), { code: "P2034" });
    stock = local; audits.push(...pending); version++;
    return result;
  });
});

test("inverse delta uses current stock, preserves original, and audits trusted actor/reason/link", async () => {
  const response = await reverse();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ tipo: "estorno", quantidade: 3, quantidadeAntes: 10,
    quantidadeDepois: 7, motivo: "Contagem incorreta", usuario: "3:operator@example.com", reversaoDeId: 12 });
  expect(stock.quantidade).toBe(7);
  expect(original).toEqual(originalRow);
  expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
    id: 41, quantidade: 10, quantidadeReservada: 1, serviceStationId: 7, estadoArtigo: "ATIVO",
  } }));
});

test.each(["saida", "ajuste"])("reverses manual %s using actual original delta", async tipo => {
  original = { ...original, tipo, quantidadeAntes: 8, quantidadeDepois: 5 };
  expect((await reverse()).status).toBe(200);
  expect(stock.quantidade).toBe(13);
});

test("replay returns the identical audit even after stock/reservations have changed", async () => {
  const first = await (await reverse()).json();
  stock.quantidade = 2; stock.quantidadeReservada = 2;
  expect(await (await reverse({ motivo: "Outro motivo" })).json()).toEqual(first);
  expect(stock.quantidade).toBe(2);
  expect(audits).toHaveLength(1);
  expect(updateMany).toHaveBeenCalledTimes(1);
});

test("concurrent duplicate requests commit exactly one delta and return same audit", async () => {
  const responses = await Promise.all([reverse(), reverse()]);
  expect(responses.map(response => response.status)).toEqual([200, 200]);
  expect(await responses[0].json()).toEqual(await responses[1].json());
  expect(stock.quantidade).toBe(7);
  expect(audits).toHaveLength(1);
});

test.each(["ordemServicoId", "inspecaoId", "pedidoReposicaoId", "reversaoDeId"])("rejects workflow or reversal link %s", async field => {
  original[field] = 9;
  expect((await reverse()).status).toBe(400);
  expect(updateMany).not.toHaveBeenCalled();
});
test.each(["reserva", "libertar_reserva", "estorno", "other"])("rejects non-manual type %s", async tipo => {
  original.tipo = tipo;
  expect((await reverse()).status).toBe(400);
});
test.each(["Consumo OT OT-2026-1", "Consumo inspe\u00e7\u00e3o CERT-1", "Consumo checklist CERT-1",
  "Substitui\u00e7\u00e3o de artigo na jangada serial 5", "Substitui\u00e7\u00e3o de HRU na jangada serial ABC",
  "Revers\u00e3o de movimentos de stock da inspe\u00e7\u00e3o CERT-1", "Rece\u00e7\u00e3o pedido PR-1"])(
  "rejects persisted workflow with absent or SetNull foreign keys: %s", async motivo => {
    original.motivo = motivo;
    expect((await reverse()).status).toBe(400);
    expect(updateMany).not.toHaveBeenCalled();
  });
test.each(["L-DSB", "L-CIL", "ES012741"])("rejects resource %s", async ref => {
  stock.referencia = ref;
  expect((await reverse()).status).toBe(400);
  expect(updateMany).not.toHaveBeenCalled();
});
test("article ownership and active station are checked before replay", async () => {
  original.stockId = 42;
  expect((await reverse()).status).toBe(404);
  original.stockId = 41;
  stock.serviceStationId = 8;
  expect((await reverse(undefined, "active_service_station_id=7")).status).toBe(404);
  stock.serviceStationId = 99;
  expect((await reverse(undefined, "active_service_station_id=99")).status).toBe(404);
  expect(updateMany).not.toHaveBeenCalled();
});
test("reserved stock, underflow, overflow, invalid delta and CAS failure cannot mutate", async () => {
  stock.quantidadeReservada = 8;
  expect((await reverse()).status).toBe(409);
  stock.quantidadeReservada = 0; stock.quantidade = 1;
  expect((await reverse()).status).toBe(409);
  original = { ...original, tipo: "saida", quantidadeAntes: 8, quantidadeDepois: 5 };
  stock.quantidade = 2_147_483_647;
  expect((await reverse()).status).toBe(400);
  stock.quantidade = 10; original.quantidade = 4;
  expect((await reverse()).status).toBe(400);
  original.quantidade = 3; conflict = true;
  expect((await reverse()).status).toBe(409);
  expect(audits).toHaveLength(0);
  expect(stock.quantidade).toBe(10);
});
test("audit failure rolls stock back", async () => {
  failAudit = true;
  expect((await reverse()).status).toBe(500);
  expect(stock.quantidade).toBe(10);
  expect(audits).toHaveLength(0);
});
test.each([{}, null, { motivo: " " }, { motivo: 3 }, { motivo: "x".repeat(301) }])("requires reason: %j", async body => {
  expect((await reverse(body)).status).toBe(400);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});
test("requires auth/edit permission, valid IDs and JSON", async () => {
  jest.mocked(getAccessContext).mockResolvedValueOnce(null);
  expect((await reverse()).status).toBe(401);
  jest.mocked(canEditPath).mockReturnValueOnce(false);
  expect((await reverse()).status).toBe(403);
  for (const id of ["0", "01", "-1", "1e2", "2147483648"]) {
    expect((await POST(request(), { params: Promise.resolve({ id, movementId: "12" }) })).status).toBe(400);
    expect((await POST(request(), { params: Promise.resolve({ id: "41", movementId: id }) })).status).toBe(400);
  }
  expect((await POST(new NextRequest("http://localhost", { method: "POST", body: "{" }), context)).status).toBe(400);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});
test.each([GET, legacyGET])("movement history rejects inaccessible station", async get => {
  stock.serviceStationId = 99;
  expect((await get(new NextRequest("http://localhost/api/stock/41/movimentos"), context)).status).toBe(404);
  expect(prisma.movimentacaoStock.findMany).not.toHaveBeenCalled();
});
test("history exposes reversal eligibility and original audit", async () => {
  let response = await GET(new NextRequest("http://localhost"), context);
  expect((await response.json()).movements[0]).toMatchObject({ id: 12, canReverse: true, usuario: "Old actor" });
  await reverse();
  response = await GET(new NextRequest("http://localhost"), context);
  expect((await response.json()).movements[0]).toMatchObject({ canReverse: false, estorno: { id: 13 } });
});
test("only the exact reversal unique target is recovered, after transaction rollback", async () => {
  const transaction = prisma.$transaction as jest.Mock;
  const winner = { id: 13, stockId: 41, reversaoDeId: 12 };
  transaction.mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002", meta: { target: ["reversaoDeId"] } }));
  audits.push(winner);
  expect(await (await reverse()).json()).toEqual(winner);
  expect(updateMany).not.toHaveBeenCalled();
  transaction.mockRejectedValueOnce(Object.assign(new Error("other unique"), { code: "P2002", meta: { target: ["id"] } }));
  const count = transaction.mock.calls.length;
  expect((await reverse()).status).toBe(409);
  expect(transaction).toHaveBeenCalledTimes(count + 1);
});
