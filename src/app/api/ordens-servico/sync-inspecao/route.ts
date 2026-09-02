import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logAuditoria } from "@/lib/auditoria";
import { getIvaRate } from "@/lib/iva";
import { z } from "zod";
import {
  appendOrdemServicoLog,
  appendWorkflowTransition,
  generateOSNumeroOrdem,
  toOrdemServicoMetaJson,
  resolveClienteIdForJangada,
  type OrdemServicoMeta,
} from "@/lib/ordens-servico";

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

type SyncInspectionPayload = {
  inspecaoId: number;
  jangadaId: number;
  testesReprovados: string[];
  artigosSubstituidos: Array<{
    name: string;
    referencia?: string | null;
    quantidade?: number;
    stockId?: number | null;
    precoUnitario?: number;
  }>;
  autoCreateOS?: boolean;
  isFinalSave?: boolean;
  orcamento?: {
    linhas?: Array<{
      id?: string;
      stockId?: number | string | null;
      referencia?: string | null;
      descricao?: string | null;
      quantidade?: number | null;
      precoUnitario?: number | null;
    }>;
    valorMaoObra?: number;
    valorDesconto?: number;
    isIsentoIva?: boolean;
    usarOrcamento?: boolean;
    aprovacaoWhatsApp?: {
      status?: string;
      telefoneCliente?: string;
      mensagem?: string;
      enviadoEm?: string;
      respondidoEm?: string;
      alteracoesPedidas?: string;
      validadeDias?: number;
    } | null;
  } | null;
};

const syncInspectionSchema = z
  .object({
    inspecaoId: z.number().or(z.string()),
    jangadaId: z.number().or(z.string()),
    testesReprovados: z.array(z.string()).default([]),
    artigosSubstituidos: z
      .array(
        z.object({
          name: z.string().default(""),
          referencia: z.string().nullable().optional(),
          quantidade: z.number().nullable().optional(),
          stockId: z.number().nullable().optional(),
          precoUnitario: z.number().nullable().optional(),
        }),
      )
      .default([]),
    autoCreateOS: z.boolean().optional(),
    isFinalSave: z.boolean().optional(),
    orcamento: z
      .object({
        linhas: z.array(z.record(z.string(), z.any())).optional(),
        valorMaoObra: z.number().optional(),
        valorDesconto: z.number().optional(),
        isIsentoIva: z.boolean().optional(),
        usarOrcamento: z.boolean().optional(),
        aprovacaoWhatsApp: z
          .object({
            status: z.string().optional(),
            telefoneCliente: z.string().optional(),
            mensagem: z.string().optional(),
            enviadoEm: z.string().optional(),
            respondidoEm: z.string().optional(),
            alteracoesPedidas: z.string().optional(),
            validadeDias: z.number().optional(),
          })
          .nullable()
          .optional(),
      })
      .nullable()
      .optional(),
  })
  .passthrough();

const TEST_LABELS: Record<string, string> = {
  testeWP: "Ensaio de Pressão (WP)",
  testeNAP: "Ensaio de Pressão Adicional (NAP)",
  testeFS: "Teste de Flutuação e Stowage (FS)",
  testeGI: "Teste de Inflação (GI)",
  testeDL: "Teste de Deploy/Lançamento (DL)",
};

async function buildMaterialsFromReplacements(
  jangadaId: number,
  inspecao: { certificadoNumero: string },
  artigosSubstituidos: SyncInspectionPayload["artigosSubstituidos"],
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

export async function POST(req: NextRequest) {
  try {
    const access = await import("@/lib/access-control").then((m) =>
      m.getAccessContext(),
    );
    if (!access) {
      return NextResponse.json(
        { error: "Sessão obrigatória." },
        { status: 401 },
      );
    }

    const rawBody = await req.json().catch(() => ({}));
    const parsedBody = syncInspectionSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      const details = parsedBody.error.issues
        .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
        .join("; ");
      return NextResponse.json(
        { error: `Payload inválido: ${details}` },
        { status: 400 },
      );
    }
    const body = parsedBody.data as unknown as SyncInspectionPayload;
    const inspecaoId = Number(body.inspecaoId);
    const jangadaId = Number(body.jangadaId);
    const testesReprovados = Array.isArray(body.testesReprovados)
      ? body.testesReprovados
      : [];
    const artigosSubstituidos = Array.isArray(body.artigosSubstituidos)
      ? body.artigosSubstituidos
      : [];
    const orcamento =
      body.orcamento &&
      Array.isArray(body.orcamento.linhas) &&
      body.orcamento.linhas.length > 0
        ? body.orcamento
        : null;

    if (!Number.isFinite(inspecaoId) || inspecaoId <= 0) {
      return NextResponse.json(
        { error: "inspecaoId inválido." },
        { status: 400 },
      );
    }
    if (!Number.isFinite(jangadaId) || jangadaId <= 0) {
      return NextResponse.json(
        { error: "jangadaId inválido." },
        { status: 400 },
      );
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
      return NextResponse.json(
        { error: "Inspeção não encontrada." },
        { status: 404 },
      );
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
      return NextResponse.json(
        { error: "Jangada não encontrada." },
        { status: 404 },
      );
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
      return NextResponse.json({
        synced: false,
        action: "skipped",
        message: `Já existe a OT ${duplicateOS.numeroOrdem} associada a esta inspeção.`,
        ordemServicoId: duplicateOS.id,
      });
    }

    const referenceDate = inspecao.dataInspecao
      ? new Date(inspecao.dataInspecao)
      : new Date();
    const numeroOrdem = await generateOSNumeroOrdem(referenceDate);
    const shipId = jangada.shipId;
    const clienteId = shipId
      ? await import("@/lib/ordens-servico").then((m) =>
          m.resolveClienteIdForShipId(shipId),
        )
      : await resolveClienteIdForJangada(jangadaId);

    const testesLabel = testesReprovados.length > 0
      ? testesReprovados.map((t) => TEST_LABELS[t] || t).join(", ")
      : "Todos aprovados";

    const descricaoOS = [
      `Inspeção ${inspecao.certificadoNumero} (${inspecao.dataInspecao})`,
      hasFailedTests ? `Testes reprovados: ${testesLabel}` : `Testes: ${testesLabel}`,
      hasReplacements
        ? `${artigosSubstituidos.length} artigo(s) substituído(s)`
        : null,
    ]
      .filter(Boolean)
      .join(" | ");

    let inspectionMaterials: SyncMaterial[] = [];
    let valorMaoObra = 0;
    let valorDesconto = 0;
    let isIsentoIva = false;

    if (orcamento) {
      inspectionMaterials = (orcamento.linhas || []).map((linha, index) => {
        const stockIdNum =
          linha.stockId != null && linha.stockId !== ""
            ? Number(linha.stockId)
            : null;
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
      valorMaoObra = 0;
      valorDesconto = Number(orcamento.valorDesconto) || 0;
      isIsentoIva = Boolean(orcamento.isIsentoIva);
    } else {
      inspectionMaterials = await buildMaterialsFromReplacements(
        jangadaId,
        inspecao,
        artigosSubstituidos,
      );
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
        shipId: jangada!.shipId ?? undefined,
        shipName: jangada!.shipNameManual || undefined,
        materials: inspectionMaterials as OrdemServicoMeta['materials'],
        inspecaoSync: {
          certificadoNumero: inspecao!.certificadoNumero,
          dataInspecao: inspecao!.dataInspecao,
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
            message: `OT criada a partir da inspeção ${inspecao!.certificadoNumero}. ${hasFailedTests ? `Testes reprovados: ${testesLabel}.` : `Resultado: ${testesLabel}.`}`,
            user: "sistema",
          },
        ),
        {
          type: "CREATE_FROM_INSPECAO",
          message: `OT criada a partir da inspeção ${inspecao!.certificadoNumero}.`,
          user: "sistema",
        },
      );

      const order = await tx.ordemServico.create({
        data: {
          numeroOrdem,
          serviceStationId: jangada!.serviceStationId,
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
          orcamentoStatus: orcamento && body.isFinalSave && orcamento.usarOrcamento
            ? (orcamento.aprovacaoWhatsApp
                ? (aprovacaoStatus === "aprovado" ? "Aprovado" : "Rascunho")
                : "Emitido")
            : "Rascunho",
          metadados: toOrdemServicoMetaJson(metaWithLog),
        },
      });

      const logEntries: Array<{ type: string; message: string; user: string }> =
        [
          {
            type: "CREATE_FROM_INSPECAO",
            message: `OT criada automaticamente a partir da inspeção ${inspecao!.certificadoNumero}.`,
            user: "sistema",
          },
        ];

      for (const teste of testesReprovados) {
        logEntries.push({
          type: "INSPECAO_REPROVACAO",
          message: `${TEST_LABELS[teste] || teste}: REPROVOU na inspeção ${inspecao!.certificadoNumero}.`,
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

      const checklistItems = [
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
      descricao: `OT ${numeroOrdem} criada a partir da inspeção ${inspecao!.certificadoNumero}. Testes reprovados: ${testesReprovados.length}. Artigos substituídos: ${artigosSubstituidos.length}.`,
    });

    // Sincronização bidirecional: artigos substituídos na inspeção → jangada
    if (artigosSubstituidos.length > 0) {
      try {
        const artigoJangadaDelegate = prisma.artigoJangada;
        if (artigoJangadaDelegate) {
          for (const artigo of artigosSubstituidos) {
            const nome = String(artigo.name || "").trim();
            if (!nome) continue;

            const ref = artigo.referencia?.trim() || null;
            const qty = Math.max(1, Number(artigo.quantidade) || 1);

            if (ref) {
              const existente = await artigoJangadaDelegate.findFirst({
                where: { jangadaId, referencia: ref },
                select: { id: true, quantidade: true },
              });
              if (existente) {
                await artigoJangadaDelegate.update({
                  where: { id: existente.id },
                  data: {
                    quantidade: existente.quantidade + qty,
                    updatedAt: new Date(),
                  },
                });
                continue;
              }
            }

            await artigoJangadaDelegate.create({
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
        }
      } catch (syncErr) {
        console.error("Erro ao sincronizar artigos substituídos com a jangada:", syncErr);
      }
    }

    return NextResponse.json(
      {
        synced: true,
        action: "created",
        ordemServicoId: created.id,
        numeroOrdem: created.numeroOrdem,
        testesReprovados: testesReprovados.length,
        artigosAdicionados: inspectionMaterials.length,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Erro na sincronização inspeção→OS:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao sincronizar inspeção com ordem de serviço.",
      },
      { status: 500 },
    );
  }
}
