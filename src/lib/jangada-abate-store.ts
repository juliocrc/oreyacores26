import { logAuditoria } from "@/lib/auditoria";
import { readAuditoriaJson, writeAuditoriaJson } from "@/lib/auditorias-storage";
import { getAbateMotivoLabel, getAbateTipoBarcoLabel } from "@/lib/abate-constants";

export type AbateData = {
  ativo: boolean;
  tipoBarco: string;
  motivo: string;
  detalhes: string;
  dataAbate?: string;
};

type AbateStore = Record<string, AbateData>;

const ABATE_STORE_FILE = "_meta/jangadas-abate.json";

export const defaultAbateData: AbateData = {
  ativo: false,
  tipoBarco: "",
  motivo: "",
  detalhes: "",
};

export function normalizeAbateData(raw: unknown): AbateData {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...defaultAbateData };

  const src = raw as Record<string, unknown>;

  return {
    ativo: Boolean(src.ativo),
    tipoBarco: typeof src.tipoBarco === "string" ? src.tipoBarco.trim() : "",
    motivo: typeof src.motivo === "string" ? src.motivo.trim() : "",
    detalhes: typeof src.detalhes === "string" ? src.detalhes.trim() : "",
    dataAbate: typeof src.dataAbate === "string" ? src.dataAbate.trim() : undefined,
  };
}

async function readAbateStore() {
  return readAuditoriaJson<AbateStore>(ABATE_STORE_FILE, {});
}

export async function readJangadaAbate(jangadaId: number): Promise<AbateData> {
  const store = await readAbateStore();
  return normalizeAbateData(store[String(jangadaId)]);
}

export async function writeJangadaAbate(jangadaId: number, value: unknown): Promise<AbateData> {
  const currentStore = await readAbateStore();
  const normalized = normalizeAbateData(value);
  const key = String(jangadaId);
  const previous = normalizeAbateData(currentStore[key]);

  const nextStore: AbateStore = {
    ...currentStore,
    [key]: normalized,
  };

  await writeAuditoriaJson(ABATE_STORE_FILE, nextStore);

  await logAuditoria({
    tabela: "JangadaAbate",
    tipoOperacao: normalized.ativo ? "UPDATE" : "DELETE",
    idRegisto: jangadaId,
    descricao: normalized.ativo
      ? `Jangada assinalada para abate. Motivo: ${getAbateMotivoLabel(normalized.motivo) || "(sem motivo)"} · Tipo de barco: ${getAbateTipoBarcoLabel(normalized.tipoBarco) || "(sem tipo)"}.`
      : "Abate da jangada cancelado/removido.",
    usuario: "sistema",
    dadosAntes: previous,
    dadosDepois: normalized,
  });

  return normalized;
}