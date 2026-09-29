// Coordenadas da Orey Técnica — Zona Industrial dos Portões Vermelhos,
// Armazém 19, 9560-350 Cabouco (Lagoa, São Miguel, Açores).
export const OREY_STATION_COORDINATES = {
  latitude: 37.7688,
  longitude: -25.5825,
} as const;

export type OreyWeatherSnapshot = {
  temperatureC: number | null;
  pressureHpa: number | null;
};

const WEATHER_TIMEOUT_MS = 12_000;

type OpenMeteoCurrentResponse = {
  current?: {
    temperature_2m?: number;
    pressure_msl?: number;
  };
};

type OpenMeteoHourlyResponse = {
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    pressure_msl?: number[];
  };
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatLocalHourKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:00`;
}

function formatLocalDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function fetchOpenMeteo(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEATHER_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`);
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

function pickHourlySnapshot(hourly: OpenMeteoHourlyResponse["hourly"], targetKey: string): OreyWeatherSnapshot {
  const times = Array.isArray(hourly?.time) ? hourly.time : [];
  if (times.length === 0) {
    return { temperatureC: null, pressureHpa: null };
  }

  let index = times.indexOf(targetKey);
  if (index === -1) {
    const targetMs = new Date(targetKey).getTime();
    let bestIndex = 0;
    let bestDiff = Number.POSITIVE_INFINITY;
    times.forEach((time, i) => {
      const diff = Math.abs(new Date(time).getTime() - targetMs);
      if (Number.isFinite(diff) && diff < bestDiff) {
        bestDiff = diff;
        bestIndex = i;
      }
    });
    index = bestIndex;
  }

  const temperature = hourly?.temperature_2m?.[index];
  const pressure = hourly?.pressure_msl?.[index];

  return {
    temperatureC: typeof temperature === "number" ? temperature : null,
    pressureHpa: typeof pressure === "number" ? pressure : null,
  };
}

/**
 * Obtém a temperatura e a pressão atmosférica ao nível do mar para a Orey
 * Técnica (Cabouco) na data/hora indicada:
 * - agora / futuro próximo -> dados atuais (Open-Meteo forecast);
 * - passado recente (<= 3 dias) -> hourly com `past_days`;
 * - passado mais antigo -> reanálise histórica (archive-api).
 */
export async function fetchOreyWeatherAt(when: Date): Promise<OreyWeatherSnapshot> {
  const { latitude, longitude } = OREY_STATION_COORDINATES;
  const now = Date.now();
  const diffMs = now - when.getTime();
  const isRecentOrCurrent = when.getTime() >= now - 90 * 60 * 1000;

  if (isRecentOrCurrent) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,pressure_msl&timezone=auto`;
    const data = (await fetchOpenMeteo(url)) as OpenMeteoCurrentResponse;
    const temperature = data.current?.temperature_2m;
    const pressure = data.current?.pressure_msl;
    return {
      temperatureC: typeof temperature === "number" ? temperature : null,
      pressureHpa: typeof pressure === "number" ? pressure : null,
    };
  }

  const daysAgo = diffMs / (24 * 60 * 60 * 1000);
  const targetKey = formatLocalHourKey(when);

  if (daysAgo <= 3) {
    const pastDays = Math.min(92, Math.max(1, Math.ceil(daysAgo) + 1));
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=temperature_2m,pressure_msl&past_days=${pastDays}&forecast_days=2&timezone=auto`;
    const data = (await fetchOpenMeteo(url)) as OpenMeteoHourlyResponse;
    return pickHourlySnapshot(data.hourly, targetKey);
  }

  const dateKey = formatLocalDateKey(when);
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}&start_date=${dateKey}&end_date=${dateKey}&hourly=temperature_2m,pressure_msl&timezone=auto`;
  const data = (await fetchOpenMeteo(url)) as OpenMeteoHourlyResponse;
  return pickHourlySnapshot(data.hourly, targetKey);
}
