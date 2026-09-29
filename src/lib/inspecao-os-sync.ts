import prisma from "@/lib/prisma";
import { logAuditoria } from "@/lib/auditoria";
import { getIvaRate } from "@/lib/iva";
import {
  appendOrdemServicoLog,
  appendWorkflowTransition,
  generateOSNumeroOrdem,
  toOrdemServicoMetaJson,
  resolveClienteIdForJangada,
  resolveClienteIdForShipId,
  type OrdemServicoMeta,
} from "@/lib/ordens-servico";

export type SyncReplacementItem = {
  name: string;
  referencia?: string | null;
  quantidade?: number | null;
  stockId?: number | null;
  precoUnitario?: number | null;
};

export type SyncOrcamentoPayload = {
  linhas?: Array<{
    id?: string;
    stockId?: number | string | null;
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
  const stockRefs = artigosSubstituidos
    .map((a) => a.referencia)
    .filter(Boolean) as string[];
  const stockItems =
    stockRefs.length > 0
      ? await prisma.stock.findMany({
          where: { referencia: { in: stockRefs } },
          select: {
            id: true,
            referencia: true,
            descricao: true,
            precoVenda: true,
            quantidade: true,
          },
        })
      : [];
  const stockMap = new Map(stockItems.map((s) => [s.referencia, s]));

  return artigosSubstituidos.map((item) => {
    const stock = item.referencia ? stockMap.get(item.referencia) : null;
    return {
      id: `inspection-${inspecao.certificadoNumero}-${item.referencia || item.name}`,
      stockId: item.stockId || stock?.id || undefined,
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
  });
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

  const hasFailedTests = testesReprovados.length > 0;
  const hasReplacements = artigosSubstituidos.length > 0;

  // Verificar se já existe uma OS criada por esta mesma inspeção (idempotência)
  const duplicateOS = await prisma.ordemServico.findFirst({
    where: {
      inspecaoId,
      status: { notIn: ["concluida", "cancelada"] },
    },
    select: { id: true, numeroOrdem: true },
  });
  if (duplicateOS) {
    return {
      synced: false,
      action: "skipped" as const,
      message: `Já existe a OT ${duplicateOS.numeroOrdem} associada a esta inspeção.`,
      ordemServicoId: duplicateOS.id,
    };
  }

  // De-dup por jangada ativa: impedir criar uma nova OT enquanto existir uma OT ativa
  // (pendente/em_progresso) para a mesma jangada. Reparações (testes reprovados)
  // geram sempre OT própria para não perder a sequência de trabalho.
  if (!hasFailedTests) {
    const activeJangadaOrders = await prisma.ordemServico.findMany({
      where: {
        jangadaId,
        inspecaoId: { not: inspecaoId },
        status: { in: ["pendente", "em_progresso"] },
      },
      select: { id: true, numeroOrdem: true, orcamentoStatus: true, inspecaoId: true },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 1,
    });
    if (activeJangadaOrders[0]) {
      const active = activeJangadaOrders[0];
      // Reaproveitar a OT ativa associando-a a esta inspeção (quando ainda não tem nenhuma)
      if (!active.inspecaoId) {
        await prisma.ordemServico.update({
          where: { id: active.id },
          data: { inspecaoId },
        });
      }
      return {
        synced: false,
        action: "reusing" as const,
        message: `Já existe a OT ativa ${active.numeroOrdem} para esta jangada. Reutilizada em vez de criar duplicada.`,
        ordemServicoId: active.id,
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
  let valorMaoObra = 0;
  let valorDesconto = 0;
  let isIsentoIva = false;

  if (orcamento) {
    inspectionMaterials = (orcamento.linhas || []).map((linha, index) => {
      const stockIdNum = linha.stockId != null && linha.stockId !== "" ? Number(linha.stockId) : null;
      return {
        id: linha.id || `orcamento-${index}`,
        stockId: Number.isFinite(stockIdNum ?? NaN) ? (stockIdNum ?? undefined) : undefined,
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
    });
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

  const aprovacaoStatus = orcamento?.aprovacaoWhatsApp?.status || null;

  const tipo = hasFailedTests ? "reparacao" : hasReplacements ? "manutencao" : "inspecao";
  const prioridade = hasFailedTests ? "critica" : hasReplacements ? "alta" : "normal";
  const durationMinutes = hasFailedTests ? 240 : hasReplacements ? 210 : 180;

  const created = await prisma.$transaction(async (tx) => {
    const baseMeta = {
      grupoNumeroOrdem: numeroOrdem,
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
        numeroOrdem,
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
        orcamentoStatus:
          orcamento && input.isFinalSave && orcamento.usarOrcamento
            ? orcamento.aprovacaoWhatsApp
              ? aprovacaoStatus === "aprovado"
                ? "Aprovado"
                : "Rascunho"
              : "Emitido"
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
    if (jangada.serviceStationId) {
      const existingQueue = await tx.serviceStationQueue.findFirst({
        where: { jangadaId, ordemServicoId: order.id },
      });
      if (!existingQueue) {
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
    descricao: `OT ${numeroOrdem} criada a partir da inspeção ${inspecao.certificadoNumero}. Testes reprovados: ${testesReprovados.length}. Artigos substituídos: ${artigosSubstituidos.length}.`,
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
            where: { jangadaId, referencia: ref },
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