import { NextRequest } from "next/server";
import { getAccessContext, type AccessContext } from "@/lib/access-control";
import prisma from "@/lib/prisma";
import { apiStationScope, requireApiAccess } from "@/lib/api-access";
import * as costs from "@/app/api/custos/route";
import * as client from "@/app/api/clientes/[id]/route";
import * as clients from "@/app/api/clientes/route";
import * as articles from "@/app/api/inspecaoartigo/route";
import * as maintenance from "@/app/api/cron/certificados-maintenance/route";
import * as merge from "@/app/api/navios/merge-duplicates/route";
import { cleanTmpFolder, deduplicateAllFolders } from "@/lib/certificados-organizados";

jest.mock("@/lib/access-control", () => ({ getAccessContext: jest.fn() }));
jest.mock("@/lib/user-permissions", () => ({
  canViewPath: (permissions: { visiblePages: string[] }, path: string) => permissions.visiblePages.includes(path),
  canEditPath: (permissions: { editablePages: string[] }, path: string) => permissions.editablePages.includes(path),
}));
jest.mock("@/lib/prisma", () => ({ __esModule: true, default: {
  $transaction: jest.fn(),
  custo: { findMany: jest.fn(), create: jest.fn(), delete: jest.fn() },
  cliente: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), delete: jest.fn(), deleteMany: jest.fn(), create: jest.fn() },
  navio: { findMany: jest.fn(), updateMany: jest.fn() },
  artigoJangada: { findMany: jest.fn() },
} }));
jest.mock("@/lib/auditoria", () => ({ logAuditoria: jest.fn() }));
jest.mock("@/lib/certificados-organizados", () => ({ cleanTmpFolder: jest.fn(), deduplicateAllFolders: jest.fn() }));

const staff: AccessContext = {
  userId: 8, email: "staff@example.test", role: "USER", isAdmin: false,
  stationId: null, allowedStationIds: [7, 8],
  permissions: { visibleModules: [], visiblePages: ["/clientes", "/jangadas"], editablePages: ["/clientes"], editableFields: {}, allowedStationCodes: [] },
};
const admin: AccessContext = { ...staff, role: "ADMIN", isAdmin: true };
const context = { params: Promise.resolve({ id: "42" }) };
function request(path: string, method = "GET", body?: unknown, headers?: Record<string, string>) {
  return new NextRequest(`https://example.test${path}`, {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.replaceProperty(process, "env", { NODE_ENV: "test", CRON_SECRET: "synthetic-cron-secret" });
  jest.mocked(getAccessContext).mockResolvedValue(staff);
  jest.mocked(prisma.cliente.findFirst).mockResolvedValue(null);
  jest.mocked(prisma.cliente.findMany).mockResolvedValue([]);
  jest.mocked(prisma.navio.findMany).mockResolvedValue([]);
  jest.mocked(prisma.artigoJangada.findMany).mockResolvedValue([]);
  jest.mocked(prisma.$transaction).mockImplementation((async (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma)) as never);
  jest.mocked(cleanTmpFolder).mockResolvedValue({ deleted: 0, freedBytes: 0 });
});
afterEach(() => jest.restoreAllMocks());

const internalCalls = [
  () => costs.GET(),
  () => costs.POST(request("/api/custos", "POST", {})),
  () => costs.DELETE(request("/api/custos?id=42", "DELETE")),
  () => client.GET(request("/api/clientes/42"), context),
  () => client.PUT(request("/api/clientes/42", "PUT", { nome: "Changed" }), context),
  () => client.DELETE(request("/api/clientes/42", "DELETE"), context),
  () => clients.GET(request("/api/clientes")),
  () => clients.POST(request("/api/clientes", "POST", { nome: "Changed" })),
  () => clients.PUT(request("/api/clientes?id=42", "PUT", { nome: "Changed" })),
  () => clients.DELETE(request("/api/clientes", "DELETE", { ids: [42] })),
  () => articles.GET(request("/api/inspecaoartigo")),
  () => merge.GET(),
  () => merge.POST(request("/api/navios/merge-duplicates", "POST", { dryRun: false })),
  () => maintenance.POST(request("/api/cron/certificados-maintenance", "POST")),
];

it.each(internalCalls.map((call, index) => ({ call, index })))("denies missing internal access before any database operation ($index)", async ({ call }) => {
  // getAccessContext also returns null for a CLIENTE session, independently of the proxy.
  jest.mocked(getAccessContext).mockResolvedValue(null);
  expect((await call()).status).toBe(401);
  for (const delegate of Object.values(prisma)) {
    for (const operation of Object.values(delegate)) {
      if (jest.isMockFunction(operation)) expect(operation).not.toHaveBeenCalled();
    }
  }
  expect(cleanTmpFolder).not.toHaveBeenCalled();
  expect(deduplicateAllFolders).not.toHaveBeenCalled();
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it("requires explicit view/edit permission and reserves global operations for administrators", async () => {
  jest.mocked(getAccessContext).mockResolvedValue({ ...staff, permissions: { ...staff.permissions, visiblePages: [], editablePages: [] } });
  expect((await requireApiAccess("/clientes")).error?.status).toBe(403);
  expect((await clients.POST(request("/api/clientes", "POST", {}))).status).toBe(403);
  expect((await costs.GET()).status).toBe(403);
  expect((await merge.GET()).status).toBe(403);
  expect(prisma.cliente.create).not.toHaveBeenCalled();
});

it("fails closed for users without stations and never gives staff access to null-station records", () => {
  expect(apiStationScope({ ...staff, allowedStationIds: [] })).toEqual({ serviceStationId: { in: [] } });
  expect(apiStationScope(staff)).toEqual({ serviceStationId: { in: [7, 8] } });
  expect(apiStationScope(admin)).toEqual({});
  expect(apiStationScope(staff, 99)).toEqual({ serviceStationId: { in: [] } });
});

it("scopes client lookups and related vessels, and omits login codes", async () => {
  await client.GET(request("/api/clientes/42"), context);
  const scope = { serviceStationId: { in: [7, 8] } };
  expect(prisma.cliente.findFirst).toHaveBeenCalledWith({
    where: { id: 42, ...scope }, include: { navios: { where: scope } },
    omit: { verificationCode: true, verificationCodeExpires: true },
  });
});

it("honours an authorised active station and ignores a forged foreign station cookie", async () => {
  await client.GET(request("/api/clientes/42", "GET", undefined, { cookie: "active_service_station_id=8" }), context);
  expect(prisma.cliente.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: 42, serviceStationId: 8 } }));
  await client.GET(request("/api/clientes/42", "GET", undefined, { cookie: "active_service_station_id=99" }), context);
  expect(prisma.cliente.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: 42, serviceStationId: { in: [7, 8] } } }));
});

it("does not update or delete clients outside the allowed station scope", async () => {
  expect((await client.PUT(request("/api/clientes/42", "PUT", { nome: "Changed" }), context)).status).toBe(404);
  expect((await client.DELETE(request("/api/clientes/42", "DELETE"), context)).status).toBe(404);
  expect(prisma.cliente.update).not.toHaveBeenCalled();
  expect(prisma.cliente.delete).not.toHaveBeenCalled();
  expect(prisma.navio.updateMany).not.toHaveBeenCalled();
});

it("preserves legitimate client edits and keeps the station predicate on the final write", async () => {
  jest.mocked(prisma.cliente.findFirst).mockResolvedValue({ id: 42, nome: "Original", serviceStationId: 7 } as never);
  jest.mocked(prisma.cliente.update).mockResolvedValue({ id: 42, nome: "Updated", ilha: "São Miguel" } as never);
  const response = await client.PUT(request("/api/clientes/42", "PUT", { nome: "Updated" }), context);
  expect(response.status).toBe(200);
  expect(prisma.cliente.update).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 42, serviceStationId: { in: [7, 8] } }, data: { nome: "Updated" },
    omit: { verificationCode: true, verificationCodeExpires: true },
  }));
  expect(prisma.navio.updateMany).toHaveBeenCalledWith({
    where: { clienteId: 42, serviceStationId: { in: [7, 8] } }, data: { ilha: "São Miguel" },
  });
});

it("creates clients only in an authorised station and keeps duplicate lookups scoped", async () => {
  jest.mocked(prisma.cliente.create).mockResolvedValue({ id: 42, nome: "New client", serviceStationId: 8 } as never);
  const response = await clients.POST(request("/api/clientes", "POST", { nome: "New client", serviceStationId: 99 }, { cookie: "active_service_station_id=8" }));
  expect(response.status).toBe(201);
  expect(prisma.cliente.findFirst).toHaveBeenCalledWith({ where: { nome: "New client", serviceStationId: 8 }, select: { id: true } });
  expect(prisma.cliente.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ serviceStationId: 8 }) }));
});

it("cannot create an unassigned client when the user has no authorised stations", async () => {
  jest.mocked(getAccessContext).mockResolvedValue({ ...staff, allowedStationIds: [] });
  expect((await clients.POST(request("/api/clientes", "POST", { nome: "New client" }))).status).toBe(403);
  expect(prisma.cliente.findFirst).not.toHaveBeenCalled();
  expect(prisma.cliente.create).not.toHaveBeenCalled();
});

it("allows administrators to read the costs ledger", async () => {
  jest.mocked(getAccessContext).mockResolvedValue(admin);
  jest.mocked(prisma.custo.findMany).mockResolvedValue([]);
  expect((await costs.GET()).status).toBe(200);
  expect(prisma.custo.findMany).toHaveBeenCalledTimes(1);
});

it("rejects a mixed-station batch without partially deleting the accessible clients", async () => {
  jest.mocked(prisma.cliente.findMany).mockResolvedValue([{ id: 42 }] as never);
  const response = await clients.DELETE(request("/api/clientes", "DELETE", { ids: [42, 99] }));
  expect(response.status).toBe(404);
  expect(prisma.cliente.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: [42, 99] }, serviceStationId: { in: [7, 8] } } }));
  expect(prisma.cliente.deleteMany).not.toHaveBeenCalled();
});

it("aborts the transaction if a station changes during a batch deletion", async () => {
  jest.mocked(prisma.cliente.findMany).mockResolvedValue([{ id: 42 }, { id: 43 }] as never);
  jest.mocked(prisma.cliente.deleteMany).mockResolvedValue({ count: 1 });
  // The actual Prisma transaction rolls back when the callback rejects.
  const rejected = jest.fn();
  jest.mocked(prisma.$transaction).mockImplementation((async (callback: (tx: typeof prisma) => Promise<unknown>) => {
    try { return await callback(prisma); } catch (error) { rejected(); throw error; }
  }) as never);
  expect((await clients.DELETE(request("/api/clientes", "DELETE", { ids: [42, 43] }))).status).toBe(404);
  expect(rejected).toHaveBeenCalledTimes(1);
});

it("scopes articles and stock, and excludes mismatched historical inspections", async () => {
  jest.mocked(prisma.artigoJangada.findMany).mockResolvedValue([
    { id: 1, jangadaId: 42, inspecao: { jangadaId: 42 } },
    { id: 2, jangadaId: 42, inspecao: { jangadaId: 99 } },
  ] as never);
  const response = await articles.GET(request("/api/inspecaoartigo"));
  expect((await response.json()).map((row: { id: number }) => row.id)).toEqual([1]);
  const scope = { serviceStationId: { in: [7, 8] } };
  expect(prisma.artigoJangada.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
    Jangada: scope, OR: [{ stockId: null }, { stock: { OR: [scope, { serviceStationId: null }] } }],
  } }));
});

it("never runs cleanup on GET, even for a configured cron", async () => {
  expect((await maintenance.GET()).status).toBe(405);
  expect(cleanTmpFolder).not.toHaveBeenCalled();
});

it.each(["", "Bearer wrong", "synthetic-cron-secret"])("rejects invalid cron credentials %s", async authorization => {
  jest.mocked(getAccessContext).mockResolvedValue(null);
  expect((await maintenance.POST(request("/api/cron/certificados-maintenance", "POST", undefined, { authorization }))).status).toBe(401);
  expect(cleanTmpFolder).not.toHaveBeenCalled();
});

it("allows only authenticated POST cleanup with safe retention", async () => {
  const response = await maintenance.POST(request("/api/cron/certificados-maintenance?maxAgeDays=30", "POST", undefined, { authorization: "Bearer synthetic-cron-secret" }));
  expect(response.status).toBe(200);
  expect(cleanTmpFolder).toHaveBeenCalledWith(30);
  expect(getAccessContext).not.toHaveBeenCalled();
  expect(deduplicateAllFolders).not.toHaveBeenCalled();
});

it.each(["-1", "0", "1", "6", "7.5", "NaN", "", "3651"])("rejects unsafe cleanup retention %s", async age => {
  jest.mocked(getAccessContext).mockResolvedValue(admin);
  expect((await maintenance.POST(request(`/api/cron/certificados-maintenance?maxAgeDays=${age}`, "POST"))).status).toBe(400);
  expect(cleanTmpFolder).not.toHaveBeenCalled();
});

it.each(["all", "dedupe"])("keeps archive deduplication suspended even for administrators: %s", async action => {
  jest.mocked(getAccessContext).mockResolvedValue(admin);
  expect((await maintenance.POST(request(`/api/cron/certificados-maintenance?action=${action}`, "POST"))).status).toBe(409);
  expect(cleanTmpFolder).not.toHaveBeenCalled();
  expect(deduplicateAllFolders).not.toHaveBeenCalled();
});

it("rejects automatic vessel merges even for administrators before reading candidates", async () => {
  jest.mocked(getAccessContext).mockResolvedValue(admin);
  const response = await merge.POST(request("/api/navios/merge-duplicates", "POST", { dryRun: false }));
  expect(response.status).toBe(409);
  expect((await response.json()).code).toBe("MERGE_REQUIRES_REVIEW");
  expect(prisma.navio.findMany).not.toHaveBeenCalled();
  expect(prisma.navio.updateMany).not.toHaveBeenCalled();
});

it("preserves read-only vessel candidate analysis for administrators", async () => {
  jest.mocked(getAccessContext).mockResolvedValue(admin);
  expect((await merge.POST(request("/api/navios/merge-duplicates", "POST", { dryRun: true }))).status).toBe(200);
  expect(prisma.navio.findMany).toHaveBeenCalledTimes(1);
  expect(prisma.navio.updateMany).not.toHaveBeenCalled();
});
