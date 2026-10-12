import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

type AisPositionResult = {
  found: boolean;
  lat?: number | null;
  lng?: number | null;
  speed?: number | null;
  course?: number | null;
  heading?: number | null;
  navStatus?: string | null;
  name?: string | null;
  updatedAt?: string | null;
  source: string;
  precise?: boolean;
  attribution?: string | null;
  error?: string | null;
};

type AisProviderDiagnostic = {
  source: string;
  found: boolean;
  updatedAt?: string | null;
  error?: string | null;
};

type AisTrackPoint = { lat: number; lng: number; time?: string | null };

type AisTrackResult = {
  points: AisTrackPoint[];
  from?: string | null;
  to?: string | null;
};

type AisProvider = {
  source: string;
  query: (mmsi: string) => Promise<AisPositionResult>;
};

const OPENWATERS_BASE_URL = "https://ais.openwaters.io";
const OPENWATERS_TIMEOUT_MS = 8000;
const OPENWATERS_TRACK_DAYS = 7;
const MARINESIA_BASE_URL = "https://api.marinesia.com";
const MARINESIA_TIMEOUT_MS = 8000;
const MARINESIA_TRACK_TIMEOUT_MS = 3500;
const AISSTREAM_TIMEOUT_MS = 8000;
const AISHUB_TIMEOUT_MS = 8000;
const AIS_SOFT_DEADLINE_MS = 5500;

const AIS_PROVIDER_PRIORITY: Record<string, number> = {
  marinesia: 0,
  openwaters_live: 1,
  openwaters: 2,
  aisstream: 3,
  aishub: 4,
};

function normalizeMmsi(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 7 ? digits : null;
}

function normalizeCallSignal(value: unknown): string | null {
  const raw = String(value ?? '').trim().toUpperCase();
  return raw || null;
}

function parseNumeric(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseAisTimestamp(value: unknown): number {
  if (value === null || value === undefined) return 0;
  let raw = String(value).trim();
  if (!raw) return 0;
  raw = raw.replace(/\s+UTC$/i, '').replace(/\s+([+-]\d{2}:?\d{2})$/, '$1');
  const hasTimezone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw);
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const parsed = Date.parse(hasTimezone ? iso : `${iso}Z`);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCourse(value: number | null): number | null {
  return value !== null && value >= 0 && value < 360 ? value : null;
}

function normalizeHeading(value: number | null): number | null {
  return value !== null && value >= 0 && value < 360 ? value : null;
}

function isUsablePosition(result: AisPositionResult): boolean {
  return Boolean(
    result.found
    && Number.isFinite(result.lat)
    && Number.isFinite(result.lng)
    && result.lat !== null
    && result.lng !== null,
  );
}

function providerRank(source: string): number {
  return AIS_PROVIDER_PRIORITY[source] ?? 99;
}

function createAbort(timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, clear: () => clearTimeout(timer) };
}

function abortedError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

async function queryMarinesia(mmsi: string): Promise<AisPositionResult> {
  const key = process.env.MARINESIA_API_KEY;
  if (!key) return { found: false, source: 'marinesia', error: 'MARINESIA_API_KEY não configurada.' };

  const url = new URL(`/api/v1/vessel/${encodeURIComponent(mmsi)}/location/latest`, MARINESIA_BASE_URL);
  url.searchParams.set('key', key);

  const { controller, clear } = createAbort(MARINESIA_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });

    if (response.status === 404) return { found: false, source: 'marinesia', error: 'O MarineSIA não conhece este MMSI.' };
    if (response.status === 401 || response.status === 403) return { found: false, source: 'marinesia', error: 'Chave MarineSIA inválida ou sem permissão.' };
    if (response.status === 429) return { found: false, source: 'marinesia', error: 'Limite de pedidos MarineSIA atingido.' };
    if (!response.ok) return { found: false, source: 'marinesia', error: `MarineSIA respondeu ${response.status}.` };

    const payload = await response.json().catch(() => null) as
      | { error?: boolean; message?: string; data?: Record<string, unknown> | null }
      | null;

    if (!payload || payload.error) {
      return { found: false, source: 'marinesia', error: payload?.message || 'MarineSIA devolveu um erro.' };
    }

    const data = payload.data;
    if (!data) return { found: false, source: 'marinesia', error: 'Sem posição MarineSIA para este MMSI.' };

    const lat = parseNumeric(data.lat);
    const lng = parseNumeric(data.lng);
    const navStatusRaw = data.status;

    return {
      found: lat !== null && lng !== null,
      lat,
      lng,
      speed: parseNumeric(data.sog),
      course: normalizeCourse(parseNumeric(data.cog)),
      heading: normalizeHeading(parseNumeric(data.hdt)),
      navStatus: navStatusRaw === null || navStatusRaw === undefined ? null : String(navStatusRaw),
      name: null,
      updatedAt: typeof data.ts === 'string' ? data.ts : null,
      source: 'marinesia',
      precise: data.pos_acc === true || data.valid === true,
      error: lat === null || lng === null ? 'Sem posição MarineSIA para este MMSI.' : null,
    };
  } catch (error) {
    return {
      found: false,
      source: 'marinesia',
      error: abortedError(error) ? 'O MarineSIA não respondeu a tempo.' : 'Erro de ligação ao MarineSIA.',
    };
  } finally {
    clear();
  }
}

async function queryOpenWaters(mmsi: string): Promise<AisPositionResult> {
  const token = process.env.OPENWATERS_AIS_TOKEN || process.env.AIS_TOKEN;
  const url = new URL(`/v1/vessels/${encodeURIComponent(mmsi)}`, OPENWATERS_BASE_URL);

  const { controller, clear } = createAbort(OPENWATERS_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), {
      headers: token
        ? { Accept: 'application/json', Authorization: `Bearer ${token}` }
        : { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });

    if (response.status === 404) return { found: false, source: 'openwaters', error: 'O OpenWaters não conhece este MMSI.' };
    if (response.status === 400) return { found: false, source: 'openwaters', error: 'MMSI inválido para o OpenWaters.' };
    if (response.status === 401 || response.status === 403) return { found: false, source: 'openwaters', error: 'Token do OpenWaters inválido ou sem permissão.' };
    if (response.status === 429) return { found: false, source: 'openwaters', error: 'Limite de pedidos do OpenWaters atingido.' };
    if (!response.ok) return { found: false, source: 'openwaters', error: `OpenWaters respondeu ${response.status}.` };

    const feature = await response.json().catch(() => null) as
      | {
          attribution?: unknown;
          geometry?: { type?: string; coordinates?: unknown[] } | null;
          properties?: Record<string, unknown> | null;
        }
      | { error?: string }
      | null;

    if (feature && typeof feature === 'object' && 'error' in feature && feature.error) {
      return { found: false, source: 'openwaters', error: String(feature.error) };
    }

    const properties = (feature as { properties?: Record<string, unknown> } | null)?.properties || {};
    const coordinates = (feature as { geometry?: { coordinates?: unknown[] } | null } | null)?.geometry?.coordinates;

    const lat = Array.isArray(coordinates) ? parseNumeric(coordinates[1]) : null;
    const lng = Array.isArray(coordinates) ? parseNumeric(coordinates[0]) : null;
    const navStatusRaw = properties.nav_status;
    const rawAttribution = (feature as { attribution?: unknown } | null)?.attribution ?? properties.attribution;

    return {
      found: lat !== null && lng !== null,
      lat,
      lng,
      speed: parseNumeric(properties.sog),
      course: normalizeCourse(parseNumeric(properties.cog)),
      heading: normalizeHeading(parseNumeric(properties.heading)),
      navStatus: navStatusRaw === null || navStatusRaw === undefined ? null : String(navStatusRaw),
      name: typeof properties.name === 'string' ? properties.name.trim() || null : null,
      updatedAt: typeof properties.seen === 'string' ? properties.seen : null,
      source: 'openwaters',
      precise: false,
      attribution: typeof rawAttribution === 'string' ? rawAttribution : null,
      error: lat === null || lng === null ? 'Sem posição conhecida para este MMSI no OpenWaters.' : null,
    };
  } catch (error) {
    return {
      found: false,
      source: 'openwaters',
      error: abortedError(error) ? 'O OpenWaters não respondeu a tempo.' : 'Erro de ligação ao OpenWaters.',
    };
  } finally {
    clear();
  }
}

async function queryAisWebSocket(params: {
  url: string;
  apiKey: string;
  mmsi: string;
  source: string;
  timeoutMs: number;
}): Promise<AisPositionResult> {
  const { url, apiKey, mmsi, source, timeoutMs } = params;

  let WebSocket: typeof import('ws').WebSocket;
  try {
    const wsModule = await import('ws');
    WebSocket = wsModule.default as unknown as typeof import('ws').WebSocket;
  } catch {
    return { found: false, source, error: 'Módulo WebSocket indisponível.' };
  }

  return new Promise((resolve) => {
    let socket: InstanceType<typeof WebSocket> | null = null;
    let settled = false;

    const finish = (result: AisPositionResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket?.close(); } catch {}
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({ found: false, source, error: `${source} não enviou uma posição neste intervalo.` });
    }, timeoutMs);

    try {
      socket = new WebSocket(url);

      socket.on("open", () => {
        try {
          socket?.send(JSON.stringify({
            APIKey: apiKey,
            BoundingBoxes: [[[-90, -180], [90, 180]]],
            FiltersShipMMSI: [mmsi],
            FilterMessageTypes: ["PositionReport", "StandardClassBPositionReport", "ExtendedClassBPositionReport"],
          }));
        } catch {
          finish({ found: false, source, error: `${source} não enviou uma posição neste intervalo.` });
        }
      });

      socket.on("message", (data: Buffer | ArrayBuffer | Buffer[]) => {
        try {
          const buffer = Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data);
          const parsed = JSON.parse(buffer.toString());
          const messageType = parsed.MessageType;
          const body = parsed.Message?.[messageType];
          const meta = parsed.MetaData;

          if (body && (body.Latitude !== undefined || body.Longitude !== undefined || meta?.latitude !== undefined)) {
            const lat = parseNumeric(body.Latitude ?? meta?.latitude);
            const lng = parseNumeric(body.Longitude ?? meta?.longitude);
            if (lat !== null && lng !== null) {
              finish({
                found: true,
                lat,
                lng,
                speed: parseNumeric(body.Sog ?? body.sog),
                course: normalizeCourse(parseNumeric(body.Cog ?? body.cog)),
                heading: normalizeHeading(parseNumeric(body.TrueHeading ?? body.trueHeading)),
                navStatus: typeof body.NavigationalStatus === 'number' ? String(body.NavigationalStatus) : null,
                name: typeof meta?.ShipName === 'string' ? meta.ShipName.trim() || null : null,
                updatedAt: typeof meta?.time_utc === 'string' ? meta.time_utc : new Date().toISOString(),
                source,
                precise: false,
              });
            }
          }
        } catch {}
      });

      socket.on("error", () => finish({ found: false, source, error: `Erro de ligação ao ${source}.` }));
    } catch {
      finish({ found: false, source, error: `Não foi possível abrir a ligação ao ${source}.` });
    }
  });
}

async function queryAisStream(mmsi: string): Promise<AisPositionResult> {
  const apiKey = process.env.AISSTREAM_API_KEY || process.env.AISTREAM_API_KEY;
  if (!apiKey) return { found: false, source: 'aisstream', error: 'AISSTREAM_API_KEY não configurada.' };
  return queryAisWebSocket({
    url: "wss://stream.aisstream.io/v0/stream",
    apiKey,
    mmsi,
    source: 'aisstream',
    timeoutMs: AISSTREAM_TIMEOUT_MS,
  });
}

async function queryOpenWatersLive(mmsi: string): Promise<AisPositionResult> {
  const apiKey = process.env.OPENWATERS_AIS_TOKEN || process.env.AIS_TOKEN;
  if (!apiKey) return { found: false, source: 'openwaters_live', error: 'OPENWATERS_AIS_TOKEN não configurada (necessário para o stream em tempo real).' };
  return queryAisWebSocket({
    url: "wss://ais.openwaters.io/v0/stream",
    apiKey,
    mmsi,
    source: 'openwaters_live',
    timeoutMs: OPENWATERS_TIMEOUT_MS,
  });
}

async function queryAishub(mmsi: string): Promise<AisPositionResult> {
  const username = process.env.AISHUB_USERNAME;
  if (!username) return { found: false, source: 'aishub', error: 'AISHUB_USERNAME não configurada.' };

  const url = `http://data.aishub.net/ws.php?username=${encodeURIComponent(username)}&format=1&output=json&compress=0&mmsi=${encodeURIComponent(mmsi)}`;
  const { controller, clear } = createAbort(AISHUB_TIMEOUT_MS);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) return { found: false, source: 'aishub', error: `AISHub respondeu ${response.status}.` };

    const payload = await response.json().catch(() => null) as unknown;
    const rows = Array.isArray(payload) && Array.isArray(payload[1]) ? payload[1] as Array<Record<string, unknown>> : [];
    const row = rows[0];
    if (!row) return { found: false, source: 'aishub', error: 'Sem posição AISHub para este MMSI.' };

    const lat = parseNumeric(row.LATITUDE);
    const lng = parseNumeric(row.LONGITUDE);

    return {
      found: lat !== null && lng !== null,
      lat,
      lng,
      speed: parseNumeric(row.SPEED),
      course: normalizeCourse(parseNumeric(row.COURSE)),
      heading: normalizeHeading(parseNumeric(row.HEADING)),
      navStatus: row.NAVSTAT === null || row.NAVSTAT === undefined ? null : String(row.NAVSTAT),
      name: typeof row.NAME === 'string' ? row.NAME.trim() || null : null,
      updatedAt: typeof row.TIME === 'string' ? row.TIME : (typeof row.TIMESTAMP === 'string' ? row.TIMESTAMP : null),
      source: 'aishub',
      precise: false,
    };
  } catch (error) {
    return {
      found: false,
      source: 'aishub',
      error: abortedError(error) ? 'O AISHub não respondeu a tempo.' : 'Erro de ligação ao AISHub.',
    };
  } finally {
    clear();
  }
}

async function queryMarinesiaTrack(mmsi: string): Promise<AisTrackResult> {
  const key = process.env.MARINESIA_API_KEY;
  if (!key) return { points: [] };

  const url = new URL(`/api/v1/vessel/${encodeURIComponent(mmsi)}/location`, MARINESIA_BASE_URL);
  url.searchParams.set('key', key);

  const { controller, clear } = createAbort(MARINESIA_TRACK_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    // Histórico é premium: 401/403/429 não justificam esperar.
    if (response.status === 401 || response.status === 403 || response.status === 429) return { points: [] };
    if (!response.ok) return { points: [] };

    const payload = await response.json().catch(() => null) as unknown;
    const rows = Array.isArray(payload)
      ? payload as Array<Record<string, unknown>>
      : Array.isArray((payload as { data?: unknown } | null)?.data)
        ? ((payload as { data: Array<Record<string, unknown>> }).data)
        : [];

    const points = rows
      .map((row): AisTrackPoint | null => {
        const lat = parseNumeric(row.lat);
        const lng = parseNumeric(row.lng);
        if (lat === null || lng === null) return null;
        return { lat, lng, time: typeof row.ts === 'string' ? row.ts : null };
      })
      .filter((point): point is AisTrackPoint => point !== null);

    return { points };
  } catch {
    return { points: [] };
  } finally {
    clear();
  }
}

async function queryOpenWatersTrack(mmsi: string, days = OPENWATERS_TRACK_DAYS): Promise<AisTrackResult> {
  const token = process.env.OPENWATERS_AIS_TOKEN || process.env.AIS_TOKEN;
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const url = new URL(`/v1/vessels/${encodeURIComponent(mmsi)}/track`, OPENWATERS_BASE_URL);
  url.searchParams.set('from', from.toISOString());
  url.searchParams.set('to', to.toISOString());

  const { controller, clear } = createAbort(OPENWATERS_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), {
      headers: token
        ? { Accept: 'application/json', Authorization: `Bearer ${token}` }
        : { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) return { points: [] };

    const feature = await response.json().catch(() => null) as
      | { geometry?: { coordinates?: unknown[] } | null; properties?: { times?: unknown[]; from?: string; to?: string } | null }
      | null;

    const coordinates = feature?.geometry?.coordinates;
    const times = feature?.properties?.times;
    const fromValue = typeof feature?.properties?.from === 'string' ? feature.properties.from : null;
    const toValue = typeof feature?.properties?.to === 'string' ? feature.properties.to : null;

    if (!Array.isArray(coordinates)) return { points: [], from: fromValue, to: toValue };

    const points = coordinates
      .map((coord, index): AisTrackPoint | null => {
        if (!Array.isArray(coord)) return null;
        const lng = parseNumeric(coord[0]);
        const lat = parseNumeric(coord[1]);
        if (lat === null || lng === null) return null;
        const time = Array.isArray(times) && typeof times[index] === 'string' ? (times[index] as string) : null;
        return { lat, lng, time };
      })
      .filter((point): point is AisTrackPoint => point !== null);

    return { points, from: fromValue, to: toValue };
  } catch {
    return { points: [] };
  } finally {
    clear();
  }
}

async function resolveBestPosition(mmsi: string): Promise<{ best: AisPositionResult; diagnostics: AisProviderDiagnostic[] }> {
  const providers: AisProvider[] = [
    { source: 'marinesia', query: queryMarinesia },
    { source: 'openwaters', query: queryOpenWaters },
    { source: 'openwaters_live', query: queryOpenWatersLive },
    { source: 'aisstream', query: queryAisStream },
    { source: 'aishub', query: queryAishub },
  ];

  const results: AisPositionResult[] = [];
  let usableFound = false;
  let resolveEarly: (() => void) | null = null;
  const earlyExit = new Promise<void>((resolve) => { resolveEarly = resolve; });

  const tasks = providers.map(async ({ query }) => {
    const result = await query(mmsi);
    results.push(result);
    if (!usableFound && isUsablePosition(result)) {
      usableFound = true;
      resolveEarly?.();
    }
    return result;
  });

  await Promise.race([
    Promise.allSettled(tasks),
    new Promise((resolve) => setTimeout(resolve, AIS_SOFT_DEADLINE_MS)),
    earlyExit,
  ]);

  const usable = results.filter(isUsablePosition);
  usable.sort((a, b) => {
    const timeA = parseAisTimestamp(a.updatedAt);
    const timeB = parseAisTimestamp(b.updatedAt);
    if (timeB !== timeA) return timeB - timeA;
    if (Boolean(a.precise) !== Boolean(b.precise)) return a.precise ? -1 : 1;
    return providerRank(a.source) - providerRank(b.source);
  });

  const diagnostics: AisProviderDiagnostic[] = providers.map(({ source }) => {
    const result = results.find((item) => item.source === source);
    return {
      source,
      found: Boolean(result && isUsablePosition(result)),
      updatedAt: result?.updatedAt ?? null,
      error: result?.error ?? null,
    };
  });

  if (usable.length) return { best: usable[0], diagnostics };

  const ordered = providers
    .map(({ source }) => results.find((item) => item.source === source))
    .filter((result): result is AisPositionResult => Boolean(result));

  const stripConfigNote = (text: string) => text.replace(/ \(necessário para o? [^)]*\)/i, '');

  const detail = ordered.map((result) => {
    if (isUsablePosition(result)) return `${result.source}: ok`;
    if (result.error && /não configurad/i.test(result.error)) {
      const label =
        result.source === 'openwaters_live' ? 'stream OpenWaters'
        : result.source === 'aisstream' ? 'AISStream'
        : result.source === 'aishub' ? 'AISHub'
        : result.source;
      return `${label}: não configurado`;
    }
    return `${result.source}: ${stripConfigNote(result.error ?? 'sem posição')}`;
  });

  const dataError = ordered.find((result) => result.error && !/não configurad/i.test(result.error));
  const headline = dataError?.error
    ? stripConfigNote(dataError.error)
    : 'Sem posição AIS disponível para este MMSI nas fontes configuradas.';

  return {
    best: { found: false, source: 'none', error: `${headline}\n${detail.join('\n')}` },
    diagnostics,
  };
}

async function resolveTrack(mmsi: string): Promise<AisTrackResult> {
  const [openwaters, marinesia] = await Promise.all([
    queryOpenWatersTrack(mmsi),
    queryMarinesiaTrack(mmsi),
  ]);

  const seen = new Set<string>();
  const points = [...openwaters.points, ...marinesia.points]
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
    .sort((a, b) => parseAisTimestamp(a.time) - parseAisTimestamp(b.time))
    .filter((point) => {
      const key = `${point.lat.toFixed(5)},${point.lng.toFixed(5)},${point.time || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return {
    points,
    from: openwaters.from ?? marinesia.from ?? null,
    to: openwaters.to ?? marinesia.to ?? null,
  };
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isFinite(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

    const navio = await prisma.navio.findUnique({
      where: { id },
      select: {
        id: true,
        nome: true,
        matricula: true,
        mmsi: true,
        callSignal: true,
        lat: true,
        lng: true,
      },
    });

    if (!navio) return NextResponse.json({ error: 'Navio não encontrado' }, { status: 404 });

    const mmsi = normalizeMmsi(navio.mmsi);
    const callSignal = normalizeCallSignal(navio.callSignal);

    let live: AisPositionResult = { found: false, source: 'none' };
    let track: AisTrackResult = { points: [] };
    let diagnostics: AisProviderDiagnostic[] = [];

    if (mmsi) {
      const [positionResult, trackResult] = await Promise.all([
        resolveBestPosition(mmsi),
        resolveTrack(mmsi),
      ]);
      live = positionResult.best;
      diagnostics = positionResult.diagnostics;
      track = trackResult;
    } else {
      live = { found: false, source: 'none', error: 'MMSI não configurado.' };
    }

    const savedLat = parseNumeric(navio.lat);
    const savedLng = parseNumeric(navio.lng);

    const hasLiveCoords = isUsablePosition(live);

    if (hasLiveCoords) {
      await prisma.navio.update({
        where: { id: navio.id },
        data: { lat: live.lat, lng: live.lng },
      });
    }

    const finalLat = hasLiveCoords ? live.lat : savedLat;
    const finalLng = hasLiveCoords ? live.lng : savedLng;

    return NextResponse.json({
      navioId: navio.id,
      nome: navio.nome,
      matricula: navio.matricula,
      mmsi,
      callSignal,
      position: {
        lat: finalLat,
        lng: finalLng,
        speed: live.speed ?? null,
        course: live.course ?? null,
        heading: live.heading ?? null,
        navStatus: live.navStatus ?? null,
        name: live.name ?? null,
        updatedAt: live.updatedAt ?? null,
        source: hasLiveCoords ? live.source : savedLat !== null ? 'saved' : 'none',
        live: hasLiveCoords,
        precise: Boolean(live.precise),
        attribution: live.attribution ?? null,
        error: hasLiveCoords ? null : live.error || null,
      },
      track,
      providers: diagnostics,
    });
  } catch (error) {
    console.error('Erro ao buscar posição AIS:', error);
    return NextResponse.json({ error: 'Erro ao buscar posição AIS' }, { status: 500 });
  }
}
