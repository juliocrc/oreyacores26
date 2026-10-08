import { NextRequest, NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import { getApiSessionToken } from "@/lib/api-auth";
import { logAuditoria } from "@/lib/auditoria";
import prisma from "@/lib/prisma";
import { parseFlexibleDate, syncAssistenciaAgendaEvent } from "@/lib/agenda-sync";
import { APP_CONFIG } from "@/lib/app-config";
import { registarComunicacaoManual } from "@/lib/communications";
import { resolvePedidoAssistenciaJangadaTargets } from "@/lib/pedido-assistencia";
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

const QUEUE_ACTIVE_STATUSES = ["aguardar", "agendada", "progresso", "a_secar", "finalizada"];

function normalizeStationText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

async function isAcoresStation(serviceStationId: number | null) {
  if (!serviceStationId || serviceStationId <= 0) return false;

  const station = await prisma.serviceStation.findUnique({
    where: { id: serviceStationId },
    select: { codigo: true, nome: true },
  });

  if (!station) return false;

  const code = normalizeStationText(station.codigo);
  const name = normalizeStationText(station.nome);
  return code === "acores" || name === "acores";
}

function queueRowEntregue(row: { status: string; observacoes: string | null }) {
  if (String(row.status || "").trim().toLowerCase() !== "finalizada") return false;
  try {
    const meta = JSON.parse(String(row.observacoes || "{}")) as Record<string, unknown>;
    return Boolean(meta?.deliveredAt);
  } catch {
    return false;
  }
}

function parseAssistenciaTecnico(metadados: string | null): string {
  try {
    const meta = JSON.parse(String(metadados || "{}")) as Record<string, unknown>;
    if (meta && typeof meta === "object") {
      for (const key of ["tecnico", "responsavel", "tecnicoResponsavel", "Técnico", "Tecnico"]) {
        const value = String(meta[key] ?? "").trim();
        if (value && value !== "null" && value !== "undefined") return value;
      }
    }
  } catch {
    // ignorado: metadados podem ser legacy ou texto livre
  }
  return "";
}

// POST /api/pedidos-assistencia/[id]/converter
// Converte um pedido de assistência numa Ordem de Serviço (ADMIN/USER).
export async function POST(req: NextRequest) {
  try {
    const token = await getApiSessionToken(req);
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

    const targets = resolvePedidoAssistenciaJangadaTargets({
      jangadaSerial: pedido.jangadaSerial,
      metadados: pedido.metadados,
    });

    if (targets.length === 0) {
      return NextResponse.json(
        { error: "O pedido não tem nenhuma jangada associada para converter em OT." },
        { status: 400 },
      );
    }

    const jangadas = await Promise.all(
      targets.map(async (target) => {
        if (typeof target.id === "number" && Number.isFinite(target.id) && target.id > 0) {
          return prisma.jangada.findUnique({
            where: { id: target.id },
            select: { id: true, serial: true, brand: true, model: true, shipId: true },
          });
        }

        if (target.serial) {
          return prisma.jangada.findFirst({
            where: { serial: { equals: target.serial } },
            select: { id: true, serial: true, brand: true, model: true, shipId: true },
          });
        }

        return null;
      }),
    );

    const uniqueJangadas = Array.from(
      new Map(jangadas.filter(Boolean).map((jangada) => [jangada!.id, jangada!])).values(),
    );

    if (uniqueJangadas.length === 0) {
      return NextResponse.json(
        { error: "Não foi encontrada nenhuma jangada válida associada ao pedido." },
        { status: 400 },
      );
    }

    const existingOrders = await prisma.ordemServico.findMany({
      where: { pedidoAssistenciaId: pedido.id },
      select: { id: true, numeroOrdem: true, status: true },
      orderBy: { id: "desc" },
    });

    if (existingOrders.length > 0) {
      return NextResponse.json({
        ok: false,
        jaExistente: true,
        ordem: existingOrders[0],
        ordens: existingOrders,
        pedidoEstado: pedido.estado,
      });
    }

    const createdOrders: Array<{ id: number; numeroOrdem: string; status: string; jangadaSerial: string }> = [];
    const syncItems: Array<{
      orderId: number;
      numeroOrdem: string;
      jangadaId: number;
      jangadaSerial: string;
      serviceStationId: number | null;
      shipName: string | null;
      baseMeta: ReturnType<typeof appendOrdemServicoLog>;
    }> = [];

    await prisma.$transaction(async (tx) => {
      for (const jangada of uniqueJangadas) {
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

        createdOrders.push({
          id: order.id,
          numeroOrdem: order.numeroOrdem,
          status: order.status,
          jangadaSerial: jangada.serial,
        });

        syncItems.push({
          orderId: order.id,
          numeroOrdem: order.numeroOrdem,
          jangadaId: jangada.id,
          jangadaSerial: jangada.serial,
          serviceStationId: jangadaContext.serviceStationId ?? null,
          shipName: jangadaContext.shipName ?? null,
          baseMeta: metaWithLog,
        });
      }

      if (pedido.estado === "novo" || pedido.estado === "concluido") {
        await tx.pedidoAssistencia.update({
          where: { id: pedido.id },
          data: { estado: "em_atendimento" },
        });
      }
    });

    const primaryOrder = createdOrders[0];
    if (primaryOrder) {
      await logAuditoria({
        tabela: "OrdemServico",
        tipoOperacao: "CREATE",
        idRegisto: primaryOrder.id,
        descricao: `OT ${primaryOrder.numeroOrdem} criada a partir do pedido de assistência #${pedido.id}`,
        dadosDepois: primaryOrder,
      });
    }

    const tecnicoAssistencia = parseAssistenciaTecnico(pedido.metadados);
    const dataPlaneadaInicio = pedido.dataPreferida ? parseFlexibleDate(pedido.dataPreferida) : null;

    for (const entry of syncItems) {
      try {
        let orderMeta = entry.baseMeta;
        const syncNotes: string[] = [];

      if (entry.jangadaSerial) {
        try {
          const agendaResult = await syncAssistenciaAgendaEvent({
            raftSerial: entry.jangadaSerial,
            date: dataPlaneadaInicio || new Date(),
            title: `Assistência — ${entry.shipName || entry.jangadaSerial}`,
            responsavel: tecnicoAssistencia || null,
            serviceStationId: entry.serviceStationId,
          });
          if (agendaResult) {
            orderMeta = { ...orderMeta, agendaEventId: agendaResult.id };
            if (agendaResult.vacationDropped) {
              syncNotes.push(
                `Técnico responsável (${tecnicoAssistencia}) está de férias na data preferida; evento criado sem responsável.`,
              );
            }
          }
        } catch (agendaError) {
          syncNotes.push(
            `Não foi possível sincronizar a agenda: ${agendaError instanceof Error ? agendaError.message : String(agendaError)}`,
          );
        }
      }

      const stationId = entry.serviceStationId || access.stationId || access.allowedStationIds[0] || null;
      if (stationId) {
        const aguardarAllowed = APP_CONFIG.theme === "deluxe" ? true : await isAcoresStation(stationId);
        if (aguardarAllowed) {
          const existingQueue = await prisma.serviceStationQueue.findFirst({
            where: { jangadaId: entry.jangadaId, status: { in: QUEUE_ACTIVE_STATUSES } },
            orderBy: { id: "desc" },
          });

          if (existingQueue && !queueRowEntregue(existingQueue)) {
            if (!existingQueue.ordemServicoId) {
              await prisma.serviceStationQueue.update({
                where: { id: existingQueue.id },
                data: { ordemServicoId: entry.orderId },
              });
            }
            orderMeta = { ...orderMeta, queueId: existingQueue.id };
            syncNotes.push(
              `Jangada já estava rececionada na estação (fila #${existingQueue.id}); ligada à OT ${entry.numeroOrdem}.`,
            );
          } else {
            const queueMeta = appendWorkflowTransition({
              tecnico: tecnicoAssistencia || undefined,
              observacao: `Rececionada automaticamente a partir do pedido de assistência #${pedido.id}.`,
              arrivedViaForwarder: false,
              readyForDelivery: false,
            }, "entrada_estacao", {
              origin: "pedido_assistencia",
              message: `Rececionada automaticamente a partir do pedido de assistência #${pedido.id} (OT ${entry.numeroOrdem}).`,
              user: access.email || "sistema",
            });
            const createdQueue = await prisma.serviceStationQueue.create({
              data: {
                jangadaId: entry.jangadaId,
                ordemServicoId: entry.orderId,
                serviceStationId: stationId,
                status: "aguardar",
                observacoes: toOrdemServicoMetaJson(queueMeta),
              },
            });
            orderMeta = { ...orderMeta, queueId: createdQueue.id };
            await prisma.jangada
              .update({ where: { id: entry.jangadaId }, data: { serviceStationId: stationId } })
              .catch(() => {});
            syncNotes.push(`Jangada rececionada na estação de serviço (fila #${createdQueue.id}).`);
          }
        } else {
          syncNotes.push("Receção automática na estação indisponível (fluxo da estação dos Açores neste tema).");
        }
      }

      if (orderMeta !== entry.baseMeta) {
        await prisma.ordemServico.update({
          where: { id: entry.orderId },
          data: { metadados: toOrdemServicoMetaJson(orderMeta) },
        });
      }

      if (syncNotes.length > 0) {
        await prisma.ordemServicoLog.create({
          data: {
            ordemServicoId: entry.orderId,
            type: "SYNC",
            message: `Sincronização de assistência (#${pedido.id}): ${syncNotes.join(" ")}`,
            user: access.email || "sistema",
          },
        });
      }
      } catch (syncError) {
        console.error("[POST /api/pedidos-assistencia/[id]/converter] Sincronização de assistência falhou:", syncError);
        await prisma.ordemServicoLog
          .create({
            data: {
              ordemServicoId: entry.orderId,
              type: "ERROR",
              message: `Falha na sincronização de assistência (#${pedido.id}): ${syncError instanceof Error ? syncError.message : String(syncError)}`,
              user: access.email || "sistema",
            },
          })
          .catch(() => {});
      }
    }

    // Registo automático de comunicação (sem envio) para o pedido convertido.
    const telefoneAssistencia = String(pedido.telefone || "").trim();
    if (telefoneAssistencia) {
      const mensagemAviso = [
        `Pedido de assistência #${pedido.id} convertido em ${primaryOrder ? `OT ${primaryOrder.numeroOrdem}` : "Ordem de Serviço"}.`,
        "Entraremos em contacto para agendar a data da intervenção.",
        "Orey Azores",
      ].join("\n");
      await registarComunicacaoManual({
        tipo: "WHATSAPP",
        canal: "wa.me",
        destinatario: telefoneAssistencia,
        mensagem: mensagemAviso,
        status: "pendente",
        ref: { refTipo: "PedidoAssistencia", refId: pedido.id },
        enviadoPor: access.email || "sistema",
      }).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      ordem: primaryOrder,
      ordens: createdOrders,
      pedidoEstado: "em_atendimento",
    }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/pedidos-assistencia/[id]/converter]", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Erro ao converter pedido em OT.", detail }, { status: 500 });
  }
}
