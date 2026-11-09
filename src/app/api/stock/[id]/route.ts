import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { normalizeStockValidityValue, stockItemSupportsValidity } from "@/lib/stock-validity";
import { validateStockLot, stockTransaction, stockWriteStatus, StockWriteError } from "@/lib/stock-utils";
import { isFoodRationsLike, normalizeStockReferenceByRule, isServiceResourceReference } from "@/lib/stock-reference-rules";
import { normalizeStockCategory } from "@/lib/stock-categories";
import { normalizeStockUnit } from "@/lib/stock-unit";
import { getAccessContext } from "@/lib/access-control";
import { canEditPath, canViewPath } from "@/lib/user-permissions";
import { resolveActiveServiceStationId } from "@/lib/station-selection";
import {
  getStockApplicabilityTypes,
  getStockValidityManualMode,
  parseStockValidityManualInput,
  upsertStockMetadataInObservacoes,
} from "@/lib/stock-metadata";

type StockOperationCacheEntry = {
  expiresAt: number;
  response: unknown;
};

const globalWithStockOperationCache = globalThis as typeof globalThis & {
  __stockOperationCache?: Map<string, StockOperationCacheEntry>;
};

const stockOperationCache =
  globalWithStockOperationCache.__stockOperationCache ?? new Map<string, StockOperationCacheEntry>();

if (!globalWithStockOperationCache.__stockOperationCache) {
  globalWithStockOperationCache.__stockOperationCache = stockOperationCache;
}

function canViewStock(access: NonNullable<Awaited<ReturnType<typeof getAccessContext>>>) {
  return access.isAdmin || canViewPath(access.permissions, "/stock") || canEditPath(access.permissions, "/stock");
}

function canEditStock(access: NonNullable<Awaited<ReturnType<typeof getAccessContext>>>) {
  return access.isAdmin || canEditPath(access.permissions, "/stock");
}

function cleanupExpiredStockOperationCache(now: number) {
  for (const [key, entry] of stockOperationCache.entries()) {
    if (entry.expiresAt <= now) {
      stockOperationCache.delete(key);
    }
  }
}

function parseIdParam(value: unknown): number {
  const id = Number(value);
  return Number.isFinite(id) ? id : NaN;
}

function hasOwn(input: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(input || {}, key);
}

function normalizePartialStockPayload(input: Record<string, unknown>, current: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  const nome = hasOwn(input, "nome") || hasOwn(input, "descricao")
    ? String(input?.nome || input?.descricao || "").trim()
    : undefined;
  const categoriaOriginal = hasOwn(input, "categoria") ? input?.categoria : undefined;
  const categoriaNormalizada = hasOwn(input, "categoria") ? normalizeStockCategory(input?.categoria, nome || input?.descricao) : undefined;
  const referenciaNormalizada = hasOwn(input, "referencia") && String(input.referencia || "").trim() === current.referencia
    ? String(current.referencia)
    : normalizeStockReferenceByRule(
    hasOwn(input, "referencia") ? input?.referencia : undefined,
    nome,
    hasOwn(input, "descricao") ? input?.descricao : undefined,
    categoriaOriginal,
    hasOwn(input, "observacoes") ? input?.observacoes : undefined
  );
  const observacoesForMeta = hasOwn(input, "observacoes") ? input?.observacoes : current.observacoes;
  const validadeManualInput = parseStockValidityManualInput(input?.validadeAplicavelManual ?? input?.validadeAplicavel);
  const observacoesComMeta = upsertStockMetadataInObservacoes(observacoesForMeta, {
    validadeAplicavel: validadeManualInput,
    aplicavelTipos: hasOwn(input, "aplicavelTipos") ? input?.aplicavelTipos : undefined,
  });
  const supportsValidity = stockItemSupportsValidity({
    ...current,
    ...input,
    ...(nome === undefined ? {} : { nome }),
    referencia: hasOwn(input, "referencia") ? referenciaNormalizada : current.referencia,
    observacoes: observacoesComMeta,
  });

  if (hasOwn(input, "nome") || hasOwn(input, "descricao")) {
    data.descricao = nome || "Item sem descrição";
  }
  if (
    hasOwn(input, "referencia") ||
    isFoodRationsLike(
      nome,
      hasOwn(input, "descricao") ? input?.descricao : undefined,
      hasOwn(input, "categoria") ? input?.categoria : undefined,
      hasOwn(input, "observacoes") ? input?.observacoes : undefined,
      hasOwn(input, "referencia") ? input?.referencia : undefined
    )
  ) {
    data.referencia = referenciaNormalizada;
  }
  if (hasOwn(input, "estadoArtigo")) data.estadoArtigo = input?.estadoArtigo ? String(input.estadoArtigo) : "ATIVO";
  if (hasOwn(input, "referenciaSubstituta")) data.referenciaSubstituta = input?.referenciaSubstituta ? String(input.referenciaSubstituta) : null;
  if (hasOwn(input, "categoria")) data.categoria = categoriaNormalizada;
  if (hasOwn(input, "unit")) data.unit = normalizeStockUnit(input?.unit);
  if (hasOwn(input, "associavelJangada")) data.associavelJangada = Boolean(input?.associavelJangada);
  if (hasOwn(input, "aplicavelMarcaJangada")) data.aplicavelMarcaJangada = input?.aplicavelMarcaJangada ? String(input.aplicavelMarcaJangada) : null;
  if (hasOwn(input, "aplicavelModeloJangada")) data.aplicavelModeloJangada = input?.aplicavelModeloJangada ? String(input.aplicavelModeloJangada) : null;
  if (hasOwn(input, "precoCompra")) data.precoCompra = input?.precoCompra === "" || input?.precoCompra == null ? null : Number(input.precoCompra);
  if (hasOwn(input, "codigoFabricante")) data.codigoFabricante = input?.codigoFabricante ? String(input.codigoFabricante) : null;
  if (hasOwn(input, "inventario")) data.inventario = input?.inventario ? String(input.inventario) : null;
  if (hasOwn(input, "lote")) data.lote = input?.lote ? String(input.lote) : null;
  if (hasOwn(input, "validade") || (!supportsValidity && ["validadeAplicavelManual", "validadeAplicavel", "observacoes"].some(key => hasOwn(input, key)))) {
    data.validade = supportsValidity ? normalizeStockValidityValue(input?.validade) : null;
  }
  if (hasOwn(input, "testeHidraulico")) data.testeHidraulico = input?.testeHidraulico ? String(input.testeHidraulico) : null;
  if (hasOwn(input, "estadoCargaCilindro")) data.estadoCargaCilindro = input?.estadoCargaCilindro ? String(input.estadoCargaCilindro).toUpperCase() : null;
  if (hasOwn(input, "precoVenda")) data.precoVenda = Number(input?.precoVenda ?? 0);
  if (hasOwn(input, "quantidade")) data.quantidade = Number(input?.quantidade ?? 0);
  if (hasOwn(input, "quantidadeMinima")) data.quantidadeMinima = input?.quantidadeMinima != null ? Number(input.quantidadeMinima) : null;
  if (hasOwn(input, "leadTimeDias")) {
    const rawLeadTime = input?.leadTimeDias == null || input?.leadTimeDias === "" ? null : Number(input.leadTimeDias);
    data.leadTimeDias = rawLeadTime == null || !Number.isFinite(rawLeadTime) ? null : Math.max(0, Math.floor(rawLeadTime));
  }
  if (hasOwn(input, "localizacao")) data.localizacao = input?.localizacao ? String(input.localizacao) : null;
  if (hasOwn(input, "observacoes") || hasOwn(input, "validadeAplicavelManual") || hasOwn(input, "validadeAplicavel") || hasOwn(input, "aplicavelTipos")) {
    data.observacoes = observacoesComMeta;
  }
  if (hasOwn(input, "foto")) data.foto = input?.foto ? String(input.foto) : null;

  return data;
}

type StockItemLike = Record<string, unknown> & {
  descricao: string;
  categoria: string | null;
  observacoes: string | null;
};

function mapStockItemResponse(item: StockItemLike) {
  return {
    ...item,
    nome: item.descricao,
    categoria: normalizeStockCategory(item.categoria, item.descricao),
    validadeAplicavelManual: getStockValidityManualMode(item.observacoes),
    aplicavelTipos: getStockApplicabilityTypes(item.observacoes),
  };
}

// GET /api/stock/[id] - Buscar artigo individual do stock
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await getAccessContext();
    if (!access) {
      return NextResponse.json({ error: 'Sessão obrigatória.' }, { status: 401 });
    }
    if (!canViewStock(access)) {
      return NextResponse.json({ error: 'Sem permissão para consultar stock.' }, { status: 403 });
    }

    const { id: rawId } = await context.params;
    const id = parseIdParam(rawId);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: 'ID inválido para consultar stock' }, { status: 400 });
    }

    const item = await prisma.stock.findUnique({
      where: { id },
      select: {
        id: true,
        referencia: true,
        descricao: true,
        estadoArtigo: true,
          referenciaSubstituta: true,
          categoria: true,
          unit: true,
          associavelJangada: true,
        aplicavelMarcaJangada: true,
        aplicavelModeloJangada: true,
        precoCompra: true,
        codigoFabricante: true,
        inventario: true,
        lote: true,
        validade: true,
        testeHidraulico: true,
        estadoCargaCilindro: true,
        precoVenda: true,
        quantidade: true,
        quantidadeReservada: true,
        quantidadeMinima: true,
        leadTimeDias: true,
        localizacao: true,
        observacoes: true,
        foto: true,
        codigoBarras: true,
        serviceStationId: true,
      },
    });

    if (!item) {
      return NextResponse.json({ error: 'Artigo não encontrado' }, { status: 404 });
    }

    const activeStationId = resolveActiveServiceStationId(req, access);
    if (item.serviceStationId && (activeStationId ? item.serviceStationId !== activeStationId : !access.isAdmin && !access.allowedStationIds.includes(item.serviceStationId))) {
      return NextResponse.json({ error: 'Artigo pertence a outra estação.' }, { status: 403 });
    }

    return NextResponse.json(mapStockItemResponse(item));
  } catch {
    return NextResponse.json({ error: 'Erro ao buscar artigo de stock' }, { status: 500 });
  }
}

// PUT /api/stock/[id] - Atualiza artigo do stock
export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await getAccessContext();
    if (!access) {
      return NextResponse.json({ error: 'Sessão obrigatória.' }, { status: 401 });
    }
    if (!canEditStock(access)) {
      return NextResponse.json({ error: 'Sem permissão para editar stock.' }, { status: 403 });
    }

    const { id: rawId } = await context.params;
    const id = parseIdParam(rawId);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: 'ID inválido para atualizar stock' }, { status: 400 });
    }

    const clientIp = String(req.headers.get("x-forwarded-for") || "").split(",")[0]?.trim() || "unknown";
    const rate = await checkRateLimit(`stock-put:${id}:${clientIp}`, 90, 60_000);
    if (rate.status === 503) return NextResponse.json({ error: "Servico temporariamente indisponivel." }, { status: 503 });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Demasiados pedidos para este artigo. Aguarde alguns segundos e tente novamente.", retryAfterMs: rate.retryAfterMs },
        { status: 429 }
      );
    }

    // Buscar record atual para validar estacao
    const current = await prisma.stock.findUnique({
      where: { id },
    });

    if (!current) {
      return NextResponse.json({ error: 'Artigo não encontrado' }, { status: 404 });
    }

    const activeStationId = resolveActiveServiceStationId(req, access);
    if (current.serviceStationId && (activeStationId ? current.serviceStationId !== activeStationId : !access.isAdmin && !access.allowedStationIds.includes(current.serviceStationId))) {
      return NextResponse.json({ error: 'Artigo pertence a outra estação.' }, { status: 403 });
    }

    const body = await req.json();

    if (body?.operacao === "entrada" || body?.operacao === "saida") {
      if (isServiceResourceReference(current.referencia)) {
        return NextResponse.json({ error: 'Recursos de servico nao permitem movimentos de stock.' }, { status: 400 });
      }
      const valorRaw = Number(body?.valor ?? 1);
      if (!Number.isFinite(valorRaw) || valorRaw <= 0) {
        return NextResponse.json({ error: 'A quantidade tem de ser maior que zero.' }, { status: 400 });
      }
      const valor = Math.floor(valorRaw);
      const idemHeader = String(req.headers.get("idempotency-key") || "").trim();
      const idemBody = String(body?.idempotencyKey || body?.requestId || "").trim();
      const idempotencyKey = (idemHeader || idemBody).slice(0, 120);
      const fallbackFingerprint = [
        "stock-op",
        id,
        body.operacao,
        valor,
        String(body?.usuario || "").trim().toLowerCase(),
        String(body?.motivo || "").trim().toLowerCase(),
      ].join(":");
      const operationCacheKey = idempotencyKey
        ? `stock-idem:${id}:${idempotencyKey}`
        : `stock-fallback:${fallbackFingerprint}`;
      const now = Date.now();
      cleanupExpiredStockOperationCache(now);
      const cachedEntry = stockOperationCache.get(operationCacheKey);
      if (cachedEntry && cachedEntry.expiresAt > now) {
        return NextResponse.json(cachedEntry.response);
      }

      const quantidadeAntes = current.quantidade;
      const reservado = Math.max(0, Number(current.quantidadeReservada) || 0);
      const disponivel = Math.max(0, quantidadeAntes - reservado);

      // Proteção contra stock negativo e contra consumo de quantidades reservadas
      if (body.operacao === "saida") {
        if (valor > quantidadeAntes) {
          return NextResponse.json(
            { error: `Stock insuficiente: existem ${quantidadeAntes} unidade(s) e pediu saída de ${valor}.` },
            { status: 409 }
          );
        }
        if (reservado > 0 && valor > disponivel) {
          return NextResponse.json(
            {
              error: `Stock indisponível: ${reservado} unidade(s) estão reservadas para inspeções/ordens; disponível para saída é ${disponivel}.`,
              reservado,
              disponivel,
            },
            { status: 409 }
          );
        }
      }

      // Atualizar stock e criar movimentação em transação
      const updatedByOperation = await stockTransaction(async tx => {
        const fresh = await tx.stock.findUniqueOrThrow({ where: { id } });
        if (body.operacao === "saida" && valor > fresh.quantidade - fresh.quantidadeReservada) throw new StockWriteError("Stock disponivel insuficiente.");
        const updated = await tx.stock.update({
          where: { id },
          data: {
            quantidade: body.operacao === "entrada"
              ? { increment: valor }
              : { decrement: valor },
            ...(hasOwn(body, "estadoCargaCilindro")
              ? { estadoCargaCilindro: body?.estadoCargaCilindro ? String(body.estadoCargaCilindro).toUpperCase() : null }
              : {}),
          },
        });
        await tx.movimentacaoStock.create({
          data: {
            stockId: id,
            tipo: body.operacao,
            quantidade: valor,
            quantidadeAntes: fresh.quantidade,
            quantidadeDepois: updated.quantidade,
            motivo: body.motivo || null,
            usuario: `${access.userId}:${access.email}`,
          },
        });
        return updated;
      });

      stockOperationCache.set(operationCacheKey, {
        response: updatedByOperation,
        expiresAt: now + 15_000,
      });
      
      return NextResponse.json(updatedByOperation);
    }

    const data = normalizePartialStockPayload(body, current);
    if (hasOwn(body, "codigoBarras")) data.codigoBarras = String(body.codigoBarras || "").trim() || null;
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo válido para atualizar stock' }, { status: 400 });
    }

    if (typeof data.quantidade === 'number' && data.quantidade < 0) {
      return NextResponse.json({ error: 'A quantidade não pode ser negativa.' }, { status: 400 });
    }

    const quantidadeAntes = current.quantidade;
    const novaQuantidade = typeof data.quantidade === "number" ? data.quantidade : undefined;
    const quantidadeMudou = novaQuantidade !== undefined && novaQuantidade !== quantidadeAntes;

    // Trilho de auditoria: qualquer alteração direta de quantidade gera uma
    // movimentação de "ajuste" com o motivo (default transparente), em transação.
    const updated = await stockTransaction(async (tx) => {
      const fresh = await tx.stock.findUniqueOrThrow({ where: { id } });
      if (fresh.updatedAt.getTime() !== current.updatedAt.getTime()) throw Object.assign(new Error("Stock alterado entretanto. Recarregue."), { code: "P2034" });
      const validated = await validateStockLot(tx, { ...fresh, ...data } as Prisma.StockUncheckedCreateInput, fresh);
      const updatedRecord = await tx.stock.update({
        where: { id },
        data: { ...data, lote: validated.lote, validade: validated.validade } as Prisma.StockUpdateInput,
      });
      if (quantidadeMudou) {
        await tx.movimentacaoStock.create({
          data: {
            stockId: id,
            tipo: "ajuste",
            quantidade: Math.abs(novaQuantidade - quantidadeAntes),
            quantidadeAntes,
            quantidadeDepois: novaQuantidade,
            motivo: String(body?.motivo || "Correção de quantidade (ajuste manual)").slice(0, 300),
            usuario: `${access.userId}:${access.email}`,
          },
        });
      }
      return updatedRecord;
    });
    return NextResponse.json(mapStockItemResponse(updated));
  } catch (error) {
    const status = stockWriteStatus(error);
    return NextResponse.json({ error: status && error instanceof Error ? error.message : 'Erro ao atualizar stock' }, { status: status || 500 });
  }
}

// DELETE /api/stock/[id] - Remove artigo do stock
export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await getAccessContext();
    if (!access) {
      return NextResponse.json({ error: 'Sessão obrigatória.' }, { status: 401 });
    }
    if (!canEditStock(access)) {
      return NextResponse.json({ error: 'Sem permissão para editar stock.' }, { status: 403 });
    }

    const clientIp = String(req.headers.get("x-forwarded-for") || "").split(",")[0]?.trim() || "unknown";
    const rate = await checkRateLimit(`stock-del:${clientIp}`, 30, 60_000);
    if (rate.status === 503) return NextResponse.json({ error: "Servico temporariamente indisponivel." }, { status: 503 });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Demasiados pedidos de remoção. Aguarde alguns segundos e tente novamente.", retryAfterMs: rate.retryAfterMs },
        { status: 429 }
      );
    }

    const { id: rawId } = await context.params;
    const id = parseIdParam(rawId);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: 'ID inválido para eliminar stock' }, { status: 400 });
    }

    const current = await prisma.stock.findUnique({
      where: { id },
      select: { serviceStationId: true },
    });

    if (!current) {
      return NextResponse.json({ error: 'Item de stock não encontrado' }, { status: 404 });
    }

    const activeStationId = resolveActiveServiceStationId(req, access);
    if (current.serviceStationId && (activeStationId ? current.serviceStationId !== activeStationId : !access.isAdmin && !access.allowedStationIds.includes(current.serviceStationId))) {
      return NextResponse.json({ error: 'Artigo pertence a outra estação.' }, { status: 403 });
    }

    await prisma.stock.update({
      where: { id },
      data: {
        estadoArtigo: "INATIVO",
      },
    });

    return NextResponse.json({ success: true, soft: true });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "Item de stock não encontrado" }, { status: 404 });
    }
    return NextResponse.json({ error: 'Erro ao eliminar stock' }, { status: 500 });
  }
}
