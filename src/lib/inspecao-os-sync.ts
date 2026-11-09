import prisma from "@/lib/prisma";
import { logAuditoria } from "@/lib/auditoria";
import { getIvaRate } from "@/lib/iva";
import { canonicalOrderNumber, syncOrderNumber } from '@/lib/order-number';
import {
  appendOrdemServicoLog,
  appendWorkflowTransition,
  generateOSNumeroOrdem,
  toOrdemServicoMetaJson,
  resolveClienteIdForJangada,
  resolveClienteIdForShipId,
  resolveLotStock,
  type OrdemServicoMeta,
} from "@/lib/ordens-servico";

export type SyncReplacementItem = {
  name: string;
  referencia?: string | null;
  quantidade?: number | null;
  stockId?: number | null;
  lote?: string | null;
  precoUnitario?: number | null;
};

export type SyncOrcamentoPayload = {
  linhas?: Array<{
    id?: string;
    stockId?: number | string | null;
    lote?: string | null;
    referencia?: string | null;
    descricao?: string | null;
    quantidade?: number | null;
    precoUnitario?: number | null;
    total?: number | null;
    source?: string | null;
  }>;
  valorMaoObra?: number | null;
  valorDesconto?: number | null;
  isIsentoIva?: boolean | null;
  usarOrcamento?: boolean | null;
  removedIds?: string[] | null;
  aprovacaoWhatsApp?: {
    status?: string | null;
    telefoneCliente?: string | null;
    mensagem?: string | null;
    enviadoEm?: string | null;
    respondidoEm?: string | null;
    alteracoesPedidas?: string | null;
    validadeDias?: number | null;
  } | null;
};

export type SyncInspectionToOSInput = {
  inspecaoId: number;
  jangadaId: number;
  testesReprovados: string[];
  artigosSubstituidos: SyncReplacementItem[];
  isFinalSave?: boolean;
  autoCreateOS?: boolean;
  orcamento?: SyncOrcamentoPayload | null;
  skipArtigosSync?: boolean;
};

export type SyncInspectionToOSResult = {
  synced: boolean;
  action: "created" | "skipped" | "reusing";
  message?: string;
  ordemServicoId?: number;
  numeroOrdem?: string;
  testesReprovados?: number;
  artigosAdicionados?: number;
};

const TEST_LABELS: Record<string, string> = {
  testeWP: "Ensaio de Pressão (WP)",
  testeNAP: "Ensaio de Pressão Adicional (NAP)",
  testeFS: "Teste de Flutuação e Stowage (FS)",
  testeGI: "Teste de Inflação (GI)",
  testeDL: "Teste de Deploy/Lançamento (DL)",
};

type SyncMaterial = {
  id?: string;
  stockId?: number;
  lote?: string | null;
  referencia?: string;
  descricao?: string;
  quantidadePrevista?: number;
  quantidadeUsada?: number;
  precoUnitario?: number;
  disponibilidade?: number;
  reservado?: boolean;
  consumido?: boolean;
  origem?: string;
};

async function buildMaterialsFromReplacements(
  jangadaId: number,
  inspecao: { certificadoNumero: string },
  artigosSubstituidos: SyncReplacementItem[],
) {
  const raft = await prisma.jangada.findUnique({ where: { id: jangadaId }, select: { serviceStationId: true } });
  return Promise.all(artigosSubstituidos.map(async (item, index) => {
    const stock = await resolveLotStock(prisma, item, raft?.serviceStationId ?? null, true);
    return {
      id: `inspection-${inspecao.certificadoNumero}-${item.stockId || item.referencia || item.name}-${index}`,
      stockId: item.stockId || stock?.id || undefined,
      lote: item.lote ?? stock?.lote ?? null,
      referencia: item.referencia || "SEM-REF",
      descricao: item.name || stock?.descricao || "Consumível inspeção",
      quantidadePrevista: item.quantidade || 1,
      quantidadeUsada: item.quantidade || 1,
      precoUnitario: item.precoUnitario ?? stock?.precoVenda ?? 0,
      disponibilidade: stock?.quantidade ?? 0,
      reservado: false,
      consumido: true,
      origem: "inspecao" as const,
    };
  }));
}

function calcValorTotal(
  materials: SyncMaterial[],
  valorMaoObra: number,
  valorDesconto: number,
  isIsentoIva: boolean,
) {
  const valorPecas = materials.reduce(
    (acc: number, item: SyncMaterial) =>
      acc +
      Math.max(0, Number(item.quantidadeUsada ?? item.quantidadePrevista ?? 0)) *
        Math.max(0, Number(item.precoUnitario || 0)),
    0,
  );
  const subtotal = Math.max(0, valorPecas + (valorMaoObra || 0) - (valorDesconto || 0));
  const iva = isIsentoIva ? 0 : subtotal * getIvaRate();
  return { valorPecas, valorTotal: Math.round((subtotal + iva) * 100) / 100 };
}

/**
 * Cria/liga a Ordem de Serviço a partir de uma inspeção finalizada.
 *
 * Chamada diretamente no servidor (na server action da checklist e na route
 * /api/ordens-servico/sync-inspecao). Regista TUDO mesmo quando o orçamento
 * não está aprovado (orcamentoStatus fica "Rascunho"/"Emitido" e a OT "pendente"),
 * permitindo concluir a inspeção, emitir certificado e entregar a jangada.
 */
export async function syncInspectionToOrdemServico(
  input: SyncInspectionToOSInput,
): Promise<SyncInspectionToOSResult> {
  const inspecaoId = Number(input.inspecaoId);
  const jangadaId = Number(input.jangadaId);
  const testesReprovados = Array.isArray(input.testesReprovados)
    ? input.testesReprovados
    : [];
  const artigosSubstituidos = Array.isArray(input.artigosSubstituidos)
    ? input.artigosSubstituidos
    : [];
  const orcamento =
    input.orcamento &&
    Array.isArray(input.orcamento.linhas) &&
    input.orcamento.linhas.length > 0
      ? input.orcamento
      : null;

  if (!Number.isFinite(inspecaoId) || inspecaoId <= 0) {
    throw new Error("inspecaoId inválido.");
  }
  if (!Number.isFinite(jangadaId) || jangadaId <= 0) {
    throw new Error("jangadaId inválido.");
  }

  const inspecao = await prisma.inspecao.findUnique({
    where: { id: inspecaoId },
    select: {
      id: true,
      certificadoNumero: true,
      dataInspecao: true,
      navioNome: true,
      jangadaId: true,
      checklistSnapshot: true,
    },
  });
  if (!inspecao) {
    throw new Error("Inspeção não encontrada.");
  }

  const jangada = await prisma.jangada.findUnique({
    where: { id: jangadaId },
    select: {
      id: true,
      serial: true,
      brand: true,
      model: true,
      owner: true,
      shipId: true,
      shipNameManual: true,
      serviceStationId: true,
    },
  });
  if (!jangada) {
    throw new Error("Jangada não encontrada.");
  }
  const savedLots = (inspecao.checklistSnapshot as { _articleExpiry?: { replacements?: SyncReplacementItem[] } } | null)?._articleExpiry?.replacements || [];
  for (const item of artigosSubstituidos) {
    item.lote = item.lote ?? savedLots.find(row => row.stockId === item.stockId)?.lote;
  }
  if (inspecao.jangadaId !== jangadaId) throw new Error("Inspecao e jangada incompatíveis.");

  const hasFailedTests = testesReprovados.length > 0;
  const hasReplacements = artigosSubstituidos.length > 0;

  // Verificar se já existe uma OS criada por esta mesma inspeção (idempotência)
  const duplicateOS = await prisma.ordemServico.findFirst({
    where: {
      inspecaoId,
      jangadaId,
      serviceStationId: jangada.serviceStationId,
      status: { notIn: ["concluida", "cancelada"] },
    },
    select: { id: true, numeroOrdem: true },
  });
  if (duplicateOS) {
    const number = await prisma.$transaction(tx => syncOrderNumber(tx, duplicateOS.id));
    return {
      synced: false,
      action: "skipped" as const,
      message: `Já existe a OT ${duplicateOS.numeroOrdem} associada a esta inspeção.`,
      ordemServicoId: duplicateOS.id,
      numeroOrdem: number.numeroOrdem,
    };
  }

  // De-dup por jangada ativa: impedir criar uma nova OT enquanto existir uma OT ativa
  // (pendente/em_progresso) para a mesma jangada. Reparações (testes reprovados)
  // geram sempre OT própria para não perder a sequência de trabalho.
  if (!hasFailedTests) {
    const activeJangadaOrders = await prisma.ordemServico.findMany({
      where: {
        jangadaId,
        inspecaoId: null,
        serviceStationId: jangada.serviceStationId,
        status: { in: ["pendente", "em_progresso"] },
      },
      select: { id: true, numeroOrdem: true, orcamentoStatus: true, inspecaoId: true },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 1,
    });
    if (activeJangadaOrders[0]) {
      const active = activeJangadaOrders[0];
      let reusedNumber = active.numeroOrdem;
      // Reaproveitar a OT ativa associando-a a esta inspeção (quando ainda não tem nenhuma)
      if (!active.inspecaoId) {
        const result = await prisma.$transaction(async tx => {
          await tx.ordemServico.update({ where: { id: active.id, inspecaoId: null }, data: { inspecaoId } });
          return syncOrderNumber(tx, active.id);
        });
        reusedNumber = result.numeroOrdem;
      }
      return {
        synced: false,
        action: "reusing" as const,
        message: `Já existe a OT ativa ${active.numeroOrdem} para esta jangada. Reutilizada em vez de criar duplicada.`,
        ordemServicoId: active.id,
        numeroOrdem: reusedNumber,
      };
    }
  }

  const referenceDate = inspecao.dataInspecao ? new Date(inspecao.dataInspecao) : new Date();
  const numeroOrdem = await generateOSNumeroOrdem(referenceDate);
  const shipId = jangada.shipId;
  const clienteId = shipId
    ? await resolveClienteIdForShipId(shipId)
    : await resolveClienteIdForJangada(jangadaId);

  const testesLabel =
    testesReprovados.length > 0
      ? testesReprovados.map((t) => TEST_LABELS[t] || t).join(", ")
      : "Todos aprovados";

  const descricaoOS = [
    `Inspeção ${inspecao.certificadoNumero} (${inspecao.dataInspecao})`,
    hasFailedTests ? `Testes reprovados: ${testesLabel}` : `Testes: ${testesLabel}`,
    hasReplacements ? `${artigosSubstituidos.length} artigo(s) substituído(s)` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  let inspectionMaterials: SyncMaterial[] = [];
  const valorMaoObra = 0;
  let valorDesconto = 0;
  let isIsentoIva = false;

  if (orcamento) {
    inspectionMaterials = await Promise.all((orcamento.linhas || []).map(async (linha, index) => {
      const stock = await resolveLotStock(prisma, linha, jangada.serviceStationId, true);
      const stockIdNum = linha.stockId != null && linha.stockId !== "" ? Number(linha.stockId) : null;
      return {
        id: linha.id || `orcamento-${index}`,
        stockId: Number.isFinite(stockIdNum ?? NaN) ? (stockIdNum ?? undefined) : stock?.id,
        lote: linha.lote ?? savedLots.find(row => row.stockId === stockIdNum)?.lote ?? stock?.lote ?? null,
        referencia: linha.referencia || "SEM-REF",
        descricao: linha.descricao || "Artigo",
        quantidadePrevista: Number(linha.quantidade) || 0,
        quantidadeUsada: Number(linha.quantidade) || 0,
        precoUnitario: Number(linha.precoUnitario) || 0,
        disponibilidade: 0,
        reservado: false,
        consumido: true,
        origem: "orcamento" as const,
      };
    }));
    valorDesconto = Number(orcamento.valorDesconto) || 0;
    isIsentoIva = Boolean(orcamento.isIsentoIva);
  } else {
    inspectionMaterials = await buildMaterialsFromReplacements(jangadaId, inspecao, artigosSubstituidos);
  }

  const { valorPecas, valorTotal } = calcValorTotal(
    inspectionMaterials,
    valorMaoObra,
    valorDesconto,
    isIsentoIva,
  );

  // A decisão/submissão pode vir mesmo sem linhas construídas no cliente (ex.: técnico
  // que só regista os artigos substituídos e envia para a ordem). Nesse caso o orçamento
  // é derivado dos artigos substituídos e o estado de submissão vem do próprio payload.
  const aprovacaoStatus = input.orcamento?.aprovacaoWhatsApp?.status || null;

  const tipo = hasFailedTests ? "reparacao" : hasReplacements ? "manutencao" : "inspecao";
  const prioridade = hasFailedTests ? "critica" : hasReplacements ? "alta" : "normal";
  const durationMinutes = hasFailedTests ? 240 : hasReplacements ? 210 : 180;

  const created = await prisma.$transaction(async (tx) => {
    const canonicalNumber = await canonicalOrderNumber(tx, { numeroOrdem, inspecaoId, jangadaId, shipId, serviceStationId: jangada.serviceStationId });
    const baseMeta = {
      grupoNumeroOrdem: canonicalNumber,
      origem: "auto_sync_inspecao",
      shipId: jangada.shipId ?? undefined,
      shipName: jangada.shipNameManual || undefined,
      materials: inspectionMaterials as OrdemServicoMeta['materials'],
      inspecaoSync: {
        certificadoNumero: inspecao.certificadoNumero,
        dataInspecao: inspecao.dataInspecao,
        testesReprovados,
        artigosSubstituidosCount: artigosSubstituidos.length,
        syncedAt: new Date().toISOString(),
      },
    } as OrdemServicoMeta;

    const metaWithLog = appendOrdemServicoLog(
      appendWorkflowTransition(
        baseMeta,
        "orcamento_em_preparacao",
        {
          origin: "inspection_sync",
          message: `OT criada a partir da inspeção ${inspecao.certificadoNumero}. ${hasFailedTests ? `Testes reprovados: ${testesLabel}.` : `Resultado: ${testesLabel}.`}`,
          user: "sistema",
        },
      ),
      {
        type: "CREATE_FROM_INSPECAO",
        message: `OT criada a partir da inspeção ${inspecao.certificadoNumero}.`,
        user: "sistema",
      },
    );

    const order = await tx.ordemServico.create({
      data: {
        numeroOrdem: canonicalNumber,
        serviceStationId: jangada.serviceStationId,
        jangadaId,
        shipId,
        clienteId,
        inspecaoId,
        tipo,
        prioridade,
        status: "pendente",
        descricao: descricaoOS,
        durationMinutes,
        valorPecas,
        valorMaoObra,
        valorDesconto,
        isIsentoIva,
        valorTotal,
        // A aprovação acontece no módulo de Orçamentos: a inspeção submete o
        // orçamento para análise ("Enviado"); decisão prévia só se existir.
        // Técnicos (role USER) enviam os artigos sem construir linhas — o
        // orçamento é então derivado dos artigos substituídos, mas a submissão
        // (usarOrcamento + estado "enviado") continua a marcar a OT como Enviado.
        orcamentoStatus:
          input.isFinalSave && Boolean(input.orcamento?.usarOrcamento)
            ? aprovacaoStatus === "aprovado"
              ? "Aprovado"
              : aprovacaoStatus === "rejeitado"
                ? "Rejeitado"
                : "Enviado"
            : "Rascunho",
        metadados: toOrdemServicoMetaJson(metaWithLog),
      },
    });

    const logEntries: Array<{ type: string; message: string; user: string }> = [
      {
        type: "CREATE_FROM_INSPECAO",
        message: `OT criada automaticamente a partir da inspeção ${inspecao.certificadoNumero}.`,
        user: "sistema",
      },
    ];

    for (const teste of testesReprovados) {
      logEntries.push({
        type: "INSPECAO_REPROVACAO",
        message: `${TEST_LABELS[teste] || teste}: REPROVOU na inspeção ${inspecao.certificadoNumero}.`,
        user: "sistema",
      });
    }

    if (hasReplacements) {
      logEntries.push({
        type: "INSPECAO_SUBSTITUICAO",
        message: `${artigosSubstituidos.length} artigo(s) substituído(s): ${artigosSubstituidos.map((a) => a.name).join(", ")}.`,
        user: "sistema",
      });
    }

    await tx.ordemServicoLog.createMany({
      data: logEntries.map((entry) => ({
        ordemServicoId: order.id,
        type: entry.type,
        message: entry.message,
        user: entry.user,
      })),
    });

    const checklistItems: Array<{ ordemServicoId: number; phase: string; label: string }> = [
      { ordemServicoId: order.id, phase: "pre", label: "Confirmar dados da OT e ativo" },
      { ordemServicoId: order.id, phase: "pre", label: "Validar condições de segurança" },
    ];

    if (hasFailedTests) {
      for (const teste of testesReprovados) {
        checklistItems.push({
          ordemServicoId: order.id,
          phase: "intervencao",
          label: `Repetir/Corrigir: ${TEST_LABELS[teste] || teste}`,
        });
      }
    } else {
      checklistItems.push({
        ordemServicoId: order.id,
        phase: "intervencao",
        label: tipo === "inspecao" ? "Confirmar resultado da inspeção" : "Executar procedimento técnico",
      });
    }

    checklistItems.push(
      { ordemServicoId: order.id, phase: "intervencao", label: "Registar materiais/consumos" },
      { ordemServicoId: order.id, phase: "validacao", label: "Validar resultado final" },
      { ordemServicoId: order.id, phase: "validacao", label: "Confirmar documentação e evidências" },
    );

    await tx.ordemServicoChecklistItem.createMany({
      data: checklistItems.map((item) => ({ ...item, done: false })),
    });

    // Criar entrada na fila da estação de serviço se associada
    // Criar entrada na fila da estação de serviço se associada
    if (jangada.serviceStationId) {
      const candidateRows = await tx.serviceStationQueue.findMany({
        where: { jangadaId },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      });
      const activeRow = (row: (typeof candidateRows)[number]) => {
        try {
          const meta = JSON.parse(row.observacoes || "{}");
          return !(meta && typeof meta === "object" && (meta as { deliveredAt?: unknown }).deliveredAt);
        } catch {
          return true;
        }
      };
      const existingQueue =
        candidateRows.find((row) => row.ordemServicoId === order.id) ||
        candidateRows.find((row) => activeRow(row));

      if (existingQueue) {
        if (!existingQueue.ordemServicoId) {
          await tx.serviceStationQueue.update({
            where: { id: existingQueue.id },
            data: { ordemServicoId: order.id },
          });
        }
      } else {
        await tx.serviceStationQueue.create({
          data: {
            serviceStationId: jangada.serviceStationId,
            jangadaId,
            ordemServicoId: order.id,
            status: "Aguardando",
            observacoes: JSON.stringify({ origem: "sync_inspecao", certificado: inspecao.certificadoNumero }),
          },
        });
      }
    }

    return order;
  });

  await logAuditoria({
    tabela: "OrdemServico",
    tipoOperacao: "CREATE",
    idRegisto: created.id,
    descricao: `OT ${created.numeroOrdem} criada a partir da inspeção ${inspecao.certificadoNumero}. Testes reprovados: ${testesReprovados.length}. Artigos substituídos: ${artigosSubstituidos.length}.`,
  });

  // Sincronização bidirecional: artigos substituídos na inspeção → jangada
  if (artigosSubstituidos.length > 0 && !input.skipArtigosSync) {
    try {
      for (const artigo of artigosSubstituidos) {
        const nome = String(artigo.name || "").trim();
        if (!nome) continue;

        const ref = artigo.referencia?.trim() || null;
        const qty = Math.max(1, Number(artigo.quantidade) || 1);

        if (ref) {
          const existente = await prisma.artigoJangada.findFirst({
            where: { jangadaId, inspecaoId: null, referencia: ref, stockId: artigo.stockId || null },
            select: { id: true, quantidade: true },
          });
          if (existente) {
            await prisma.artigoJangada.update({
              where: { id: existente.id },
              data: {
                quantidade: existente.quantidade + qty,
                updatedAt: new Date(),
              },
            });
            continue;
          }
        }

        await prisma.artigoJangada.create({
          data: {
            jangadaId,
            name: nome,
            quantidade: qty,
            referencia: ref,
            stockId: artigo.stockId || null,
            updatedAt: new Date(),
          },
        });
      }
    } catch (syncErr) {
      console.error("Erro ao sincronizar artigos substituídos com a jangada:", syncErr);
    }
  }

  return {
    synced: true,
    action: "created" as const,
    ordemServicoId: created.id,
    numeroOrdem: created.numeroOrdem,
    testesReprovados: testesReprovados.length,
    artigosAdicionados: inspectionMaterials.length,
  };
}
