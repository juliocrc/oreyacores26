import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type PortoMovimentoKind = "chegadas" | "em-porto" | "historico";

export type PortoMovimentoRow = {
  escala: string;
  navioNome: string;
  imo: string | null;
  tipoNavio: string;
  pax: number | null;
  tripulantes: number | null;
  origem: string;
  destino: string;
  eta: Date | null;
  etd: Date | null;
  estado: string;
  fonte: PortoMovimentoKind;
};

export type PortoSyncResult = {
  created: number;
  updated: number;
  cancelled: number;
  departed: number;
  removed: number;
  legacyRemoved: number;
  totalFeed: number;
  fetchedAt: string;
  sourceUrl: string;
};

export const PORTO_PONTA_DELGADA_SOURCE =
  "https://r.jina.ai/https://portosdosacores.pt/movimento-portuario";

const JUL_MARK = "[JUL]";
const AZORES_TZ = "Atlantic/Azores";
const DAY_MS = 86_400_000;

function cleanCell(value: string) {
  return String(value || "")
    .replace(/\\\|/g, "|")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function azoresOffsetMs(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: AZORES_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

export function parseAzoresDateTime(value: string | null | undefined): Date | null {
  const raw = String(value || "").trim();
  const match = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4] ?? 0);
  const minute = Number(match[5] ?? 0);
  const second = Number(match[6] ?? 0);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const utcDate = new Date(utcGuess);
  const offset = azoresOffsetMs(utcDate);
  const resolved = new Date(utcGuess - offset);
  return Number.isNaN(resolved.getTime()) ? null : resolved;
}

function toNumber(value: string): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveKind(headers: string[]): PortoMovimentoKind | null {
  if (headers.includes("ETA")) return "chegadas";
  if (headers.includes("ATA") && headers.includes("ATD")) return "historico";
  if (headers.includes("ATA") && headers.includes("ETD")) return "em-porto";
  return null;
}

function deriveEstado(eta: Date | null, etd: Date | null, kind: PortoMovimentoKind, now: Date) {
  if (kind === "em-porto") {
    if (etd && etd.getTime() <= now.getTime()) return "Partido";
    return "Atracado";
  }
  if (eta && now.getTime() < eta.getTime()) return "Previsto";
  if (etd && now.getTime() < etd.getTime()) return "Atracado";
  if (etd && now.getTime() >= etd.getTime()) return "Partido";
  return "Previsto";
}

export function parsePortoMovimentoMarkdown(
  markdown: string,
  now: Date = new Date(),
): PortoMovimentoRow[] {
  const byEscala = new Map<string, PortoMovimentoRow>();
  let headers: string[] | null = null;
  let kind: PortoMovimentoKind | null = null;

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith("|")) continue;
    const cells = splitRow(line);
    if (!cells.length) continue;

    if (cells[0].toUpperCase() === "ESCALA") {
      headers = cells.map((cell) => cell.toUpperCase());
      kind = resolveKind(headers);
      continue;
    }

    if (!headers || !kind || kind === "historico") continue;
    if (cells.every((cell) => !cell || /^:?-{2,}:?$/.test(cell))) continue;
    if (!/^PTPDL/i.test(cells[0] || "")) continue;

    const get = (name: string) => {
      const index = headers!.indexOf(name);
      return index >= 0 ? cleanCell(cells[index] ?? "") : "";
    };

    const escala = cleanCell(cells[0]);
    const navioNome = get("NAVIO");
    if (!escala || !navioNome) continue;

    const eta = parseAzoresDateTime(get(kind === "chegadas" ? "ETA" : "ATA"));
    const etd = parseAzoresDateTime(get("ETD"));
    const row: PortoMovimentoRow = {
      escala,
      navioNome,
      imo: get("IMO") || null,
      tipoNavio: get("TIPO NAVIO") || "Outros",
      pax: toNumber(get("PAX")),
      tripulantes: toNumber(get("TRIPULANTES")),
      origem: get("ORIGEM"),
      destino: get("DESTINO"),
      eta,
      etd,
      estado: deriveEstado(eta, etd, kind, now),
      fonte: kind,
    };

    const current = byEscala.get(escala);
    if (!current || (current.fonte === "chegadas" && kind === "em-porto")) {
      byEscala.set(escala, row);
    }
  }

  return Array.from(byEscala.values()).sort((a, b) => {
    const aTime = a.eta?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bTime = b.eta?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (aTime !== bTime) return aTime - bTime;
    return a.navioNome.localeCompare(b.navioNome, "pt");
  });
}

export async function fetchPortoMovimento(): Promise<{
  rows: PortoMovimentoRow[];
  fetchedAt: Date;
  sourceUrl: string;
}> {
  const sourceUrl = process.env.PORTO_MOVIMENTO_URL?.trim() || PORTO_PONTA_DELGADA_SOURCE;
  const response = await fetch(sourceUrl, {
    cache: "no-store",
    headers: {
      Accept: "text/plain, text/markdown;q=0.9, */*;q=0.8",
      "User-Agent": "OREYACORESDELUXE/2026 (+https://oreyacoresdeluxe.vercel.app)",
    },
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    throw new Error(`Fonte do movimento portuário indisponível (HTTP ${response.status}).`);
  }

  const text = await response.text();
  if (!/ESCALA/i.test(text) || !/PTPDL/i.test(text)) {
    throw new Error("A fonte não devolveu a tabela de escalas de Ponta Delgada.");
  }

  const rows = parsePortoMovimentoMarkdown(text);
  if (!rows.length) {
    throw new Error("Nenhuma escala de Ponta Delgada encontrada na fonte.");
  }

  return { rows, fetchedAt: new Date(), sourceUrl };
}

export function mapPortoTipoCarga(tipoNavio: string): string {
  const value = String(tipoNavio || "").toLowerCase();
  if (value.includes("porta-contentor") || value.includes("contentor")) return "Contentores";
  if (value.includes("cruzeiro") || value.includes("passageiro")) return "Cruzeiro";
  if (value.includes("tanque") || value.includes("gás") || value.includes("gas") || value.includes("petróleo") || value.includes("petroleo") || value.includes("químico") || value.includes("quimico")) {
    return "Gás / Combustível";
  }
  if (value.includes("graneleiro") || value.includes("carga geral") || value.includes("carga")) return "Carga Geral";
  if (value.includes("rebocador") || value.includes("pesca") || value.includes("recreio")) return "Pesca / Recreio";
  return tipoNavio ? "Outros" : "Outros";
}

export function isTipoContentor(tipoNavio: string): boolean {
  const value = String(tipoNavio || "").toLowerCase();
  return value.includes("porta-contentor") || value.includes("contentor");
}

function caisFor(tipoNavio: string): string | null {
  if (isTipoContentor(tipoNavio)) return "Cais Comercial - Ponta Delgada";
  const value = String(tipoNavio || "").toLowerCase();
  if (value.includes("cruzeiro") || value.includes("passageiro")) return "Cais de Cruzeiros - Ponta Delgada";
  return null;
}

function buildMeta(row: PortoMovimentoRow) {
  return [
    JUL_MARK,
    row.escala,
    `· ${row.tipoNavio || "Outros"}`,
    `· PAX ${row.pax ?? 0}`,
    `· Trip ${row.tripulantes ?? 0}`,
    "· Fonte portosdosacores.pt",
  ].join(" ");
}

function escalaFromObservacoes(observacoes: string | null): string | null {
  const match = String(observacoes || "").match(/^\[JUL\]\s+(\S+)/);
  return match ? match[1] : null;
}

export async function syncPortoPontaDelgada(): Promise<PortoSyncResult> {
  const { rows, fetchedAt, sourceUrl } = await fetchPortoMovimento();
  const now = new Date();

  const existing = await prisma.portoEscala.findMany({
    where: { observacoes: { contains: JUL_MARK } },
  });

  const byEscala = new Map<string, (typeof existing)[number]>();
  const duplicates: number[] = [];
  for (const escala of existing) {
    const key = escalaFromObservacoes(escala.observacoes);
    if (!key) continue;
    if (byEscala.has(key)) duplicates.push(escala.id);
    else byEscala.set(key, escala);
  }

  const legacyRemoved = await prisma.portoEscala.deleteMany({
    where: { observacoes: { startsWith: "Sincronizado automaticamente" } },
  });

  const operations: Prisma.PrismaPromise<unknown>[] = [];
  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const data = {
      navioNome: row.navioNome,
      matricula: row.imo,
      tipoCarga: mapPortoTipoCarga(row.tipoNavio),
      cais: caisFor(row.tipoNavio),
      dataChegada: row.eta,
      dataPartida: row.etd,
      origemDestino:
        row.origem || row.destino ? `${row.origem || "—"} → ${row.destino || "—"}` : null,
      estado: row.estado,
      observacoes: buildMeta(row),
    };

    const current = byEscala.get(row.escala);
    if (current) {
      operations.push(
        prisma.portoEscala.update({
          where: { id: current.id },
          data: { ...data, armador: current.armador },
        }),
      );
      updated += 1;
    } else {
      operations.push(prisma.portoEscala.create({ data }));
      created += 1;
    }
  }

  const feedIds = new Set(rows.map((row) => row.escala));
  let cancelled = 0;
  let departed = 0;
  let removed = 0;

  for (const [escala, item] of byEscala) {
    if (feedIds.has(escala)) continue;
    const arrival = item.dataChegada ? new Date(item.dataChegada).getTime() : null;

    if (arrival !== null && arrival < now.getTime() - 2 * DAY_MS) {
      operations.push(prisma.portoEscala.delete({ where: { id: item.id } }));
      removed += 1;
      continue;
    }

    if (arrival !== null && arrival <= now.getTime()) {
      if (item.estado !== "Partido") {
        operations.push(
          prisma.portoEscala.update({
            where: { id: item.id },
            data: { estado: "Partido" },
          }),
        );
        departed += 1;
      }
      continue;
    }

    if (item.estado !== "Cancelado") {
      const note = String(item.observacoes || "");
      operations.push(
        prisma.portoEscala.update({
          where: { id: item.id },
          data: {
            estado: "Cancelado",
            observacoes: note.includes("cancelado na fonte")
              ? note
              : `${note} · cancelado na fonte`,
          },
        }),
      );
      cancelled += 1;
    }
  }

  if (duplicates.length) {
    operations.push(
      prisma.portoEscala.deleteMany({ where: { id: { in: duplicates } } }),
    );
  }

  if (operations.length) {
    await prisma.$transaction(operations);
  }

  return {
    created,
    updated,
    cancelled,
    departed,
    removed,
    legacyRemoved: legacyRemoved.count,
    totalFeed: rows.length,
    fetchedAt: fetchedAt.toISOString(),
    sourceUrl,
  };
}
