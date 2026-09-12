import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { buildDatabaseErrorResponse } from "@/lib/database-errors";
import { normalizeStockCategory } from "@/lib/stock-categories";
import { getAccessContext } from "@/lib/access-control";
import { canEditPath, canViewPath } from "@/lib/user-permissions";
import { normalizeStockPayload, findDuplicateCylinderStock, findConflictingValidityStock, canEditStock } from "@/lib/stock-utils";
import { resolveActiveServiceStationId } from "@/lib/station-selection";
import { beginApiRequest, captureApiError, finishApiRequest, withRequestId } from '@/lib/observability';
import { parsePageParams, paginatedResponse } from "@/lib/pagination";
import fs from "node:fs";
import path from "node:path";

type ManualPart = {
  part_number?: string;
  source_page?: number;
};

let manualPartToPhotoUrlCache: Map<string, string> | null = null;
let uploadedDirCache: Map<string, Set<string>> | null = null;

function canViewStock(access: NonNullable<Awaited<ReturnType<typeof getAccessContext>>>) {
  return access.isAdmin || canViewPath(access.permissions, "/stock") || canEditPath(access.permissions, "/stock");
}

function slugifyPhotoSegment(value?: string | null): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getUploadedDirListing(uploadsDir: string): Set<string> {
  if (!uploadedDirCache) uploadedDirCache = new Map();
  if (uploadedDirCache.has(uploadsDir)) return uploadedDirCache.get(uploadsDir)!;
  const files = new Set<string>();
  try {
    if (fs.existsSync(uploadsDir)) {
      for (const f of fs.readdirSync(uploadsDir)) {
        files.add(f.toLowerCase());
      }
    }
  } catch (err) { console.error('[API Error] Erro ao listar diretório de uploads:', err); }
  uploadedDirCache.set(uploadsDir, files);
  return files;
}

function buildUploadedPhotoUrl(item: { referencia?: string | null; codigoFabricante?: string | null }): string | null {
  const referencia = String(item.referencia || "").trim();
  const brandSlug = slugifyPhotoSegment(item.codigoFabricante);
  if (!referencia || !brandSlug) return null;

  const uploadsDir = path.join(process.cwd(), "public", "uploads", brandSlug);
  const files = getUploadedDirListing(uploadsDir);
  if (files.size === 0) return null;

  const extensions = [".jpg", ".jpeg", ".png", ".webp"];
  const namesToTry = Array.from(
    new Set([
      referencia,
      referencia.toLowerCase(),
      referencia.toUpperCase(),
      slugifyPhotoSegment(referencia),
    ].filter(Boolean))
  );

  for (const baseName of namesToTry) {
    for (const extension of extensions) {
      if (files.has(`${baseName}${extension}`.toLowerCase())) {
        return `/uploads/${brandSlug}/${baseName}${extension}`;
      }
    }
  }

  return null;
}

function buildManualPhotoUrlFromPartNumber(partNumber?: string | null): string | null {
  const normalized = String(partNumber || "").trim();
  if (!normalized) return null;

  if (!manualPartToPhotoUrlCache) {
    manualPartToPhotoUrlCache = new Map<string, string>();
    
    // Processar manual MK IV
    try {
      const jsonPath = path.join(process.cwd(), "tmp_mkiv_parts.json");
      if (fs.existsSync(jsonPath)) {
        const raw = fs.readFileSync(jsonPath, "utf-8");
        const parts = JSON.parse(raw) as ManualPart[];
        for (const part of parts) {
          const pn = String(part?.part_number || "").trim();
          const page = Number(part?.source_page || 0);
          if (!pn || !Number.isFinite(page) || page <= 0) continue;
          if (manualPartToPhotoUrlCache.has(pn)) continue;
          
          // Tentar foto individual MK IV
          const individualImgPath = path.join(process.cwd(), "public", "manual-parts", `${pn}.jpg`);
          if (fs.existsSync(individualImgPath)) {
            manualPartToPhotoUrlCache.set(pn, `/manual-parts/${pn}.jpg`);
            continue;
          }
          
          // Fallback para página MK IV
          const imgName = `page_${String(page).padStart(4, "0")}.jpg`;
          manualPartToPhotoUrlCache.set(
            pn,
            `/api/manuais-assets/Service_Manual_Marine_MK_IV_PT_HTML/assets/${imgName}`
          );
        }
      }
    } catch (err) {
      console.error('[API Error] Erro ao processar manual MK IV:', err);
    }
    
    // Processar manual LR97
    try {
      const jsonPathLR97 = path.join(process.cwd(), "tmp_lr97_parts.json");
      if (fs.existsSync(jsonPathLR97)) {
        const raw = fs.readFileSync(jsonPathLR97, "utf-8");
        const parts = JSON.parse(raw) as ManualPart[];
        for (const part of parts) {
          const pn = String(part?.part_number || "").trim();
          const page = Number(part?.source_page || 0);
          if (!pn || !Number.isFinite(page) || page <= 0) continue;
          if (manualPartToPhotoUrlCache.has(pn)) continue;
          
          // Tentar foto individual LR97
          const individualImgPathLR97 = path.join(process.cwd(), "public", "manual-parts-lr97", `${pn}.jpg`);
          if (fs.existsSync(individualImgPathLR97)) {
            manualPartToPhotoUrlCache.set(pn, `/manual-parts-lr97/${pn}.jpg`);
          }
        }
      }
    } catch (err) {
      console.error('[API Error] Erro ao processar manual LR97:', err);
    }
  }

  return manualPartToPhotoUrlCache.get(normalized) || null;
}

export async function GET(req: NextRequest) {
  const context = beginApiRequest(req, 'stock');
  const respond = (body: unknown, init?: ResponseInit, extra?: Record<string, unknown>) => {
    const response = NextResponse.json(body, init);
    finishApiRequest(context, response.status, extra);
    return withRequestId(response, context);
  };

  try {
    const access = await getAccessContext();
    if (!access) {
      console.error("[API /stock] getAccessContext devolveu null — sessão inválida.");
      return respond({ error: "Sessão obrigatória." }, { status: 401 });
    }
    if (!canViewStock(access)) {
      console.error(`[API /stock] Utilizador sem permissão: role=${access.role}, userId=${access.userId}`);
      return respond({ error: "Sem permissão para consultar stock." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);

    if (searchParams.get("refreshPhotos") === "1") {
      uploadedDirCache = null;
      manualPartToPhotoUrlCache = null;
    }

    const activeStationId = resolveActiveServiceStationId(req, access);

    const where: Prisma.StockWhereInput = {};

    if (activeStationId) {
      where.OR = [
        { serviceStationId: activeStationId },
        { serviceStationId: null },
      ];
    } else if (!access.isAdmin) {
      where.OR = [
        { serviceStationId: { in: access.allowedStationIds.length ? access.allowedStationIds : [-1] } },
        { serviceStationId: null },
      ];
    }

    const stockScope = String(searchParams.get("stockScope") || "").trim().toLowerCase();
    const includeInactive = searchParams.get("includeInactive") === "true";
    const busca = String(searchParams.get("busca") || "").trim();
    const includeFoto = searchParams.get("includeFoto") === "true";
    const requestedTake = Number(searchParams.get("take") || 0);
    const take = Number.isFinite(requestedTake) && requestedTake > 0 ? Math.min(requestedTake, 5000) : 5000;
    const idsRaw = String(searchParams.get("ids") || "").trim();
    const refsRaw = String(searchParams.get("refs") || "").trim();

    if (idsRaw) {
      const ids = idsRaw
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value) && value > 0)
        .slice(0, 100);
      if (ids.length > 0) {
        where.id = { in: ids };
      }
    }

    if (refsRaw) {
      const refs = refsRaw
        .split(",")
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .slice(0, 100);
      if (refs.length > 0) {
        where.referencia = { in: refs };
      }
    }

    if (busca) {
      where.OR = [
        { referencia: { contains: busca, mode: "insensitive" } },
        { descricao: { contains: busca, mode: "insensitive" } },
        { codigoFabricante: { contains: busca, mode: "insensitive" } },
        { codigoBarras: { contains: busca, mode: "insensitive" } },
      ];
    }

    const referenciaParam = searchParams.get("referencia"); if (referenciaParam) where.referencia = { contains: referenciaParam, mode: "insensitive" };
    const descricaoParam = searchParams.get("descricao"); if (descricaoParam) where.descricao = { contains: descricaoParam, mode: "insensitive" };
    const nomeParam = searchParams.get("nome"); if (nomeParam) where.descricao = { contains: nomeParam, mode: "insensitive" };
    const categoriaParam = searchParams.get("categoria"); if (categoriaParam) where.categoria = { contains: categoriaParam, mode: "insensitive" };
    const validadeParam = searchParams.get("validade"); if (validadeParam) where.validade = { contains: validadeParam, mode: "insensitive" };
    if (searchParams.get("associavelJangada")) where.associavelJangada = searchParams.get("associavelJangada") === "true";
    if (searchParams.get("estadoArtigo")) {
      where.estadoArtigo = String(searchParams.get("estadoArtigo"));
    } else if (!includeInactive) {
      where.estadoArtigo = { not: "INATIVO" };
    }

    if (stockScope === "jangadas-ocean") {
      where.AND = [
        {
          OR: [
            { associavelJangada: true },
            {
              AND: [
                { aplicavelMarcaJangada: { contains: "ocean safety", mode: "insensitive" } },
                { codigoFabricante: { not: null } },
                { codigoFabricante: { not: "" } },
              ],
            },
            {
              categoria: { in: ["PRIMEIROS SOCORROS", "PIROTÉCNICOS", "CONSUMÍVEIS", "RAÇÕES", "ÁGUAS"] },
            },
          ],
        },
      ];
    }

    const wantsPage = searchParams.has("page") || searchParams.get("paginated") === "1";
    const pageParams = parsePageParams(searchParams, { pageSize: take > 500 ? 100 : take || 100, maxPageSize: 500 });
    const select = {
      id: true,
      referencia: true,
      descricao: true,
      estadoArtigo: true,
      referenciaSubstituta: true,
      categoria: true,
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
      quantidadeMinima: true,
      localizacao: true,
      observacoes: true,
      foto: includeFoto,
      codigoBarras: true,
    } as const;

    type StockListRow = {
      id: number;
      referencia: string | null;
      descricao: string | null;
      categoria: string | null;
      codigoFabricante: string | null;
      foto: string | null;
      [key: string]: unknown;
    };
    const mapRow = (item: StockListRow): StockListRow => ({
      ...item,
      nome: item.descricao,
      categoria: normalizeStockCategory(item.categoria, item.descricao),
      foto:
        item.foto ||
        buildUploadedPhotoUrl(item) ||
        buildManualPhotoUrlFromPartNumber(item.codigoFabricante) ||
        buildManualPhotoUrlFromPartNumber(item.referencia) ||
        null,
    });

    if (wantsPage) {
      const [total, stock] = await Promise.all([
        prisma.stock.count({ where }),
        prisma.stock.findMany({
          where,
          orderBy: { id: "desc" },
          skip: pageParams.skip,
          take: pageParams.take,
          select,
        }),
      ]);
      return respond(
        paginatedResponse({
          items: stock.map(mapRow),
          total,
          page: pageParams.page,
          pageSize: pageParams.pageSize,
        }),
        undefined,
        { count: stock.length, total }
      );
    }

    const stock = await prisma.stock.findMany({
      where,
      orderBy: { id: "desc" },
      take: (idsRaw || refsRaw) ? 100 : take,
      select,
    });

    const map = new Map<string, any>();
    for (const rawItem of stock) {
      const item = mapRow(rawItem);
      const key = String(item.referencia || item.descricao || item.id).trim().toLowerCase();
      if (!key) {
        map.set(`id-${item.id}`, item);
        continue;
      }
      if (map.has(key)) {
        const existing = map.get(key)!;
        existing.quantidade = Number(existing.quantidade || 0) + Number(item.quantidade || 0);
      } else {
        map.set(key, { ...item });
      }
    }
    const dedupedStock = Array.from(map.values());

    return respond(dedupedStock, undefined, { count: dedupedStock.length });
  } catch (error) {
    console.error("[API /stock] Erro ao buscar stock:", error);
    captureApiError(context, error);
    const response = buildDatabaseErrorResponse(error, 'Erro ao buscar stock');
    finishApiRequest(context, response.status);
    return withRequestId(response, context);
  }
}

// Permite criar stock individual ou em massa via POST
export async function POST(req: NextRequest) {
  const context = beginApiRequest(req, 'stock');
  const respond = (body: unknown, init?: ResponseInit, extra?: Record<string, unknown>) => {
    const response = NextResponse.json(body, init);
    finishApiRequest(context, response.status, extra);
    return withRequestId(response, context);
  };

  try {
    const access = await getAccessContext();
    if (!access) {
      return respond({ error: "Sessão obrigatória." }, { status: 401 });
    }
    if (!canEditStock(access)) {
      return respond({ error: "Sem permissão para editar stock." }, { status: 403 });
    }

    const activeStationId = resolveActiveServiceStationId(req, access);
    const body = await req.json();
    if (Array.isArray(body)) {
      // Criação em massa
      const data = body.map(normalizeStockPayload).map((item) => ({
        ...item,
        serviceStationId: activeStationId,
      }));

      for (const item of data) {
        const duplicate = await findDuplicateCylinderStock(item);
        if (duplicate) {
          return respond(
            {
              error: `Já existe um cilindro com essa referência/número de série no stock (ID ${duplicate.id}).`,
              duplicateId: duplicate.id,
            },
            { status: 409 },
          );
        }

        const conflito = await findConflictingValidityStock(item);
        if (conflito) {
          return respond(
            {
              error: `Conflito de validades para a referência ${item.referencia}: já existe no stock (ID ${conflito.id}) com validade ${conflito.validade}. Junte a quantidade ao registo existente ou corrija a validade.`,
              duplicateId: conflito.id,
              existingValidade: conflito.validade,
            },
            { status: 409 },
          );
        }
      }

      const created = await prisma.stock.createMany({ data });
      return respond({ count: created.count }, undefined, { batch: true });
    } else {
      // Criação individual
      const payload = {
        ...normalizeStockPayload(body),
        serviceStationId: activeStationId,
      };
      const duplicate = await findDuplicateCylinderStock(payload);
      if (duplicate) {
        return respond(
          {
            error: `Já existe um cilindro com essa referência/número de série no stock (ID ${duplicate.id}).`,
            duplicateId: duplicate.id,
          },
          { status: 409 },
        );
      }

      const conflito = await findConflictingValidityStock(payload);
      if (conflito) {
        return respond(
          {
            error: `Conflito de validades para a referência ${payload.referencia}: já existe no stock (ID ${conflito.id}) com validade ${conflito.validade}. Junte a quantidade ao registo existente ou corrija a validade.`,
            duplicateId: conflito.id,
            existingValidade: conflito.validade,
          },
          { status: 409 },
        );
      }

      const created = await prisma.stock.create({ data: payload });
      return respond(created, undefined, { batch: false, stockId: created.id });
    }
  } catch (error) {
    captureApiError(context, error);
    const response = buildDatabaseErrorResponse(error, 'Erro ao criar stock');
    finishApiRequest(context, response.status);
    return withRequestId(response, context);
  }
}

// DELETE /api/stock - Elimina artigos em lote
export async function DELETE(req: NextRequest) {
  const context = beginApiRequest(req, 'stock');
  const respond = (body: unknown, init?: ResponseInit, extra?: Record<string, unknown>) => {
    const response = NextResponse.json(body, init);
    finishApiRequest(context, response.status, extra);
    return withRequestId(response, context);
  };

  try {
    const access = await getAccessContext();
    if (!access) {
      return respond({ error: "Sessão obrigatória." }, { status: 401 });
    }
    if (!canEditStock(access)) {
      return respond({ error: "Sem permissão para editar stock." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body?.ids)
      ? body.ids.map((value: unknown) => Number(value)).filter((value: number) => Number.isFinite(value) && value > 0)
      : [];

    if (ids.length === 0) {
      return respond({ error: "Forneça uma lista válida de IDs para eliminar." }, { status: 400 });
    }

    const result = await prisma.stock.deleteMany({
      where: {
        id: { in: ids },
      },
    });

    return respond({ success: true, count: result.count }, undefined, { deletedIds: ids.length });
  } catch (error) {
    captureApiError(context, error);
    const response = buildDatabaseErrorResponse(error, "Erro ao eliminar stock em lote");
    finishApiRequest(context, response.status);
    return withRequestId(response, context);
  }
}
