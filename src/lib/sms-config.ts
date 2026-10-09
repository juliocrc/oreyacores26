import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

export type SmsNotifyType = "rececionada" | "pronta_entrega" | "enviada" | "lembrete_validade";

export type SmsConfig = {
  enabled: Record<SmsNotifyType, boolean>;
  texts: Record<SmsNotifyType, string>;
  lembreteValidadeDias: number;
  requerConfirmacao: boolean;
};

const CONFIG_PATH = path.join(process.cwd(), "_meta", "sms-config.json");

export function buildDefaultSmsConfig(): SmsConfig {
  return {
    enabled: {
      rececionada: true,
      pronta_entrega: true,
      enviada: true,
      lembrete_validade: true,
    },
    texts: {
      rececionada:
        "Olá {cliente},\n\nA sua jangada {serial} já foi rececionada na Estação de Serviço em São Miguel.\n\nData prevista de entrega: {data}.\n\nCumprimentos,\nEstação de Serviço",
      pronta_entrega:
        "Olá {cliente},\n\nA sua jangada {serial} está pronta para entrega{transitario}.\n\nCumprimentos,\nEstação de Serviço",
      enviada:
        "Olá {cliente},\n\nA sua jangada {serial} já foi enviada da Estação de Serviço e segue de regresso{transitario}{tracking}.\n\nCumprimentos,\nEstação de Serviço",
      lembrete_validade:
        "Olá {cliente},\n\nLembramos que a inspeção da sua jangada {serial} {navio} expira em {data}.\n\nPor favor contacte-nos para agendar a revisão técnica.\n\nCumprimentos,\nEstação de Serviço",
    },
    lembreteValidadeDias: 7,
    requerConfirmacao: false,
  };
}

function normalizeEnabled(value: unknown): Record<SmsNotifyType, boolean> {
  const defaults = buildDefaultSmsConfig().enabled;
  if (!value || typeof value !== "object") return defaults;
  const src = value as Record<string, unknown>;
  const get = (key: string, fallback: boolean) =>
    typeof src[key] === "boolean" ? src[key] : fallback;
  return {
    rececionada: get("rececionada", defaults.rececionada),
    pronta_entrega: get("pronta_entrega", get("prontaEntrega", defaults.pronta_entrega)),
    enviada: get("enviada", defaults.enviada),
    lembrete_validade: get("lembrete_validade", get("lembreteValidade", defaults.lembrete_validade)),
  };
}

function normalizeTexts(value: unknown): Record<SmsNotifyType, string> {
  const defaults = buildDefaultSmsConfig().texts;
  if (!value || typeof value !== "object") return defaults;
  const src = value as Record<string, unknown>;
  const pick = (keys: string[]) => {
    for (const key of keys) {
      if (typeof src[key] === "string" && String(src[key]).trim().length) return String(src[key]);
    }
    return undefined;
  };
  return {
    rececionada: pick(["rececionada"]) || defaults.rececionada,
    pronta_entrega: pick(["pronta_entrega", "prontaEntrega"]) || defaults.pronta_entrega,
    enviada: pick(["enviada"]) || defaults.enviada,
    lembrete_validade: pick(["lembrete_validade", "lembreteValidade"]) || defaults.lembrete_validade,
  };
}

function normalizeDays(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(90, Math.round(parsed)) : fallback;
}

export async function getSmsConfig(): Promise<SmsConfig> {
  const defaults = buildDefaultSmsConfig();
  try {
    if (!existsSync(CONFIG_PATH)) return defaults;
    const parsed = JSON.parse(await readFile(CONFIG_PATH, "utf-8"));
    if (!parsed || typeof parsed !== "object") return defaults;
    return {
      enabled: normalizeEnabled(parsed.enabled),
      texts: normalizeTexts(parsed.texts),
      lembreteValidadeDias: normalizeDays(parsed.lembreteValidadeDias, defaults.lembreteValidadeDias),
      requerConfirmacao:
        typeof parsed.requerConfirmacao === "boolean" ? parsed.requerConfirmacao : defaults.requerConfirmacao,
    };
  } catch {
    return defaults;
  }
}

export async function saveSmsConfig(partial: Partial<SmsConfig>): Promise<SmsConfig> {
  const current = await getSmsConfig();
  const next: SmsConfig = {
    enabled: normalizeEnabled({ ...current.enabled, ...(partial.enabled || {}) }),
    texts: normalizeTexts({ ...current.texts, ...(partial.texts || {}) }),
    lembreteValidadeDias: partial.lembreteValidadeDias
      ? normalizeDays(partial.lembreteValidadeDias, current.lembreteValidadeDias)
      : current.lembreteValidadeDias,
    requerConfirmacao:
      typeof partial.requerConfirmacao === "boolean" ? partial.requerConfirmacao : current.requerConfirmacao,
  };
  try {
    await mkdir(path.dirname(CONFIG_PATH), { recursive: true });
    await writeFile(CONFIG_PATH, JSON.stringify(next, null, 2), "utf-8");
  } catch (error) {
    console.error("[sms-config] Erro ao guardar configuração:", error);
  }
  return next;
}

export function buildSmsMessage(template: string, vars: Record<string, string>): string {
  let message = template;
  for (const [key, value] of Object.entries(vars)) {
    const safe = String(value || "").trim();
    if (safe) {
      message = message.split(`{${key}}`).join(safe);
    } else {
      message = message
        .split(`{${key}}`)
        .join("")
        .replace(/\n{2,}/g, "\n")
        // Variável vazia (ex.: sem navio) não deve deixar espaços duplos.
        .replace(/[ ]{2,}/g, " ");
    }
  }
  return message.trim();
}