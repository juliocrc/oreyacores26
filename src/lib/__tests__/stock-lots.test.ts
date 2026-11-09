jest.mock("@/lib/prisma", () => ({ __esModule: true, default: {} }));
jest.mock("@/lib/access-control", () => ({ getAccessContext: jest.fn() }));
import { normalizeStockPayload, validateStockLot } from "@/lib/stock-utils";
import type { Prisma } from "@prisma/client";

function setup(siblings: unknown[] = [], history = false) {
  return { stock: { findMany: jest.fn().mockResolvedValue(siblings) },
    movimentacaoStock: { findFirst: jest.fn().mockResolvedValue(history ? { id: 1 } : null) },
    artigoJangada: { findFirst: jest.fn().mockResolvedValue(null) },
  } as unknown as Prisma.TransactionClient;
}
const input = { referencia: "FLARE", descricao: "Hand flare", categoria: "PIROTECNICOS", lote: "A", validade: "01/2028", quantidade: 12, precoVenda: 1 };
const existing = () => ({ ...normalizeStockPayload(input), id: 41, serviceStationId: 1, quantidadeReservada: 0, codigoBarras: "OLD-41" } as Prisma.StockGetPayload<{}>);

test("distinct lots of same reference get distinct barcodes; duplicate same lot fails", async () => {
  const a = { ...normalizeStockPayload(input), serviceStationId: 1 };
  await validateStockLot(setup(), a);
  const b = { ...normalizeStockPayload({ ...input, lote: " B ", validade: "2029-02" }), serviceStationId: 1 };
  await validateStockLot(setup([a]), b);
  expect(b.lote).toBe("B");
  expect(a.codigoBarras).toMatch(/^LOT-/);
  expect(b.codigoBarras).not.toBe(a.codigoBarras);
  await expect(validateStockLot(setup([a]), { ...a })).rejects.toThrow(/Ja existe/);
});

test("non-expiring articles use canonical empty lot and cannot bypass group classification", async () => {
  const paddle = { ...normalizeStockPayload({ ...input, descricao: "Paddle", categoria: "DIVERSOS", lote: "IGNORED" }), serviceStationId: 1 };
  expect(paddle.lote).toBe("");
  expect(paddle.validade).toBeNull();
  await validateStockLot(setup(), paddle);
  await expect(validateStockLot(setup([paddle]), { ...paddle, lote: "B" })).rejects.toThrow();
  await expect(validateStockLot(setup([paddle]), { ...normalizeStockPayload(input), serviceStationId: 1 })).rejects.toThrow(/misturar/);
});

test("new dated lots need a lot and valid expiry; metadata overrides are shared", async () => {
  await expect(validateStockLot(setup(), normalizeStockPayload({ ...input, lote: " " }))).rejects.toThrow(/exigem/);
  await expect(validateStockLot(setup(), normalizeStockPayload({ ...input, validade: "bad" }))).rejects.toThrow(/exigem/);
  const manual = normalizeStockPayload({ ...input, descricao: "Part", categoria: "DIVERSOS", validadeAplicavelManual: "SIM" });
  expect(manual.validade).toBe("2028-01");
  await validateStockLot(setup(), manual);
});

test("historical identity immutable; merged partial updates preserve expiry and barcode", async () => {
  const current = existing();
  const merged = { ...current, localizacao: "Shelf 2" };
  await expect(validateStockLot(setup([], true), merged, current)).resolves.toMatchObject({ validade: "2028-01", codigoBarras: "OLD-41" });
  await expect(validateStockLot(setup([], true), { ...current, lote: "B" }, current)).rejects.toThrow(/imutavel/);
  await expect(validateStockLot(setup([], true), { ...current, validade: "2029-01" }, current)).rejects.toThrow(/imutavel/);
});

test("duplicate legacy NULL lots survive unrelated edits exactly, but cannot be created again", async () => {
  const current = { ...existing(), lote: null, validade: null };
  await expect(validateStockLot(setup([{ ...current, id: 42 }], true), { ...current, localizacao: "Shelf 3" }, current)).resolves.toMatchObject({ id: 41, lote: null });
  await expect(validateStockLot(setup(), { ...current })).rejects.toThrow(/exigem/);
});

test("legacy known whitespace is not silently trimmed; new dated lot still trims and conflicts", async () => {
  const current = { ...existing(), lote: " A " };
  await expect(validateStockLot(setup([], true), { ...current, localizacao: "Shelf 3" }, current)).resolves.toMatchObject({ lote: " A " });
  await expect(validateStockLot(setup([current]), normalizeStockPayload(input))).rejects.toThrow(/Ja existe/);
});

test("new nondated row cannot bypass existing unknown legacy stock", async () => {
  const item = normalizeStockPayload({ referencia: "PADDLE", descricao: "Paddle", quantidade: 1 });
  await expect(validateStockLot(setup([{ ...item, id: 42, lote: null }]), item)).rejects.toThrow(/apenas um registo/);
});

test("actual dated batch can be added beside unknown legacy batches without changing them", async () => {
  const legacy = { ...existing(), lote: null };
  const data = { ...normalizeStockPayload(input), serviceStationId: 1 };
  await expect(validateStockLot(setup([legacy, { ...legacy, id: 42 }]), data)).resolves.toMatchObject({ lote: "A", validade: "2028-01" });
  expect(legacy.lote).toBeNull();
});

test("same lot is isolated by station query", async () => {
  const tx = setup();
  await validateStockLot(tx, { ...normalizeStockPayload(input), serviceStationId: 2 });
  expect(tx.stock.findMany).toHaveBeenCalledWith({ where: { referencia: normalizeStockPayload(input).referencia, serviceStationId: 2 } });
});

test("installed associations protect identity even without movements", async () => {
  const current = existing();
  const tx = setup();
  jest.mocked(tx.artigoJangada.findFirst).mockResolvedValue({ id: 9 } as never);
  await expect(validateStockLot(tx, { ...current, lote: "B" }, current)).rejects.toThrow(/imutavel/);
});
