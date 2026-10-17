import { logAuditoria } from "@/lib/auditoria";
import { readAuditoriaJson, writeAuditoriaJson } from "@/lib/auditorias-storage";

export type InspectionChecklistValues = Record<string, string | number | boolean>;
type InspectionChecklistStore = Record<string, InspectionChecklistValues>;

const INSPECTION_CHECKLIST_STORE_FILE = "_meta/jangadas-inspection-checklist-values.json";

export function normalizeInspectionChecklistValues(raw: unknown): InspectionChecklistValues {
  if (!raw) return {};

  let parsed: unknown = raw;
  if (typeof raw === "string") {
    const value = raw.trim();
    if (!value) return {};
    try {
      parsed = JSON.parse(value);
    } catch {
      return {};
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

  return Object.entries(parsed as Record<string, unknown>).reduce<InspectionChecklistValues>((acc, [key, value]) => {
    if (!key) return acc;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      acc[key] = value;
    }
    return acc;
  }, {});
}

async function readInspectionChecklistStore() {
  return readAuditoriaJson<InspectionChecklistStore>(INSPECTION_CHECKLIST_STORE_FILE, {});
}

export async function readInspectionChecklistValues(jangadaId: number) {
  const store = await readInspectionChecklistStore();
  return normalizeInspectionChecklistValues(store[String(jangadaId)]);
}

export async function writeInspectionChecklistValues(jangadaId: number, value: unknown) {
  const currentStore = await readInspectionChecklistStore();
  const normalized = normalizeInspectionChecklistValues(value);
  const key = String(jangadaId);
  const previous = normalizeInspectionChecklistValues(currentStore[key]);

  const nextStore: InspectionChecklistStore = {
    ...currentStore,
    [key]: normalized,
  };

  await writeAuditoriaJson(INSPECTION_CHECKLIST_STORE_FILE, nextStore);

  await logAuditoria({
    tabela: "JangadaInspectionChecklist",
    tipoOperacao: "UPDATE",
    idRegisto: jangadaId,
    descricao: "Atualização do checklist de inspeção da jangada.",
    usuario: "sistema",
    dadosAntes: previous,
    dadosDepois: normalized,
  });

  return normalized;
}
