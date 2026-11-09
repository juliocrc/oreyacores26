import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import prisma from "@/lib/prisma";
import {
  callZapierTool,
  listZapierTools,
  isZapierMcpConfigured,
  type ZapierTool,
} from "@/lib/zapier-mcp";
import {
  getGoogleCalendarConfig,
  saveGoogleCalendarConfig,
} from "@/lib/google-calendar-config";
import { parseAgendaDateFlexible, computeOperationalEnd } from "@/lib/agenda-page-helpers";
import { resolveAgendaDuration } from "@/types/agenda";

const MAP_PATH = path.join(process.cwd(), "_meta", "google-calendar-map.json");

export type GCalEventInput = {
  summary: string;
  description?: string;
  start: Date;
  end?: Date;
  allDay?: boolean;
  calendarId?: string;
};

export type GoogleCalendarSyncResult = {
  ok: boolean;
  configured: boolean;
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
  errors: string[];
  agendaEvents: number;
  expiracoes: number;
  summary: string;
};

type CalendarActions = {
  create?: ZapierTool;
  update?: ZapierTool;
  delete?: ZapierTool;
  find?: ZapierTool;
};

let toolsCache: { at: number; actions: CalendarActions } | null = null;

// ────────────────────────────────────────────────────────────────────────────
// Helpers de descoberta de tools e mapeamento de argumentos
// ────────────────────────────────────────────────────────────────────────────

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function includesAny(haystack: string, needles: string[]): boolean {
  const h = normalizeToken(haystack);
  return needles.some((n) => h.includes(normalizeToken(n)));
}

function schemaProps(schema?: Record<string, unknown>): Record<string, unknown> {
  if (schema && typeof (schema as { properties?: unknown }).properties === "object") {
    return (schema as { properties: Record<string, unknown> }).properties;
  }
  return {};
}

function findProp(
  props: Record<string, unknown>,
  aliases: string[],
  exclude: string[] = [],
): string | undefined {
  const keys = Object.keys(props).filter((k) => {
    const n = normalizeToken(k);
    return !exclude.some((e) => n.includes(normalizeToken(e)));
  });
  for (const alias of aliases) {
    const a = normalizeToken(alias);
    if (!a) continue;
    const hit = keys.find((k) => {
      const n = normalizeToken(k);
      return n.includes(a) || a.includes(n);
    });
    if (hit) return hit;
  }
  return undefined;
}

function findEventIdProp(props: Record<string, unknown>): string | undefined {
  const direct = findProp(props, ["eventid", "idevent", "googleeventid", "gcalid", "event_id"]);
  if (direct) return direct;
  const keys = Object.keys(props).filter((k) => !normalizeToken(k).includes("calendar"));
  return keys.find((k) => normalizeToken(k) === "id");
}

function pickTool(
  tools: ZapierTool[],
  primaryKws: string[],
  fallbackKws: string[],
  excludeKws: string[],
): ZapierTool | undefined {
  const candidates = tools.filter((t) =>
    includesAny(`${t.name} ${t.description || ""}`, ["calendar", "calendário", "calendario"]),
  );
  const ranked = candidates.filter((t) => {
    const text = `${t.name} ${t.description || ""}`;
    return !excludeKws.some((k) => includesAny(text, [k]));
  });
  const primary = ranked.find((t) => includesAny(`${t.name} ${t.description || ""}`, primaryKws));
  if (primary) return primary;
  return ranked.find((t) => includesAny(`${t.name} ${t.description || ""}`, fallbackKws));
}

async function discoverCalendarActions(): Promise<CalendarActions> {
  if (toolsCache && Date.now() - toolsCache.at < 10 * 60 * 1000) {
    return toolsCache.actions;
  }
  const tools = await listZapierTools();
  const actions: CalendarActions = {
    create: pickTool(tools, ["create", "add", "new", "criar", "novo"], [], ["update", "delete", "find", "search", "list", "get"]),
    update: pickTool(tools, ["update", "edit", "atualizar", "editar"], [], ["create", "delete", "find", "search"]),
    delete: pickTool(tools, ["delete", "remove", "remover", "apagar", "excluir"], [], ["create", "update", "find", "search"]),
    find: pickTool(tools, ["find", "search"], ["list", "get"], ["create", "update", "delete"]),
  };
  toolsCache = { at: Date.now(), actions };
  return actions;
}

function toIsoLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function buildCreateArgs(tool: ZapierTool, input: GCalEventInput): Record<string, unknown> {
  const props = schemaProps(tool.inputSchema);
  const args: Record<string, unknown> = {};
  const calendar = findProp(props, ["calendarid", "calendar_id", "calendar"]);
  if (calendar && input.calendarId) args[calendar] = input.calendarId;
  const summary = findProp(props, ["summary", "eventtitle", "eventname", "title", "name"]);
  if (summary && input.summary) args[summary] = input.summary;
  const description = findProp(props, ["description", "descricao", "notes", "details", "observacoes"]);
  if (description && input.description) args[description] = input.description;
  const start = findProp(props, ["startdatetime", "startdate", "starttime", "start", "dtstart", "inicio", "begin"]);
  if (start) args[start] = toIsoLocal(input.start);
  const end = findProp(props, ["enddatetime", "enddate", "endtime", "end", "dtend", "fim", "finish"]);
  if (end) args[end] = toIsoLocal(input.end ?? new Date(input.start.getTime() + 60 * 60 * 1000));
  const allDay = findProp(props, ["allday", "alldayevent", "all_day", "fullday", "diainteiro"]);
  if (allDay && input.allDay !== undefined) args[allDay] = input.allDay;
  const location = findProp(props, ["location", "local", "localizacao", "place", "sala"]);
  if (location) args[location] = "";
  return args;
}

function buildUpdateArgs(
  tool: ZapierTool,
  input: GCalEventInput & { eventId: string },
): Record<string, unknown> {
  const props = schemaProps(tool.inputSchema);
  const args = buildCreateArgs(tool, input);
  const eventId = findEventIdProp(props);
  if (eventId) args[eventId] = input.eventId;
  return args;
}

function buildDeleteArgs(
  tool: ZapierTool,
  input: { calendarId?: string; eventId: string },
): Record<string, unknown> {
  const props = schemaProps(tool.inputSchema);
  const args: Record<string, unknown> = {};
  const eventId = findEventIdProp(props);
  if (eventId) args[eventId] = input.eventId;
  const calendar = findProp(props, ["calendarid", "calendar_id", "calendar"]);
  if (calendar && input.calendarId) args[calendar] = input.calendarId;
  return args;
}

function buildFindArgs(
  tool: ZapierTool,
  input: { calendarId?: string; query: string },
): Record<string, unknown> {
  const props = schemaProps(tool.inputSchema);
  const args: Record<string, unknown> = {};
  const query = findProp(props, ["query", "search", "searchtext", "searchterm", "q", "text", "term"]);
  if (query) args[query] = input.query;
  const calendar = findProp(props, ["calendarid", "calendar_id", "calendar"]);
  if (calendar && input.calendarId) args[calendar] = input.calendarId;
  return args;
}

function parseJsonObjects(text: string): unknown[] {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    // continua para tentativas por regex
  }
  const out: unknown[] = [];
  const re = /{[\s\S]*?}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    try {
      out.push(JSON.parse(match[0]));
    } catch {
      // ignora fragmentos não-JSON
    }
  }
  return out;
}

function findEventIdBySummary(text: string, summary: string): string | undefined {
  const target = normalizeToken(summary);
  for (const obj of parseJsonObjects(text)) {
    if (!obj || typeof obj !== "object") continue;
    const o = obj as Record<string, unknown>;
    const candidate = String(o.summary ?? o.title ?? o.eventTitle ?? o.name ?? "");
    if (candidate && normalizeToken(candidate).includes(target)) {
      const id = o.id ?? o.eventId ?? o.event_id;
      if (id) return String(id);
    }
  }
  const plain = text.match(/"(?:event[_]?id|id)"\s*:\s*"([^"]+)"/i);
  return plain ? plain[1] : undefined;
}

function extractFirstEventId(text: string): string | undefined {
  const match =
    text.match(/"event[_]?id"\s*:\s*"([^"]+)"/i) || text.match(/"id"\s*:\s*"([^"]+)"/i);
  if (match) return match[1];
  const plain = text.match(/(?:event[\s_]?id|id)\s*[:=]\s*([A-Za-z0-9_-]+)/i);
  return plain ? plain[1] : undefined;
}

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ────────────────────────────────────────────────────────────────────────────
// Mapeamento localKey → gcalEventId (ficheiro JSON em _meta)
// ────────────────────────────────────────────────────────────────────────────

function readMap(): Record<string, string> {
  try {
    if (existsSync(MAP_PATH)) {
      const parsed = JSON.parse(readFileSync(MAP_PATH, "utf-8"));
      if (parsed && typeof parsed === "object") return parsed as Record<string, string>;
    }
  } catch {
    // mapa corrompido → recomeça
  }
  return {};
}

function saveMap(map: Record<string, string>): void {
  try {
    mkdirSync(path.dirname(MAP_PATH), { recursive: true });
    writeFileSync(MAP_PATH, JSON.stringify(map, null, 2), "utf-8");
  } catch (error) {
    console.error("[google-calendar] Erro ao guardar mapa de eventos:", error);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Operações de evento
// ────────────────────────────────────────────────────────────────────────────

async function upsertEvent(
  actions: CalendarActions,
  map: Record<string, string>,
  key: string,
  input: GCalEventInput,
): Promise<{ kind: "created" | "updated"; eventId?: string }> {
  let eventId: string | undefined = map[key];

  if (!eventId && actions.find) {
    const findRes = await callZapierTool(
      actions.find.name,
      buildFindArgs(actions.find, { calendarId: input.calendarId, query: input.summary }),
    );
    if (findRes.ok) {
      eventId = findEventIdBySummary(findRes.text, input.summary);
    }
  }

  if (eventId) {
    if (!actions.update) {
      throw new Error(`Tool 'update' do Google Calendar não encontrada no Zapier (evento ${key}).`);
    }
    const res = await callZapierTool(
      actions.update.name,
      buildUpdateArgs(actions.update, { ...input, eventId }),
    );
    if (!res.ok) {
      throw new Error(`Falha ao atualizar evento ${key} no Google Calendar: ${res.text}`);
    }
    map[key] = eventId;
    return { kind: "updated", eventId };
  }

  if (!actions.create) {
    throw new Error(`Tool 'create' do Google Calendar não encontrada no Zapier (evento ${key}).`);
  }
  const res = await callZapierTool(actions.create.name, buildCreateArgs(actions.create, input));
  if (!res.ok) {
    throw new Error(`Falha ao criar evento ${key} no Google Calendar: ${res.text}`);
  }
  const createdId = extractFirstEventId(res.text);
  if (createdId) map[key] = createdId;
  return { kind: createdId ? "created" : "created", eventId: createdId };
}

// ────────────────────────────────────────────────────────────────────────────
// Sincronização
// ────────────────────────────────────────────────────────────────────────────

export async function syncAgendaToGoogleCalendar(): Promise<GoogleCalendarSyncResult> {
  const config = getGoogleCalendarConfig();
  const result: GoogleCalendarSyncResult = {
    ok: false,
    configured: false,
    created: 0,
    updated: 0,
    deleted: 0,
    skipped: 0,
    errors: [],
    agendaEvents: 0,
    expiracoes: 0,
    summary: "",
  };

  if (!config.enabled) {
    result.summary = "Sincronização com o Google Calendar está desativada na configuração.";
    return result;
  }
  if (!isZapierMcpConfigured()) {
    result.summary = "ZAPIER_MCP_TOKEN não está configurado no ambiente.";
    return result;
  }

  const actions = await discoverCalendarActions();
  if (!actions.create && !actions.update) {
    result.summary =
      "Não foram encontradas ações do Google Calendar no Zapier. Confirma que a conta do Google Calendar está ligada no Zapier.";
    return result;
  }
  result.configured = true;

  const calendarId = config.calendarId || "primary";
  const map = readMap();

  try {
    if (config.incluirInspecoesNoGoogle) {
      const eventos = await prisma.agendaEvento.findMany();
      result.agendaEvents = eventos.length;
      const existingAgendaKeys = new Set<string>();
      for (const ev of eventos) {
        const key = `agenda-${ev.id}`;
        existingAgendaKeys.add(key);
        const status = String(ev.status || "").trim().toLowerCase();

        if (status === "cancelled") {
          const known = map[key];
          if (known && actions.delete) {
            try {
              const delRes = await callZapierTool(
                actions.delete.name,
                buildDeleteArgs(actions.delete, { calendarId, eventId: known }),
              );
              if (delRes.ok) result.deleted++;
              else result.skipped++;
            } catch (e) {
              result.errors.push(`Remover inspeção ${ev.id}: ${errMsg(e)}`);
            }
          }
          delete map[key];
          continue;
        }

        if (status === "completed" || status === "no_show") continue;

        const start = ev.date;
        const end = computeOperationalEnd(start, resolveAgendaDuration(ev));
        const eventKind = String(ev.type || "").trim() === "Entrega" ? "Entrega" : "Inspeção";
        const summary = `${eventKind} ${ev.raftSerial} — ${ev.title}`;
        const description = [
          "App Orey Tecnica- Serviços Navais, Lda — Agenda",
          `Jangada: ${ev.raftSerial}`,
          `Responsável: ${ev.responsavel || "—"}`,
          `Tipo: ${ev.inspectionType || "outro"}`,
          `Estado: ${status}`,
        ].join("\n");

        try {
          await upsertEvent(actions, map, key, {
            calendarId,
            summary,
            description,
            start,
            end,
          });
          result.created++;
        } catch (e) {
          result.errors.push(`Inspeção ${ev.id} (${ev.raftSerial}): ${errMsg(e)}`);
        }
      }

      // Limpeza de eventos órfãos (apagados do DB) no Google Calendar e no mapa
      for (const key of Object.keys(map)) {
        if (!key.startsWith("agenda-") || existingAgendaKeys.has(key)) continue;
        const known = map[key];
        if (known && actions.delete) {
          try {
            const delRes = await callZapierTool(
              actions.delete.name,
              buildDeleteArgs(actions.delete, { calendarId, eventId: known }),
            );
            if (delRes.ok) result.deleted++;
            else result.skipped++;
          } catch (e) {
            result.errors.push(`Remover evento órfão ${key}: ${errMsg(e)}`);
          }
        }
        delete map[key];
      }
    }

    if (config.expiracoesNoGoogle) {
      const hoje = new Date();
      const inicioHoje = new Date(hoje);
      inicioHoje.setHours(0, 0, 0, 0);

      const rafts = await prisma.jangada.findMany({
        where: { dataProxInspecao: { not: null } },
        select: {
          id: true,
          serial: true,
          brand: true,
          model: true,
          shipNameManual: true,
          shipId: true,
          dataProxInspecao: true,
        },
      });

      const hojeOuCaducadas = rafts.filter((r) => {
        const due = r.dataProxInspecao ? parseAgendaDateFlexible(r.dataProxInspecao) : null;
        if (!due) return false;
        const dueStart = new Date(due);
        dueStart.setHours(0, 0, 0, 0);
        return dueStart.getTime() <= inicioHoje.getTime();
      });

      result.expiracoes = hojeOuCaducadas.length;

      for (const r of hojeOuCaducadas) {
        const key = `exp-${r.id}`;
        const summary = `⚠ Caduca hoje — ${r.serial}`;
        const due = r.dataProxInspecao ? parseAgendaDateFlexible(r.dataProxInspecao) : null;
        const description = [
          "App Orey Tecnica- Serviços Navais, Lda — Caducidade de inspeção",
          `Jangada: ${r.serial}`,
          r.model && String(r.model).trim() ? `Modelo: ${String(r.model).trim()}` : "",
          r.shipNameManual && r.shipNameManual.trim() ? `Navio: ${r.shipNameManual.trim()}` : "",
          due ? `Data limite: ${due.toLocaleDateString("pt-PT")}` : "",
        ]
          .filter(Boolean)
          .join("\n");

        const start = new Date(hoje);
        start.setHours(9, 0, 0, 0);
        const end = new Date(hoje);
        end.setHours(10, 0, 0, 0);

        try {
          await upsertEvent(actions, map, key, {
            calendarId,
            summary,
            description,
            start,
            end,
          });
          result.created++;
        } catch (e) {
          result.errors.push(`Caducidade ${r.serial}: ${errMsg(e)}`);
        }
      }
    }
  } catch (e) {
    result.errors.push(errMsg(e));
  } finally {
    saveMap(map);
  }

  result.ok = result.errors.length === 0;
  result.summary =
    result.errors.length === 0
      ? `Sincronizado: ${result.created} criados, ${result.updated} atualizados, ${result.deleted} removidos.`
      : `Concluído com ${result.errors.length} erro(s). ${result.created} criados, ${result.updated} atualizados, ${result.deleted} removidos.`;

  saveGoogleCalendarConfig({
    lastSyncAt: new Date().toISOString(),
    lastSyncSummary: result.summary,
  });
  return result;
}

export async function getGoogleCalendarStatus() {
  const config = getGoogleCalendarConfig();
  let actions: CalendarActions | null = null;
  let error: string | null = null;
  try {
    actions = await discoverCalendarActions();
  } catch (e) {
    error = errMsg(e);
  }
  return {
    configured: isZapierMcpConfigured(),
    enabled: config.enabled,
    calendarId: config.calendarId,
    connectionLabel: config.connectionLabel,
    lastSyncAt: config.lastSyncAt,
    lastSyncSummary: config.lastSyncSummary,
    janelaDiasApp: config.janelaDiasApp,
    expiracoesNoGoogle: config.expiracoesNoGoogle,
    incluirInspecoesNoGoogle: config.incluirInspecoesNoGoogle,
    actions: actions
      ? {
          create: actions.create?.name ?? null,
          update: actions.update?.name ?? null,
          delete: actions.delete?.name ?? null,
          find: actions.find?.name ?? null,
        }
      : null,
    error,
  };
}
