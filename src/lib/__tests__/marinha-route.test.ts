import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/navios/marinha/route";
import prisma from "../prisma";
import { getAccessContext } from "../access-control";
import { resolveActiveServiceStationId } from "../station-selection";
import { canEditPath } from "../user-permissions";
import { marinhaCatalogue, isMarinhaAssociation, normalizeMarinhaIdentity } from "../marinha-associations";

jest.mock("../access-control", () => ({ getAccessContext: jest.fn() }));
jest.mock("../station-selection", () => ({ resolveActiveServiceStationId: jest.fn() }));
jest.mock("../user-permissions", () => ({ canEditPath: jest.fn() }));
jest.mock("../auditoria", () => ({ logAuditoria: jest.fn() }));
jest.mock("../prisma", () => ({ __esModule: true, default: {
  serviceStation: { findFirst: jest.fn() },
  navio: { findMany: jest.fn(), create: jest.fn() },
  jangada: { findMany: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
  $transaction: jest.fn(),
} }));

const ship = { id: 710, matricula: "F330", serviceStationId: 1 };
const raft = { id: 9, serial: "5017210100018", serviceStationId: 1, shipId: null, shipNameManual: "" };
const request = (body: object) => new NextRequest("http://localhost/api/navios/marinha", { method: "POST", body: JSON.stringify(body) });
const associate = (extra = {}) => request({ action: "associate", numero: "F330", jangadaId: 9, expectedShipId: null, expectedShipNameManual: "", ...extra });

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: true, allowedStationIds: [1, 2], permissions: {} } as never);
  jest.mocked(resolveActiveServiceStationId).mockReturnValue(1);
  jest.mocked(prisma.serviceStation.findFirst).mockResolvedValue({ id: 1 } as never);
  jest.mocked(prisma.navio.findMany).mockResolvedValue([ship] as never);
  jest.mocked(prisma.jangada.findMany).mockResolvedValue([raft] as never);
  jest.mocked(prisma.jangada.findUnique).mockResolvedValue(raft as never);
  jest.mocked(prisma.jangada.updateMany).mockResolvedValue({ count: 1 });
  let id = 1000;
  jest.mocked(prisma.navio.create).mockImplementation((async ({ data }: { data: object }) => ({ ...data, id: ++id })) as never);
  jest.mocked(prisma.$transaction).mockImplementation((async (fn: (tx: typeof prisma) => unknown) => fn(prisma)) as never);
});

it("returns every raft including serial 5017210100018 beyond the first page, without writing", async () => {
  const rows = [...Array.from({ length: 5500 }, (_, id) => ({ ...raft, id, serial: String(id) })), raft];
  jest.mocked(prisma.jangada.findMany).mockResolvedValue(rows as never);
  const response = await GET(new NextRequest("http://localhost/api/navios/marinha"));
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.jangadas).toHaveLength(5501);
  expect(body.jangadas.find((j: { serial: string }) => j.serial === raft.serial)).toMatchObject(raft);
  expect(prisma.jangada.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { OR: [{ serviceStationId: { in: [1, 2] } }, { serviceStationId: null }] } }));
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(jest.mocked(prisma.jangada.findMany).mock.calls[0][0]?.take).toBeUndefined();
  expect(prisma.navio.create).not.toHaveBeenCalled();
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it("imports the entire catalogue, reuses exact matriculas and preserves existing records", async () => {
  jest.mocked(prisma.navio.findMany).mockResolvedValue([{ ...ship, matricula: " f330 " }] as never);
  const response = await POST(request({ action: "sync" }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ count: marinhaCatalogue.length, conflicts: [] });
  expect(prisma.navio.create).toHaveBeenCalledTimes(marinhaCatalogue.length - 1);
  expect(prisma.navio.create).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ matricula: "F330" }) }));
  expect(jest.mocked(prisma.navio.create).mock.calls.every(([args]) => args.data.serviceStationId === 1)).toBe(true);
  expect(new Set(marinhaCatalogue.map(n => normalizeMarinhaIdentity(n.numero))).size).toBe(marinhaCatalogue.length);
});

it("is idempotent when all catalogue ships already exist", async () => {
  jest.mocked(prisma.navio.findMany).mockResolvedValue(marinhaCatalogue.map((n, id) => ({ id, matricula: n.numero, serviceStationId: 1 })) as never);
  expect((await POST(request({ action: "sync" }))).status).toBe(200);
  expect(prisma.navio.create).not.toHaveBeenCalled();
});

it("reports ambiguous and other-station hulls instead of duplicating or moving them", async () => {
  jest.mocked(prisma.navio.findMany).mockResolvedValue([ship, { ...ship, id: 711 }, { id: 712, matricula: "F331", serviceStationId: 2 }] as never);
  const body = await (await POST(request({ action: "sync" }))).json();
  expect(body.conflicts).toHaveLength(2);
  expect(body.count).toBe(marinhaCatalogue.length - 2);
  expect(jest.mocked(prisma.navio.create).mock.calls.some(([args]) => ["F330", "F331"].includes(args.data.matricula))).toBe(false);
});

it("persists the same real Navio id used by the general list", async () => {
  const response = await POST(associate());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ jangadaId: 9, shipId: 710 });
  expect(prisma.jangada.updateMany).toHaveBeenCalledWith({
    where: { id: 9, serviceStationId: 1, shipId: null, shipNameManual: "" },
    data: { shipId: 710, shipNameManual: "" },
  });
  expect(prisma.navio.create).not.toHaveBeenCalled();
});

it("lazily creates the real ship only on intentional association", async () => {
  jest.mocked(prisma.navio.findMany).mockResolvedValue([]);
  expect((await POST(associate())).status).toBe(200);
  expect(prisma.navio.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ matricula: "F330", serviceStationId: 1 }) }));
  expect(prisma.jangada.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { shipId: 1001, shipNameManual: "" } }));
});

it("requires explicit reassignment confirmation and rejects stale selections", async () => {
  jest.mocked(prisma.jangada.findUnique).mockResolvedValue({ ...raft, shipId: 42 } as never);
  expect((await POST(associate({ expectedShipId: 42 }))).status).toBe(409);
  expect(prisma.jangada.updateMany).not.toHaveBeenCalled();
  expect((await POST(associate({ expectedShipId: 42, confirmReassign: true }))).status).toBe(200);
  expect((await POST(associate({ confirmReassign: true }))).status).toBe(409);
});

it("does not disassociate an arbitrary ship or a substring manual match", async () => {
  jest.mocked(prisma.jangada.findUnique).mockResolvedValue({ ...raft, shipId: 42, shipNameManual: "F330 - Vasco da Gama" } as never);
  expect((await POST(associate({ action: "disassociate", expectedShipId: 42, expectedShipNameManual: "F330 - Vasco da Gama" }))).status).toBe(409);
  jest.mocked(prisma.jangada.findUnique).mockResolvedValue({ ...raft, shipNameManual: "F3300" } as never);
  expect((await POST(associate({ action: "disassociate", expectedShipNameManual: "F3300" }))).status).toBe(409);
  expect(prisma.jangada.updateMany).not.toHaveBeenCalled();
});

it("clears only the intended persisted association", async () => {
  jest.mocked(prisma.jangada.findUnique).mockResolvedValue({ ...raft, shipId: 710 } as never);
  expect((await POST(associate({ action: "disassociate", expectedShipId: 710 }))).status).toBe(200);
  expect(prisma.jangada.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 9, shipId: 710 }), data: { shipId: null, shipNameManual: "" } }));
});

it("migrates an exact legacy association on intentional associate", async () => {
  jest.mocked(prisma.jangada.findUnique).mockResolvedValue({ ...raft, shipNameManual: " f330 - VASCO DA GAMA " } as never);
  expect((await POST(associate({ expectedShipNameManual: " f330 - VASCO DA GAMA " }))).status).toBe(200);
  expect(prisma.jangada.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { shipId: 710, shipNameManual: "" } }));
});

it("gives shipId precedence over manual text and never matches substrings", () => {
  const navio = { numero: "F330", nome: "Vasco da Gama" };
  expect(isMarinhaAssociation({ shipId: 42, shipNameManual: navio.nome }, navio, 710)).toBe(false);
  expect(isMarinhaAssociation({ shipId: 710, shipNameManual: "Other" }, navio, 710)).toBe(true);
  expect(isMarinhaAssociation({ shipId: null, shipNameManual: "F3300" }, navio, 710)).toBe(false);
  expect(isMarinhaAssociation({ shipId: null, shipNameManual: "NRP Vasco da Gama II" }, navio, 710)).toBe(false);
});

it("requires explicit administrator consent to transfer an accessible cross-station raft", async () => {
  jest.mocked(prisma.jangada.findUnique).mockResolvedValue({ ...raft, serviceStationId: 2 } as never);
  expect((await POST(associate())).status).toBe(409);
  expect(prisma.jangada.updateMany).not.toHaveBeenCalled();
  expect(prisma.navio.create).not.toHaveBeenCalled();
  expect((await POST(associate({ expectedServiceStationId: 2, confirmStationTransfer: true }))).status).toBe(200);
  expect(prisma.jangada.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ serviceStationId: 2 }), data: { shipId: 710, shipNameManual: "", serviceStationId: 1 } }));
});

it.each(["5017210100016", "5017210100018"])("discovers unassigned-station serial %s for authorized administrators and persists only after consent", async serial => {
  const unassigned = { ...raft, serial, serviceStationId: null };
  jest.mocked(prisma.jangada.findMany).mockResolvedValue([unassigned] as never);
  const body = await (await GET(new NextRequest("http://localhost/api/navios/marinha"))).json();
  expect(body.jangadas).toEqual([expect.objectContaining({ serial, requiresStationTransfer: true })]);
  expect(prisma.jangada.updateMany).not.toHaveBeenCalled();
  jest.mocked(prisma.jangada.findUnique).mockResolvedValue(unassigned as never);
  expect((await POST(associate())).status).toBe(409);
  expect((await POST(associate({ expectedServiceStationId: null, confirmStationTransfer: true }))).status).toBe(200);
  expect(prisma.jangada.updateMany).toHaveBeenCalledWith({ where: { id: 9, serviceStationId: null, shipId: null, shipNameManual: "" }, data: { shipId: 710, shipNameManual: "", serviceStationId: 1 } });
});

it("keeps nonadministrators scoped to the active station and denies null or other-station writes even with consent", async () => {
  jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: false, allowedStationIds: [1, 2], permissions: {} } as never);
  jest.mocked(canEditPath).mockReturnValue(true);
  await GET(new NextRequest("http://localhost/api/navios/marinha"));
  expect(prisma.jangada.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { serviceStationId: 1 } }));
  for (const serviceStationId of [null, 2, 3]) {
    jest.mocked(prisma.jangada.findUnique).mockResolvedValue({ ...raft, serviceStationId } as never);
    expect((await POST(associate({ expectedServiceStationId: serviceStationId, confirmStationTransfer: true }))).status).toBe(403);
  }
  expect(prisma.jangada.updateMany).not.toHaveBeenCalled();
});

it("denies restricted administrators access to unauthorized stations and checks station concurrency", async () => {
  jest.mocked(prisma.jangada.findUnique).mockResolvedValue({ ...raft, serviceStationId: 3 } as never);
  expect((await POST(associate({ expectedServiceStationId: 3, confirmStationTransfer: true }))).status).toBe(403);
  expect((await POST(associate({ expectedActiveStationId: 2 }))).status).toBe(409);
  jest.mocked(prisma.jangada.findUnique).mockResolvedValue({ ...raft, serviceStationId: 2 } as never);
  expect((await POST(associate({ expectedServiceStationId: null, confirmStationTransfer: true }))).status).toBe(409);
  expect(prisma.jangada.updateMany).not.toHaveBeenCalled();
});

it("allows unrestricted administrators to discover global and null-station records without initial writes", async () => {
  jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: true, allowedStationIds: [], permissions: {} } as never);
  jest.mocked(prisma.jangada.findMany).mockResolvedValue([{ ...raft, serial: "5017210100016", shipId: 710, serviceStationId: null }] as never);
  const response = await GET(new NextRequest("http://localhost/api/navios/marinha"));
  expect(prisma.jangada.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  expect((await response.json()).jangadas[0]).toMatchObject({ serial: "5017210100016", shipId: 710 });
  expect(prisma.$transaction).not.toHaveBeenCalled();
  expect(prisma.jangada.updateMany).not.toHaveBeenCalled();
});

it.each(["P2021", "P2022"])("surfaces missing-schema error %s instead of an empty selector", async code => {
  jest.mocked(prisma.jangada.findMany).mockRejectedValue({ code });
  const response = await GET(new NextRequest("http://localhost/api/navios/marinha"));
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ code: "SCHEMA_MISMATCH", error: expect.stringContaining("schema") });
});

it("rejects duplicate ESV-HOR identities without creating another catalogue alias", async () => {
  jest.mocked(prisma.navio.findMany).mockResolvedValue([{ ...ship, matricula: "ESV-HOR" }, { ...ship, id: 711, matricula: " esv-hor " }] as never);
  expect((await POST(associate({ numero: "ESV-HOR" }))).status).toBe(409);
  expect(prisma.navio.create).not.toHaveBeenCalled();
  expect(prisma.jangada.updateMany).not.toHaveBeenCalled();
  expect(marinhaCatalogue.filter(n => n.numero === "ESV-HOR")).toHaveLength(1);
});

it("requires authentication, an authorized active station, and mutation permissions", async () => {
  jest.mocked(getAccessContext).mockResolvedValueOnce(null);
  expect((await POST(associate())).status).toBe(401);
  jest.mocked(resolveActiveServiceStationId).mockReturnValueOnce(null);
  expect((await POST(associate())).status).toBe(400);
  jest.mocked(resolveActiveServiceStationId).mockReturnValueOnce(3);
  expect((await POST(associate())).status).toBe(403);
  jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: false, allowedStationIds: [1], permissions: {} } as never);
  expect((await POST(associate())).status).toBe(403);
  expect((await POST(request({ action: "sync" }))).status).toBe(403);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it("allows jangada editors to use existing ships but not import ships", async () => {
  jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: false, allowedStationIds: [1], permissions: {} } as never);
  jest.mocked(canEditPath).mockImplementation((_permissions, path) => path === "/jangadas");
  expect((await POST(associate())).status).toBe(200);
  jest.mocked(prisma.navio.findMany).mockResolvedValue([]);
  expect((await POST(associate())).status).toBe(403);
  expect(prisma.navio.create).not.toHaveBeenCalled();
});

it("guards concurrent relationship changes", async () => {
  jest.mocked(prisma.jangada.updateMany).mockResolvedValue({ count: 0 });
  expect((await POST(associate())).status).toBe(409);
});
