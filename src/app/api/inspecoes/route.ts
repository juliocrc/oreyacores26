import { NextRequest, NextResponse } from 'next/server';
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { buildDatabaseErrorResponse } from "@/lib/database-errors";
import { generateInspectionCertificateNumber, generateNextObraNumber, saveInspection } from "@/app/inspecoes/actions";
import { saveInspectionSnapshot } from '@/lib/inspection-snapshots';
import { beginApiRequest, captureApiError, finishApiRequest, withRequestId } from '@/lib/observability';
import { parseOrdemServicoMeta, toOrdemServicoMetaJson } from "@/lib/ordens-servico";
import { getAccessContext } from "@/lib/access-control";
import { logAuditoria } from "@/lib/auditoria";

async function syncInspectionWithWorkOrder(ordemId: number, inspecaoId: number, artigosSubstituidos: Array<Record<string, unknown>>) {
  try {
    // 1. Update the work order inspecaoId and status
    await prisma.ordemServico.update({
      where: { id: ordemId },
      data: {
        inspecaoId,
        status: "concluida",
        dataConclusao: new Date(),
      },
    });

    // 2. Synchronize materials consumed during this inspection to the work order
    const currentOrder = await prisma.ordemServico.findUnique({
      where: { id: ordemId },
      select: { metadados: true },
    });

    if (currentOrder) {
      const meta = parseOrdemServicoMeta(currentOrder.metadados);
      const existingMaterials = Array.isArray(meta.materials) ? [...meta.materials] : [];

      for (const item of artigosSubstituidos) {
        const sId = Number(item.stockId || 0);
        if (!sId) continue;

        // Find stock details
        const stockItem = await prisma.stock.findUnique({
          where: { id: sId },
          select: { referencia: true, descricao: true, precoVenda: true },
        });

        if (stockItem) {
          // Check if already in materials
          const idx = existingMaterials.findIndex((m) => m.stockId === sId);
          if (idx !== -1) {
            existingMaterials[idx].quantidadeUsada = Number(existingMaterials[idx].quantidadeUsada || 0) + Number(item.quantidade || 1);
            existingMaterials[idx].consumido = true;
          } else {
            existingMaterials.push({
              id: `material_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
              stockId: sId,
              referencia: stockItem.referencia || "",
              descricao: stockItem.descricao || "",
              quantidadePrevista: 0,
              quantidadeUsada: Number(item.quantidade || 1),
              precoUnitario: Number(item.precoUnitario ?? stockItem.precoVenda ?? 0),
              consumido: true,
              reservado: false,
            });
          }
        }
      }

      // Save updated metadados with materials
      const updatedMetaJson = toOrdemServicoMetaJson({
        ...meta,
        materials: existingMaterials,
      });

      await prisma.ordemServico.update({
        where: { id: ordemId },
        data: {
          metadados: updatedMetaJson,
        },
      });

      // Log this sync operation
      await prisma.ordemServicoLog.create({
        data: {
          ordemServicoId: ordemId,
          type: "SYSTEM",
          message: `Inspeção #${inspecaoId} concluída. Sincronizados ${artigosSubstituidos.length} artigos substituídos com os materiais consumidos.`,
          user: "sistema",
        },
      });
    }
  } catch (error) {
    console.error("Error in syncInspectionWithWorkOrder:", error);
  }
}

export async function GET(request: NextRequest) {
  const context = beginApiRequest(request, 'inspecoes');
  try {
    const respond = (body: unknown, init?: ResponseInit, extra?: Record<string, unknown>) => {
      const response = NextResponse.json(body, init);
      finishApiRequest(context, response.status, extra);
      return withRequestId(response, context);
    };

    const { searchParams } = new URL(request.url);
    if (searchParams.get('nextCertificate') === '1') {
      const referenceDate = searchParams.get('referenceDate');
      const [certificadoNumero, numeroObra] = await Promise.all([
        generateInspectionCertificateNumber(referenceDate),
        generateNextObraNumber(referenceDate),
      ]);
      return respond({ certificadoNumero, numeroObra }, undefined, { nextCertificate: true, referenceDate: referenceDate || null });
    }

    const checkCertificate = searchParams.get('checkCertificate');
    if (checkCertificate) {
      const value = checkCertificate.trim();
      const excludeInspectionId = searchParams.get('excludeInspectionId')
        ? parseInt(searchParams.get('excludeInspectionId')!, 10)
        : null;

      const excludeCondition = excludeInspectionId && Number.isFinite(excludeInspectionId)
        ? Prisma.sql`AND id != ${excludeInspectionId}`
        : Prisma.empty;

      const [inspectionMatch, raftMatch] = await Promise.all([
        prisma.$queryRaw<Array<{ id: number; jangadaId: number | null; jangadaSerial: string | null }>>`
          SELECT id, "jangadaId", "jangadaSerial" FROM "Inspecao"
          WHERE LOWER("certificadoNumero") = LOWER(${value})
          ${excludeCondition}
          LIMIT 1`,
        prisma.$queryRaw<Array<{ id: number; serial: string | null }>>`
          SELECT id, serial FROM "Jangada"
          WHERE LOWER("ultimoCertificadoNumero") = LOWER(${value})
          LIMIT 1`,
      ]);

      return respond({
        exists: Boolean(inspectionMatch[0] || raftMatch[0]),
        inspection: inspectionMatch[0]
          ? { id: inspectionMatch[0].id, jangadaId: inspectionMatch[0].jangadaId, jangadaSerial: inspectionMatch[0].jangadaSerial }
          : null,
        raft: raftMatch[0] ? { id: raftMatch[0].id, serial: raftMatch[0].serial } : null,
      }, undefined, { checkCertificate: true, certificate: value });
    }

    const jangadaIdParam = searchParams.get('jangadaId');
    const jangadaId = jangadaIdParam ? parseInt(jangadaIdParam, 10) : null;

    const coleteIdParam = searchParams.get('coleteId');
    const coleteId = coleteIdParam ? parseInt(coleteIdParam, 10) : null;

    const pageParam = searchParams.get('page');
    const limitParam = searchParams.get('limit');
    const isPaginated = Boolean(pageParam);

    const whereClause: Prisma.InspecaoWhereInput = {};
    if (jangadaId && !Number.isNaN(jangadaId)) {
      whereClause.jangadaId = jangadaId;
    } else if (coleteId && !Number.isNaN(coleteId)) {
      whereClause.coleteId = coleteId;
    }

    const where = Object.keys(whereClause).length > 0 ? whereClause : undefined;

    if (isPaginated) {
      const page = Math.max(1, parseInt(pageParam!, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(limitParam || '50', 10)));
      const skip = (page - 1) * limit;

      const [inspecoes, total] = await Promise.all([
        prisma.inspecao.findMany({
          where,
          orderBy: [{ dataInspecao: 'desc' }, { id: 'desc' }],
          skip,
          take: limit,
          include: { artigos: true },
        }),
        prisma.inspecao.count({ where }),
      ]);

      return respond(inspecoes, undefined, {
        paginated: true,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      });
    }

    const inspecoes = await prisma.inspecao.findMany({
      where,
      orderBy: [{ dataInspecao: 'desc' }, { id: 'desc' }],
      take: 5000,
      include: { artigos: true },
    });

    if ((jangadaId && !Number.isNaN(jangadaId)) || (coleteId && !Number.isNaN(coleteId))) {
      return respond(inspecoes, undefined, { filtered: true, count: inspecoes.length });
    }

    const seen = new Set<string>();
    const filtered = inspecoes.filter((insp) => {
      const ship = String(insp.navioNome || '').toLowerCase();
      if (!ship || seen.has(ship)) return false;
      seen.add(ship);
      return true;
    });
    return respond(filtered, undefined, { count: filtered.length, sourceCount: inspecoes.length });
  } catch (error) {
    captureApiError(context, error);
    const response = buildDatabaseErrorResponse(error, 'Erro ao buscar inspecoes');
    finishApiRequest(context, response.status);
    return withRequestId(response, context);
  }
}

export async function POST(req: NextRequest) {
  const context = beginApiRequest(req, 'inspecoes');
  const respond = (body: unknown, init?: ResponseInit, extra?: Record<string, unknown>) => {
    const response = NextResponse.json(body, init);
    finishApiRequest(context, response.status, extra);
    return withRequestId(response, context);
  };

  try {
    const body = await req.json();
    if (Array.isArray(body)) {
      const created = await prisma.inspecao.createMany({ data: body });
      return respond({ count: created.count }, undefined, { batch: true });
    } else {
      const payload = {
        ...body,
        date: body?.date ?? body?.dataInspecao ?? null,
        dataProxInspecao: body?.dataProxInspecao ?? body?.nextInspectionDate ?? null,
        shipId: body?.shipId ?? body?.navioId ?? null,
        raftId: body?.raftId ?? body?.jangadaId ?? null,
        applyStockMovements: body?.applyStockMovements ?? true,
      };

      const saved = await saveInspection(payload);

      // Synchronize with Work Order if linked
      if (body?.ordemId) {
        await syncInspectionWithWorkOrder(Number(body.ordemId), saved.id, body.artigosSubstituidos || []);
      }

      const created = await prisma.inspecao.findUnique({
        where: { id: saved.id },
        include: { artigos: true },
      });

      // Save snapshot for future historical view
      await saveInspectionSnapshot(created?.certificadoNumero || "", created?.jangadaId ?? 0);
      return respond(created, undefined, { batch: false, inspecaoId: created?.id ?? null });
    }
  } catch (error) {
    captureApiError(context, error);
    const response = buildDatabaseErrorResponse(error, 'Erro ao criar inspecao');
    finishApiRequest(context, response.status);
    return withRequestId(response, context);
  }
}

export async function PUT(req: NextRequest) {
  const context = beginApiRequest(req, 'inspecoes');
  const respond = (body: unknown, init?: ResponseInit, extra?: Record<string, unknown>) => {
    const response = NextResponse.json(body, init);
    finishApiRequest(context, response.status, extra);
    return withRequestId(response, context);
  };

  try {
    const url = new URL(req.url);
    const idParam = url.searchParams.get('id');
    if (!idParam) return respond({ error: 'Missing id' }, { status: 400 });
    const id = parseInt(idParam, 10);
    const body = await req.json();
    const payload = {
      ...body,
      id,
      date: body?.date ?? body?.dataInspecao ?? null,
      dataProxInspecao: body?.dataProxInspecao ?? body?.nextInspectionDate ?? null,
      shipId: body?.shipId ?? body?.navioId ?? null,
      raftId: body?.raftId ?? body?.jangadaId ?? null,
      applyStockMovements: body?.applyStockMovements ?? false,
    };

    const saved = await saveInspection(payload);

    // Synchronize with Work Order if linked
    if (body?.ordemId) {
      await syncInspectionWithWorkOrder(Number(body.ordemId), saved.id, body.artigosSubstituidos || []);
    }

    const updated = await prisma.inspecao.findUnique({
      where: { id: saved.id },
      include: { artigos: true },
    });
    return respond(updated, undefined, { inspecaoId: id });
  } catch (error) {
    captureApiError(context, error);
    const response = buildDatabaseErrorResponse(error, 'Erro ao atualizar inspecao');
    finishApiRequest(context, response.status);
    return withRequestId(response, context);
  }
}

export async function DELETE(req: NextRequest) {
  const context = beginApiRequest(req, 'inspecoes');
  const respond = (body: unknown, init?: ResponseInit, extra?: Record<string, unknown>) => {
    const response = NextResponse.json(body, init);
    finishApiRequest(context, response.status, extra);
    return withRequestId(response, context);
  };

  try {
    const access = await getAccessContext();
    if (!access) {
      const unauth = respond({ error: "Sessão obrigatória." }, { status: 401 });
      return unauth;
    }
    if (!access.isAdmin) {
      const forbidden = respond({ error: "Sem permissão para eliminar inspeções." }, { status: 403 });
      return forbidden;
    }

    const url = new URL(req.url);
    const idParam = url.searchParams.get('id');
    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body?.ids)
      ? body.ids
          .map((value: unknown) => Number(value))
          .filter((value: number) => Number.isFinite(value) && value > 0)
      : [];

    if (ids.length > 0) {
      const registos = await prisma.inspecao.findMany({
        where: { id: { in: ids } },
        select: { id: true, certificadoNumero: true, jangadaSerial: true, dataInspecao: true },
      });
      const deleted = await prisma.inspecao.deleteMany({ where: { id: { in: ids } } });
      for (const reg of registos) {
        await logAuditoria({
          tabela: "Inspecao",
          tipoOperacao: "DELETE",
          idRegisto: reg.id,
          descricao: `Inspeção eliminada em lote: ${reg.certificadoNumero || "sem certificado"}${reg.jangadaSerial ? ` (S/N ${reg.jangadaSerial})` : ""}${reg.dataInspecao ? ` em ${reg.dataInspecao}` : ""}.`,
          usuario: access.email || "sistema",
        });
      }
      return respond({ success: true, count: deleted.count, ids }, undefined, { batch: true });
    }

    if (!idParam) return respond({ error: 'Missing id' }, { status: 400 });
    const id = parseInt(idParam, 10);
    const reg = await prisma.inspecao.findUnique({
      where: { id },
      select: { id: true, certificadoNumero: true, jangadaSerial: true, dataInspecao: true },
    });
    const deleted = await prisma.inspecao.delete({ where: { id } });
    await logAuditoria({
      tabela: "Inspecao",
      tipoOperacao: "DELETE",
      idRegisto: id,
      descricao: `Inspeção eliminada: ${reg?.certificadoNumero || "sem certificado"}${reg?.jangadaSerial ? ` (S/N ${reg.jangadaSerial})` : ""}${reg?.dataInspecao ? ` em ${reg.dataInspecao}` : ""}.`,
      usuario: access.email || "sistema",
    });
    return respond(deleted, undefined, { batch: false, inspecaoId: id });
  } catch (error) {
    captureApiError(context, error);
    const response = buildDatabaseErrorResponse(error, 'Erro ao deletar inspecao');
    finishApiRequest(context, response.status);
    return withRequestId(response, context);
  }
}
