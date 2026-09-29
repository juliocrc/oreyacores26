import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getAuthSecret } from "@/lib/auth";
import { getAccessContext } from "@/lib/access-control";
import { logAuditoria } from "@/lib/auditoria";
import prisma from "@/lib/prisma";
import { parseFlexibleDate } from "@/lib/agenda-sync";
import {
  appendOrdemServicoLog,
  appendWorkflowTransition,
  generateOSNumeroOrdem,
  mapOrderStatusToWorkflowStatus,
  normalizeOrdemPrioridade,
  normalizeOrdemStatus,
  normalizeOrdemTipo,
  resolveClienteIdForJangada,
  resolveClienteIdForShipId,
  resolveOrderJangadasContext,
  resolveWorkflowStatus,
  toOrdemServicoMetaJson,
} from "@/lib/ordens-servico";

export const runtime = "nodejs";

function parseIdFromRequest(req: NextRequest) {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const rawId = segments[segments.length - 2];
  const id = Number(rawId);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function buildDefaultChecklistRows(tipo: string) {
  const isInspection = String(tipo || "").toLowerCase() === "inspecao";
  return [
    { phase: "pre", label: "Confirmar dados da OT e ativo" },
    { phase: "pre", label: "Validar condições de segurança" },
    { phase: "intervencao", label: isInspection ? "Executar checklist de inspeção da jangada" : "Executar procedimento técnico principal" },
    { phase: "intervencao", label: "Registar materiais/consumos" },
    { phase: "validacao", label: "Validar resultado final" },
    { phase: "validacao", label: "Confirmar documentação e evidências" },
  ];
}

// POST /api/pedidos-assistencia/[id]/converter
// Converte um pedido de assistência numa Ordem de Serviço (ADMIN/USER).
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: getAuthSecret() });
    if (!token?.sub && !token?.email) {
      return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    }
    const access = await getAccessContext();
    if (!access) {
      return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    }
    const tokenRole = String(token?.role || "USER");
    const role = tokenRole === "ADMIN" ? "ADMIN" : tokenRole === "CLIENTE" ? "CLIENTE" : "USER";
    if (role === "CLIENTE") {
      return NextResponse.json({ error: "Apenas utilizadores internos." }, { status: 403 });
    }

    const id = parseIdFromRequest(req);
    if (!id) {
      return NextResponse.json({ error: "ID inválido." }, { status: 400 });
    }

    const pedido = await prisma.pedidoAssistencia.findUnique({ where: { id } });
    if (!pedido) {
      return NextResponse.json({ error: "Pedido de assistência não encontrado." }, { status: 404 });
    }

    const existing = await prisma.ordemServico.findFirst({
      where: { pedidoAssistenciaId: pedido.id },
      select: { id: true, numeroOrdem: true, status: true },
      orderBy: { id: "desc" },
    });
    if (existing) {
      return NextResponse.json({
        ok: false,
        jaExistente: true,
        ordem: existing,
        pedidoEstado: pedido.estado,
      });
    }

    const serial = String(pedido.jangadaSerial || "").trim();
    if (!serial) {
      return NextResponse.json(
        { error: "O pedido não tem serial de jangada. Preenche o serial no pedido para poder criar a OT." },
        { status: 400 },
      );
    }

    const jangada = await prisma.jangada.findFirst({
      where: { serial: { equals: serial } },
      select: { id: true, serial: true, brand: true, model: true },
    });
    if (!jangada) {
      return NextResponse.json(
        { error: `Não foi encontrada nenhuma jangada com o serial "${serial}". Verifica o serial ou cria a OT manualmente.` },
        { status: 400 },
      );
    }

    const jangadaContext = await resolveOrderJangadasContext([jangada.id]);
    const shipId = jangadaContext.shipId;
    const clienteId = shipId
      ? await resolveClienteIdForShipId(shipId)
      : await resolveClienteIdForJangada(jangada.id);

    const dataPlaneadaInicio = pedido.dataPreferida ? parseFlexibleDate(pedido.dataPreferida) : null;
    const numeroOrdem = await generateOSNumeroOrdem(dataPlaneadaInicio || new Date());
    const status = normalizeOrdemStatus("pendente");
    const tipo = normalizeOrdemTipo("inspecao");
    const prioridade = normalizeOrdemPrioridade("normal");
    const workflowStatus = resolveWorkflowStatus({
      meta: {},
      orderStatus: status,
    }) || mapOrderStatusToWorkflowStatus(status) || "orcamento_em_preparacao";

    const descricaoParts = [
      pedido.tipoAssistencia ? `Tipo: ${pedido.tipoAssistencia}` : "",
      pedido.navio ? `Navio: ${pedido.navio}` : "",
      pedido.descricao || "",
    ].filter(Boolean);

    const baseMeta = {
      origem: "pedido_assistencia",
      shipId: shipId ?? undefined,
      shipName: jangadaContext.shipName ?? undefined,
      observacao: `Pedido de assistência #${pedido.id}${pedido.dataPreferida ? ` — data preferida: ${pedido.dataPreferida}` : ""}`,
    };

    const metaWithLog = appendOrdemServicoLog(appendWorkflowTransition(baseMeta, workflowStatus, {
      origin: "pedido_assistencia",
      message: `OT criada a partir do pedido de assistência #${pedido.id} (workflow inicial ${workflowStatus}).`,
      user: access.email || "sistema",
    }), {
      type: "CREATE",
      message: `OT criada a partir do pedido de assistência #${pedido.id} para a jangada ${jangada.serial}.`,
      user: access.email || "sistema",
    });

    const created = await prisma.$transaction(async (tx) => {
      const order = await tx.ordemServico.create({
        data: {
          numeroOrdem,
          serviceStationId: jangadaContext.serviceStationId,
          jangadaId: jangada.id,
          shipId,
          clienteId,
          pedidoAssistenciaId: pedido.id,
          tipo,
          prioridade,
          status,
          descricao: descricaoParts.join("\n") || null,
          dataPlaneadaInicio,
          durationMinutes: 210,
          metadados: toOrdemServicoMetaJson(metaWithLog),
        },
      });

      await tx.ordemServicoJangada.create({
        data: { ordemServicoId: order.id, jangadaId: jangada.id },
      });

      await tx.ordemServicoChecklistItem.createMany({
        data: buildDefaultChecklistRows(tipo).map((item) => ({
          ordemServicoId: order.id,
          phase: item.phase,
          label: item.label,
          done: false,
        })),
      });

      await tx.ordemServicoLog.create({
        data: {
          ordemServicoId: order.id,
          type: "CREATE",
          message: `OT criada a partir do pedido de assistência #${pedido.id} (${jangada.serial}).`,
          user: access.email || "sistema",
        },
      });

      await tx.jangada.updateMany({
        where: { id: jangada.id },
        data: { numeroObra: numeroOrdem },
      });

      if (pedido.estado === "novo" || pedido.estado === "concluido") {
        await tx.pedidoAssistencia.update({
          where: { id: pedido.id },
          data: { estado: "em_atendimento" },
        });
      }

      return order;
    });

    await logAuditoria({
      tabela: "OrdemServico",
      tipoOperacao: "CREATE",
      idRegisto: created.id,
      descricao: `OT ${numeroOrdem} criada a partir do pedido de assistência #${pedido.id}`,
      dadosDepois: created,
    });

    return NextResponse.json({
      ok: true,
      ordem: {
        id: created.id,
        numeroOrdem: created.numeroOrdem,
        status: created.status,
        jangadaSerial: jangada.serial,
      },
      pedidoEstado: "em_atendimento",
    }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/pedidos-assistencia/[id]/converter]", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Erro ao converter pedido em OT.", detail }, { status: 500 });
  }
}
