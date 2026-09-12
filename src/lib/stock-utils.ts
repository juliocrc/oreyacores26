import prisma from "@/lib/prisma";
import { normalizeStockValidityValue, stockItemSupportsValidity } from "@/lib/stock-validity";
import { normalizeStockReferenceByRule } from "@/lib/stock-reference-rules";
import { normalizeStockCategory } from "@/lib/stock-categories";
import { canEditPath } from "@/lib/user-permissions";
import { getAccessContext } from "@/lib/access-control";

export function canEditStock(access: NonNullable<Awaited<ReturnType<typeof getAccessContext>>>) {
  return access.isAdmin || canEditPath(access.permissions, "/stock");
}

export function normalizeStockPayload(input: Record<string, unknown>) {
  const nome = String(input?.nome || input?.descricao || "").trim();
  const referenciaBase = String(input?.referencia || "").trim();
  const categoriaOriginal = input?.categoria;
  const categoria = normalizeStockCategory(categoriaOriginal, nome || input?.descricao);
  const referenciaNormalizada = normalizeStockReferenceByRule(
    referenciaBase,
    nome,
    input?.descricao,
    categoriaOriginal,
    input?.observacoes
  );
  const referencia = referenciaNormalizada || `AUTO-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const supportsValidity = stockItemSupportsValidity({
    nome,
    descricao: input?.descricao,
    categoria: categoriaOriginal,
    codigoFabricante: input?.codigoFabricante,
    referencia,
    observacoes: input?.observacoes,
  });

  return {
    referencia,
    descricao: nome || "Item sem descrição",
    estadoArtigo: input?.estadoArtigo ? String(input.estadoArtigo) : "ATIVO",
    referenciaSubstituta: input?.referenciaSubstituta ? String(input.referenciaSubstituta) : null,
    categoria,
    associavelJangada: Boolean(input?.associavelJangada),
    aplicavelMarcaJangada: input?.aplicavelMarcaJangada ? String(input.aplicavelMarcaJangada) : null,
    aplicavelModeloJangada: input?.aplicavelModeloJangada ? String(input.aplicavelModeloJangada) : null,
    precoCompra: input?.precoCompra === "" || input?.precoCompra == null ? null : Number(input.precoCompra),
    codigoFabricante: input?.codigoFabricante ? String(input.codigoFabricante) : null,
    inventario: input?.inventario ? String(input.inventario) : null,
    lote: input?.lote ? String(input.lote) : null,
    validade: supportsValidity ? normalizeStockValidityValue(input?.validade) : null,
    testeHidraulico: input?.testeHidraulico ? String(input.testeHidraulico) : null,
    estadoCargaCilindro: input?.estadoCargaCilindro ? String(input.estadoCargaCilindro).toUpperCase() : null,
    precoVenda: Number(input?.precoVenda ?? 0),
    quantidade: Number(input?.quantidade ?? 0),
    quantidadeMinima: input?.quantidadeMinima == null || input?.quantidadeMinima === "" ? null : Number(input.quantidadeMinima),
    localizacao: input?.localizacao ? String(input.localizacao).trim() : null,
    codigoBarras: input?.codigoBarras ? String(input.codigoBarras).trim() : null,
  };
}

function normalizeCylinderSerialKey(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export async function findDuplicateCylinderStock(payload: ReturnType<typeof normalizeStockPayload>) {
  if (normalizeStockCategory(payload.categoria, payload.descricao) !== "CILINDROS") return null;

  const refKey = normalizeCylinderSerialKey(payload.referencia);
  const manufacturerKey = normalizeCylinderSerialKey(payload.codigoFabricante);
  if (!refKey && !manufacturerKey) return null;

  const candidates = await prisma.stock.findMany({
    where: {
      categoria: { equals: "CILINDROS", mode: "insensitive" },
    },
    select: {
      id: true,
      referencia: true,
      codigoFabricante: true,
    },
    take: 5000,
  });

  return (
    candidates.find((item) => {
      const itemRefKey = normalizeCylinderSerialKey(item.referencia);
      const itemManufacturerKey = normalizeCylinderSerialKey(item.codigoFabricante);
      if (!itemRefKey && !itemManufacturerKey) return false;

      if (refKey && (itemRefKey === refKey || itemManufacturerKey === refKey)) return true;
      if (manufacturerKey && (itemRefKey === manufacturerKey || itemManufacturerKey === manufacturerKey)) return true;
      return false;
    }) || null
  );
}

// Detecta a mesma referência com validades conflitantes (lotes diferentes / erro de registo)
export type ConflictingValidityPayload = {
  referencia?: string | null;
  validade?: string | null;
  categoria?: string | null;
  descricao?: string | null;
  codigoFabricante?: string | null;
};

export async function findConflictingValidityStock(payload: ConflictingValidityPayload) {
  if (!payload?.validade) return null;
  const key = normalizeCylinderSerialKey(payload.referencia);
  if (!key) return null;

  const candidates = await prisma.stock.findMany({
    where: { referencia: { equals: String(payload.referencia || ""), mode: "insensitive" } },
    select: {
      id: true,
      referencia: true,
      descricao: true,
      validade: true,
      lote: true,
      quantidade: true,
      localizacao: true,
    },
    take: 200,
  });

  return candidates.find((c) => c.validade && String(c.validade).trim() !== payload.validade) || null;
}
