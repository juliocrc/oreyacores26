import { NextRequest } from "next/server";
import { getAuthSession } from "@/auth";
import { getAccessContext } from "@/lib/access-control";
import prisma from "@/lib/prisma";
import { GET } from "./route";

jest.mock("@/auth", () => ({ getAuthSession: jest.fn() }));
jest.mock("@/lib/access-control", () => ({ getAccessContext: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ __esModule: true, default: {
  tecnico: { findMany: jest.fn() }, agendaEvento: { findMany: jest.fn(), findFirst: jest.fn() },
  tecnicoAusencia: { findMany: jest.fn() }, jangada: { findFirst: jest.fn() },
} }));
const request = (query = "", cookie = "active_service_station_id=2") => new NextRequest(`http://localhost/api/agenda/disponibilidade?date=2026-10-12${query}`, { headers: { cookie } });
beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getAuthSession).mockResolvedValue({ user: { id: "7", role: "USER" } } as never);
  jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: false, allowedStationIds: [2], stationId: null } as never);
  jest.mocked(prisma.tecnico.findMany).mockResolvedValue([{ id: 1, nome: "Ana" }] as never);
  jest.mocked(prisma.agendaEvento.findMany).mockResolvedValue([]);
  jest.mocked(prisma.tecnicoAusencia.findMany).mockResolvedValue([]);
});
it("rejects missing sessions and CLIENTE before any read", async () => {
  jest.mocked(getAuthSession).mockResolvedValue(null);
  expect((await GET(request())).status).toBe(401);
  jest.mocked(getAuthSession).mockResolvedValue({ user: { id: "7", role: "CLIENTE" } } as never);
  expect((await GET(request())).status).toBe(403);
  expect(prisma.tecnico.findMany).not.toHaveBeenCalled();
});
it("rejects unauthorized stations and fails closed with no selected station or allowlist", async () => {
  expect((await GET(request("&stationId=9"))).status).toBe(403);
  jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: false, allowedStationIds: [], stationId: null } as never);
  expect((await GET(request())).status).toBe(400);
  expect(prisma.tecnico.findMany).not.toHaveBeenCalled();
});
it.each(["&durationMinutes=0", "&durationMinutes=1441", "&durationMinutes=1.5", "&durationMinutes=1e2", "&excludeId=-1", "&excludeId=2147483648", "&responsavel=", "&raftSerial=", "&date=2026-01-01"])("validates %s before loading data", async query => {
  expect((await GET(request(query))).status).toBe(400);
  expect(prisma.tecnico.findMany).not.toHaveBeenCalled();
});
it("scopes roster, events and absences, never filtering all events by the requested raft", async () => {
  jest.mocked(prisma.jangada.findFirst).mockResolvedValue({ id: 4 } as never);
  const response = await GET(request("&raftSerial=R1"));
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(prisma.tecnico.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { serviceStationId: 2, ativo: true } }));
  expect(prisma.agendaEvento.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { serviceStationId: 2 } }));
  expect(prisma.tecnicoAusencia.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ OR: [{ tecnicoId: { in: [1] } }, { tecnicoId: null, tecnicoKey: { in: ["ana"] } }] }) }));
});
it("does not invent a global technician fallback for empty rosters", async () => {
  jest.mocked(prisma.tecnico.findMany).mockResolvedValue([]);
  const body = await (await GET(request())).json();
  expect(body.technicians).toEqual([]);
  expect(body.suggestions).toEqual([]);
});
it("returns indistinguishable not-found errors for out-of-scope resources", async () => {
  expect((await GET(request("&responsavel=Secret"))).status).toBe(404);
  expect((await GET(request("&raftSerial=Secret"))).status).toBe(404);
  expect((await GET(request("&excludeId=8"))).status).toBe(404);
});
it("fails rather than suggesting slots when absences cannot be loaded", async () => {
  jest.mocked(prisma.tecnicoAusencia.findMany).mockRejectedValue(new Error("secret database URL"));
  const response = await GET(request());
  expect(response.status).toBe(500);
  expect(JSON.stringify(await response.json())).not.toContain("secret");
});

it("uses full legacy absence intervals only against the station roster and reports that fallback", async () => {
  jest.mocked(prisma.tecnicoAusencia.findMany).mockResolvedValue([
    { tecnicoId: null, tecnicoKey: "ana", dataInicio: new Date("2026-10-11T00:00Z"), dataFim: new Date("2026-10-14T00:00Z") },
  ] as never);
  const body = await (await GET(request())).json();
  expect(body.technicians[0].days[0].availableMinutes).toBe(0);
  expect(body.technicians[0].days[1].availableMinutes).toBe(0);
  expect(body.suggestions[0].start).toBe("2026-10-14T09:15:00.000Z");
  expect(body.warnings.join(" ")).toContain("legadas");
});

it("requires a station even for admins and never falls back to a global roster", async () => {
  jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: true, allowedStationIds: [], stationId: null } as never);
  expect((await GET(request("", ""))).status).toBe(400);
  expect(prisma.tecnico.findMany).not.toHaveBeenCalled();
});
