import { NextRequest, NextResponse } from "next/server";
import { GET } from "@/app/api/globalfishazores/history/route";
import { GET as getFleet } from "@/app/api/navios/route";

jest.mock("@/app/api/navios/route", () => ({ GET: jest.fn() }));
const fleetMock = getFleet as jest.MockedFunction<(req: NextRequest) => Promise<NextResponse>>;
const request = (query = "vesselId=7") => new NextRequest(`http://localhost/api/globalfishazores/history?${query}`, { headers: { cookie: "active_service_station_id=2" } });
const vessel = { id: 7, nome: "Real vessel", mmsi: "204201560", imo: "9207223" };
const originalFetch = global.fetch;
const fetchMock = jest.fn();

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date("2026-10-24T12:00:00Z"));
  fleetMock.mockReset();
  fleetMock.mockResolvedValue(NextResponse.json([vessel]));
  fetchMock.mockReset();
  global.fetch = fetchMock;
});
afterEach(() => { jest.useRealTimers(); global.fetch = originalFetch; });

it("uses the authenticated fleet and requests exactly 48h anonymously without trusting supplied identifiers", async () => {
  fetchMock.mockResolvedValue(NextResponse.json({ geometry: { type: "LineString", coordinates: [[-25, 38]] }, properties: { times: ["2026-10-24T10:00:00Z"] } }));
  const response = await GET(request("vesselId=7&mmsi=999999999"));
  const body = await response.json();
  expect(body).toMatchObject({ vesselId: 7, mmsi: vessel.mmsi, imo: vessel.imo, from: "2026-10-22T12:00:00.000Z", to: "2026-10-24T12:00:00.000Z" });
  expect(body.points).toHaveLength(1);
  const [url, options] = fetchMock.mock.calls[0];
  expect(url.pathname).toBe("/v1/vessels/204201560/track");
  expect(url.searchParams.get("from")).toBe(body.from);
  expect(url.searchParams.get("to")).toBe(body.to);
  expect(options.headers).toEqual({ Accept: "application/json" });
  expect(fleetMock.mock.calls[0][0].headers.get("cookie")).toContain("active_service_station_id=2");
  expect(fleetMock.mock.calls[0][0].nextUrl.search).toBe("");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});

it.each([401, 403, 500])("propagates fleet access/load failure %s without external calls", async (status) => {
  fleetMock.mockResolvedValue(NextResponse.json({ error: "denied" }, { status }));
  expect((await GET(request())).status).toBe(status);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("rejects IDs outside the list and IMO-only vessels without external calls", async () => {
  expect((await GET(request("vesselId=8"))).status).toBe(404);
  fleetMock.mockResolvedValue(NextResponse.json([{ ...vessel, mmsi: null }]));
  expect((await GET(request())).status).toBe(422);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("rejects ambiguous duplicate MMSI", async () => {
  fleetMock.mockResolvedValue(NextResponse.json([vessel, { ...vessel, id: 8 }]));
  expect((await GET(request())).status).toBe(409);
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each(["vesselId=NaN", "vesselId=-1", "vesselId=1.5", ""]) ("rejects invalid input %s", async (query) => {
  expect((await GET(request(query))).status).toBe(400);
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each([401, 403, 429, 500])("reports provider failure %s without fabricated points", async (status) => {
  fetchMock.mockResolvedValue(NextResponse.json({}, { status }));
  const response = await GET(request());
  expect(response.status).toBe(502);
  expect(await response.json()).not.toHaveProperty("points");
});

it("reports a network failure", async () => {
  fetchMock.mockRejectedValue(new Error("offline"));
  expect((await GET(request())).status).toBe(502);
});

it("aborts a stalled provider after eight seconds", async () => {
  fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("timeout")))));
  const pending = GET(request());
  await jest.advanceTimersByTimeAsync(8001);
  expect((await pending).status).toBe(502);
});
