import prisma from "@/lib/prisma";
import { normalizeStockValidityValue, stockItemSupportsValidity } from "@/lib/stock-validity";
import { normalizeStockReferenceByRule } from "@/lib/stock-reference-rules";
import { normalizeStockCategory } from "@/lib/stock-categories";
import { canEditPath } from "@/lib/user-permissions";
import { getAccessContext } from "@/lib/access-control";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { parseStockValidityManualInput, upsertStockMetadataInObservacoes } from "@/lib/stock-metadata";

export function canEditStock(access: NonNullable<Awaited<ReturnType<typeof getAccessContext>>>) {
  return access.isAdmin || canEditPath(access.permissions, "/stock");
}

export function normalizeStockPayload(input: Record<string, unknown>) {
  const observacoes = upsertStockMetadataInObservacoes(input.observacoes, {
    validadeAplicavel: parseStockValidityManualInput(input.validadeAplicavelManual ?? input.validadeAplicavel),
    aplicavelTipos: input.aplicavelTipos,
  });
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
    observacoes,
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
    observacoes,
    lote: supportsValidity ? String(input?.lote ?? "").trim() : "",
    validade: supportsValidity ? normalizeStockValidityValue(input?.validade) : null,
    testeHidraulico: input?.testeHidraulico ? String(input.testeHidraulico) : null,
    estadoCargaCilindro: input?.estadoCargaCilindro ? String(input.estadoCargaCilindro).toUpperCase() : null,
    precoVenda: Number(input?.precoVenda ?? 0),
    quantidade: Number(input?.quantidade ?? 0),
    quantidadeMinima: input?.quantidadeMinima == null || input?.quantidadeMinima === "" ? null : Number(input.quantidadeMinima),
    localizacao: input?.localizacao ? String(input.localizacao).trim() : null,
    codigoBarras: String(input?.codigoBarras || "").trim() || null,
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
      categoria: { equals: "CILINDROS" },
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

export class StockWriteError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

export function stockWriteStatus(error: unknown): number | null {
  if (error instanceof StockWriteError) return error.status;
  const code = (error as { code?: string })?.code;
  return code === "P2002" || code === "P2034" ? 409 : null;
}

export function stockStationWhere(access: NonNullable<Awaited<ReturnType<typeof getAccessContext>>>, activeStationId: number | null): Prisma.StockWhereInput {
  return activeStationId
    ? { OR: [{ serviceStationId: activeStationId }, { serviceStationId: null }] }
    : access.isAdmin ? {} : { OR: [{ serviceStationId: { in: access.allowedStationIds } }, { serviceStationId: null }] };
}

export async function stockTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await prisma.$transaction(fn, { isolationLevel: "Serializable" }); }
    catch (error) { if ((error as { code?: string }).code !== "P2034" || attempt >= 2) throw error; }
  }
}

// Validate against the merged row, never the partial request. Legacy unknown lots
// remain editable, but cannot be used as a shortcut to create another unknown lot.
export async function validateStockLot(tx: Prisma.TransactionClient, data: Prisma.StockUncheckedCreateInput, current?: Prisma.StockGetPayload<{}>) {
  const dated = stockItemSupportsValidity(data);
  const unchangedLegacyLot = current && data.lote === current.lote && data.referencia === current.referencia;
  data.lote = unchangedLegacyLot ? current.lote : dated ? String(data.lote ?? "").trim() : "";
  data.validade = current && data.validade === current.validade ? current.validade : dated ? normalizeStockValidityValue(data.validade) : null;
  const identityChanged = !current || stockItemSupportsValidity(current) !== dated || ["referencia", "serviceStationId", "lote", "codigoBarras"].some(
    key => (data as Record<string, unknown>)[key] !== (current as Record<string, unknown>)[key]
  ) || normalizeStockValidityValue(data.validade) !== normalizeStockValidityValue(current.validade);
  if (dated && (!current || identityChanged) && (!data.lote || !data.validade)) {
    throw new StockWriteError("Artigos com validade exigem lote e validade validos para um novo lote.", 400);
  }
  if (!Number.isSafeInteger(data.quantidade) || Number(data.quantidade) < Number(current?.quantidadeReservada ?? 0)) {
    throw new StockWriteError("Quantidade invalida ou inferior a quantidade reservada.", 400);
  }
  if (current && identityChanged) {
    const [movement, installed] = await Promise.all([
      tx.movimentacaoStock.findFirst({ where: { stockId: current.id }, select: { id: true } }),
      tx.artigoJangada.findFirst({ where: { stockId: current.id }, select: { id: true } }),
    ]);
    if (movement || installed || current.quantidadeReservada > 0) throw new StockWriteError("A identidade de um lote com historico/reservas e imutavel. Crie outro lote.");
  }
  const siblings = await tx.stock.findMany({ where: {
    referencia: data.referencia, serviceStationId: data.serviceStationId ?? null,
    ...(current ? { id: { not: current.id } } : {}),
  } });
  if (identityChanged && siblings.some(row => stockItemSupportsValidity(row) !== dated)) {
    throw new StockWriteError("A mesma referencia/estacao nao pode misturar artigos com e sem validade.");
  }
  if (!dated && siblings.length && (!current || identityChanged)) throw new StockWriteError("Artigos sem validade permitem apenas um registo por referencia/estacao.");
  if (identityChanged && data.lote != null && siblings.some(row => row.lote != null && row.lote.trim() === String(data.lote).trim())) throw new StockWriteError("Ja existe este lote para a referencia/estacao. Atualize o registo existente.");
  if (identityChanged && !dated && normalizeStockCategory(data.categoria, data.descricao) === "CILINDROS") {
    const keys = [data.referencia, data.codigoFabricante].map(normalizeCylinderSerialKey).filter(Boolean);
    const cylinders = await tx.stock.findMany({ where: { categoria: "CILINDROS", serviceStationId: data.serviceStationId ?? null, ...(current ? { id: { not: current.id } } : {}) } });
    if (cylinders.some(row => [row.referencia, row.codigoFabricante].map(normalizeCylinderSerialKey).some(key => key && keys.includes(key)))) throw new StockWriteError("Ja existe este numero de serie de cilindro na estacao.");
  }
  if (!current && dated && !data.codigoBarras) data.codigoBarras = `LOT-${randomUUID()}`;
  return data;
}

export async function createStockRows(inputs: Record<string, unknown>[], serviceStationId: number | null) {
  return stockTransaction(async tx => {
    const rows = [];
    for (const input of inputs) {
      const data = { ...normalizeStockPayload(input), serviceStationId };
      await validateStockLot(tx, data);
      rows.push(await tx.stock.create({ data }));
    }
    return rows;
  });
}
