import { NextRequest, NextResponse } from "next/server";
import { GET as getFleet } from "@/app/api/navios/route";
import { FleetVessel, parseHistory, vesselIdentifier } from "@/modules/globalfishazores/history";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("vesselId"));
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Embarcacao invalida." }, { status: 400 });

  // Reuse the application's authenticated, station-scoped fleet, not client-supplied MMSI.
  const fleetUrl = new URL("/api/navios", req.url);
  const fleetResponse = await getFleet(new NextRequest(fleetUrl, { headers: req.headers }));
  if (!fleetResponse.ok) return fleetResponse;
  const fleet = await fleetResponse.json() as FleetVessel[];
  const vessel = fleet.find((item) => item.id === id);
  if (!vessel) return NextResponse.json({ error: "Embarcacao fora da lista atual." }, { status: 404 });
  const mmsi = vesselIdentifier(vessel.mmsi, "mmsi");
  if (!mmsi) return NextResponse.json({ error: "OpenWaters requer MMSI valido; pesquisa apenas por IMO nao suportada." }, { status: 422 });
  if (fleet.filter((item) => vesselIdentifier(item.mmsi, "mmsi") === mmsi).length !== 1) {
    return NextResponse.json({ error: "MMSI duplicado na lista; correspondencia ambigua." }, { status: 409 });
  }
  const to = new Date().toISOString();
  const from = new Date(Date.parse(to) - 48 * 60 * 60 * 1000).toISOString();
  const url = new URL(`https://ais.openwaters.io/v1/vessels/${mmsi}/track`);
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    // Anonymous history only. Never fan out to credentialed or paid AIS providers.
    const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal: controller.signal });
    if (!response.ok) {
      const error = response.status === 401 || response.status === 403
        ? "OpenWaters exige autorizacao para este historico. Nenhuma credencial foi utilizada."
        : `Historico OpenWaters indisponivel (HTTP ${response.status}).`;
      return NextResponse.json({ error }, { status: 502 });
    }
    const history = parseHistory(await response.json(), from, to);
    return NextResponse.json({ vesselId: id, mmsi, imo: vesselIdentifier(vessel.imo, "imo"), from, to, source: "OpenWaters AIS (consulta anonima)", ...history }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Nao foi possivel obter historico OpenWaters valido; ligacao, formato ou tempo limite." }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
