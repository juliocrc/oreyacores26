import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

export const EQUIPMENT_AUDIT_TABLE = "JangadaEquipment";
export type EquipmentSnapshot = Record<string, unknown>;
export type EquipmentChange = { campo: string; antes: unknown; depois: unknown };

function canonical(value: unknown): unknown {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}

export function equipmentChanges(before: EquipmentSnapshot, after: EquipmentSnapshot): EquipmentChange[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().flatMap((campo) => {
    const antes = canonical(before[campo]);
    const depois = canonical(after[campo]);
    return JSON.stringify(antes) === JSON.stringify(depois) ? [] : [{ campo, antes, depois }];
  });
}

export function equipmentSnapshot(raft: EquipmentSnapshot, articles?: EquipmentSnapshot[]): EquipmentSnapshot {
  const fields = Object.fromEntries(Object.entries(raft).filter(([key]) =>
    /^(cylinder|hru|radarReflector|container|closureStraps|valvulas|tuboIdentificacao|painterLength|maxStowageHeight|packType|fabricType)/.test(key),
  ));
  if (articles) fields.artigos = articles.map(articleSnapshot).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return fields;
}

export function articleSnapshot(article: EquipmentSnapshot): EquipmentSnapshot {
  return Object.fromEntries(["name", "referencia", "quantidade", "validade", "codigoFabricante", "stockId", "inspecaoId"].map(key => [key, canonical(article[key])]));
}

// Unlike the global best-effort logger, equipment writes must not lose their audit.
export async function auditEquipment(db: Pick<Prisma.TransactionClient, "auditoria">, input: {
  jangadaId: number; usuario: string; origem: string; antes: EquipmentSnapshot; depois: EquipmentSnapshot;
}) {
  const changes = equipmentChanges(input.antes, input.depois);
  if (!changes.length) return;
  await db.auditoria.create({ data: {
    tabela: EQUIPMENT_AUDIT_TABLE,
    tipoOperacao: "UPDATE",
    idRegisto: input.jangadaId,
    usuario: input.usuario,
    descricao: input.origem,
    dadosAntes: JSON.stringify(Object.fromEntries(changes.map(change => [change.campo, change.antes]))),
    dadosDepois: JSON.stringify(Object.fromEntries(changes.map(change => [change.campo, change.depois]))),
  } });
}

export async function readEquipmentSnapshot(jangadaId: number, db: Prisma.TransactionClient = prisma) {
  const [raft, articles] = await Promise.all([
    db.jangada.findUnique({ where: { id: jangadaId } }),
    db.artigoJangada.findMany({ where: { jangadaId, inspecaoId: null } }),
  ]);
  return equipmentSnapshot(raft || {}, articles);
}
