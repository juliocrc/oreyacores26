"use server";

import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { logAuditoria } from "@/lib/auditoria";
import { parseOrdemServicoMeta, toOrdemServicoMetaJson } from "@/lib/ordens-servico";
import { toCanonicalDateStr } from "@/lib/date-display";
import { getIvaRate } from "@/lib/iva";
import { stampInspectionWithDigest } from "@/lib/integrity-stamp";

type SaveInspectionReplacementItem = {
  stockId?: number | null;
  referencia?: string | null;
  descricao?: string | null;
  quantidade?: number | null;
  motivo?: string | null;
  precoUnitario?: number | null;
  validade?: string | null;
  codigoFabricante?: string | null;
};

type SaveInspectionPayload = {
  id?: string | number;
  shipId?: string | number | null;
  raftId?: string | number | null;
  coleteId?: string | number | null;
  navioNome?: string | null;
  jangadaSerial?: string | null;
  coleteSerial?: string | null;
  date?: string | null;
  dataProxInspecao?: string | null;
  status?: string | null;
  responsavel?: string | null;
  certificadoNumero?: string | null;
  sourceFile?: string | null;
  checklistSnapshot?: Record<string, string | number | boolean>;
  artigosSubstituidos?: SaveInspectionReplacementItem[];
  applyStockMovements?: boolean | null;
  signatureBase64?: string | null;
  clienteAssinaturaBase64?: string | null;
  clienteNomeAssinatura?: string | null;
  guiaTransporteUrl?: string | null;
  testeWP?: string | null;
  testeFS?: string | null;
  testeNAP?: string | null;
  testeGI?: string | null;
  testeDL?: string | null;
  cylinderDataTeste?: string | null;
  cylinderSerial?: string | null;
  numeroObra?: string | null;
  orcamento?: {
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
  } | null;
};

function buildInspectionCertificatePrefix(referenceDate?: string | Date | null) {
  const fallbackYear = new Date().getFullYear();
  const parsed = referenceDate instanceof Date
    ? referenceDate
    : (referenceDate ? new Date(referenceDate) : new Date());

  const resolvedYear = Number.isNaN(parsed.getTime()) ? fallbackYear : parsed.getFullYear();
  return `AZ${String(resolvedYear).slice(-2)}`.toUpperCase();
}

function parseInspectionCertificateSequence(value: unknown, prefix: string) {
  const normalizedValue = String(value || "").trim().toUpperCase();
  const match = normalizedValue.match(/^([A-Z]{2}\d{2})-(\d{3})$/);
  if (!match) return null;
  if (match[1] !== prefix) return null;
  return Number(match[2]);
}

export async function generateInspectionCertificateNumber(referenceDate?: string | Date | null) {
  const prefix = buildInspectionCertificatePrefix(referenceDate);

  const [existingInspections, existingRafts] = await Promise.all([
    prisma.inspecao.findMany({
      where: { certificadoNumero: { startsWith: `${prefix}-` } },
      select: { certificadoNumero: true },
    }),
    prisma.jangada.findMany({
      where: { ultimoCertificadoNumero: { startsWith: `${prefix}-` } },
      select: { ultimoCertificadoNumero: true },
    }),
  ]);

  const maxSequence = [...existingInspections, ...existingRafts].reduce((max, row) => {
    const candidate = 'certificadoNumero' in row ? row.certificadoNumero : row.ultimoCertificadoNumero;
    const parsed = parseInspectionCertificateSequence(candidate, prefix);
    if (!Number.isFinite(parsed)) return max;
    return Math.max(max, Number(parsed));
  }, 0);

  return `${prefix}-${String(maxSequence + 1).padStart(3, "0")}`;
}

function normalizeMonthYearToDate(value: unknown): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const mmYyyy = raw.match(/^(\d{1,2})\/(\d{4})$/);
  if (mmYyyy) {
    const month = Number(mmYyyy[1]);
    const year = Number(mmYyyy[2]);
    if (month >= 1 && month <= 12) return new Date(`${year}-${String(month).padStart(2, "0")}-01`);
  }

  return null;
}

function normalizeReplacements(input: unknown) {
  if (!Array.isArray(input)) return [] as Array<{
    stockId: number | null;
    referencia: string | null;
    codigoFabricante: string | null;
    name: string;
    quantidade: number;
    validade: Date | null;
    motivo: string | null;
  }>;

  return input
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as any;
      const name = String(row.descricao || row.name || row.referencia || "Artigo").trim();
      const referencia = String(row.referencia || "").trim() || null;
      const codigoFabricante = String(row.codigoFabricante || "").trim() || null;
      const quantidade = Math.max(1, Number(row.quantidade || 1));
      if (!name) return null;
      return {
        stockId: Number.isFinite(Number(row.stockId)) && Number(row.stockId) > 0 ? Number(row.stockId) : null,
        referencia,
        codigoFabricante,
        name,
        quantidade,
        validade: normalizeMonthYearToDate(row.validade),
        motivo: String(row.motivo || "").trim() || null,
      };
    })
    .filter((row): row is {
      stockId: number | null;
      referencia: string | null;
      codigoFabricante: string | null;
      name: string;
      quantidade: number;
      validade: Date | null;
      motivo: string | null;
    } => Boolean(row));
}

async function normalizeCertificadoNumero(payload: SaveInspectionPayload) {
  const explicit = String(payload.certificadoNumero || "").trim();
  if (explicit) return explicit;
  return generateInspectionCertificateNumber(payload.date || null);
}

export async function saveInspection(payload: SaveInspectionPayload) {
  const navioNome = String(payload.navioNome || "").trim();
  const jangadaSerial = String(payload.jangadaSerial || "").trim();
  const coleteSerial = String(payload.coleteSerial || "").trim();
  const dataInspecao = toCanonicalDateStr(String(payload.date || "").trim()) || "";
  const dataProxInspecao = toCanonicalDateStr(String(payload.dataProxInspecao || "").trim()) || null;
  const applyStockMovements = payload.applyStockMovements === true;

  if (!dataInspecao) {
    throw new Error("Data da inspeção é obrigatória.");
  }

  const inspectionId = Number(payload.id);
  const navioId = Number(payload.shipId);
  const jangadaId = Number(payload.raftId);
  const coleteId = Number(payload.coleteId);

  const replacements = normalizeReplacements(payload.artigosSubstituidos).map((item) => ({
    ...item,
    validade: toCanonicalDateStr(item.validade instanceof Date ? item.validade.toISOString().slice(0, 10) : item.validade ?? undefined) || null,
  }));

  const resolvedJangadaId = (() => {
    if (Number.isFinite(jangadaId) && jangadaId > 0) return Number(jangadaId);
    return null;
  })();
  
  const resolvedColeteId = (() => {
    if (Number.isFinite(coleteId) && coleteId > 0) return Number(coleteId);
    return null;
  })();

  const jangadaBySerial = !resolvedJangadaId && jangadaSerial
    ? (await prisma.$queryRaw<Array<{ id: number }>>`
        SELECT id FROM "Jangada"
        WHERE LOWER("serial") = LOWER(${jangadaSerial})
        LIMIT 1
      `)[0] || null
    : null;
    
  const coleteBySerial = !resolvedColeteId && coleteSerial
    ? (await prisma.$queryRaw<Array<{ id: number }>>`
        SELECT id FROM "Colete"
        WHERE LOWER("serial") = LOWER(${coleteSerial})
        LIMIT 1
      `)[0] || null
    : null;

  const finalJangadaId = resolvedJangadaId || jangadaBySerial?.id || null;
  const finalColeteId = resolvedColeteId || coleteBySerial?.id || null;
  const existingInspection = Number.isFinite(inspectionId) && inspectionId > 0
    ? await prisma.inspecao.findUnique({ where: { id: inspectionId }, select: { id: true, certificadoNumero: true } })
    : null;
  const certificadoNumero = await normalizeCertificadoNumero({
    ...payload,
    certificadoNumero: payload.certificadoNumero ?? existingInspection?.certificadoNumero,
  });

  if (certificadoNumero) {
    const duplicateCondition = existingInspection ? Prisma.sql`AND id != ${existingInspection.id}` : Prisma.empty;
    const raftDuplicateCondition = finalJangadaId ? Prisma.sql`AND id != ${finalJangadaId}` : Prisma.empty;
    const [duplicate, raftDuplicate] = await Promise.all([
      prisma.$queryRaw<Array<{ id: number; jangadaId: number | null; jangadaSerial: string | null }>>`
        SELECT id, "jangadaId", "jangadaSerial" FROM "Inspecao"
        WHERE LOWER("certificadoNumero") = LOWER(${certificadoNumero})
        ${duplicateCondition}
        LIMIT 1`,
      prisma.$queryRaw<Array<{ id: number; serial: string | null }>>`
        SELECT id, serial FROM "Jangada"
        WHERE LOWER("ultimoCertificadoNumero") = LOWER(${certificadoNumero})
        ${raftDuplicateCondition}
        LIMIT 1`,
    ]);
    if (duplicate[0]) {
      const alvo = duplicate[0].jangadaSerial ? ` (jangada ${duplicate[0].jangadaSerial})` : duplicate[0].jangadaId ? ` (jangada id ${duplicate[0].jangadaId})` : "";
      throw new Error(`O nǧmero de certificado ${certificadoNumero} jǭ foi utilizado noutra inspeǜo${alvo}.`);
    }
    if (raftDuplicate[0]) {
      throw new Error(`O nǧmero de certificado ${certificadoNumero} jǭ estǭ associado  jangada ${raftDuplicate[0].serial || raftDuplicate[0].id}.`);
    }
  }

  const stockWarnings: string[] = [];

  const saved = await prisma.$transaction(async (tx) => {
    let resolvedStrapRef: string | null = null;
    let strapQuantity = 0;
    let strapDescription = "";
    let oldRaft: any = null;

    if (finalJangadaId) {
      oldRaft = await tx.jangada.findUnique({
        where: { id: finalJangadaId },
        include: { artigos: true }
      });
      const jangada = oldRaft;

      if (jangada) {
        const { normalizarPackType } = require("@/config/packTemplates");
        const normalizedPack = normalizarPackType(jangada.packType || '');
        if (normalizedPack === 'SOLAS B') {
          const filteredReplacements = replacements.filter(item => {
            const nome = String(item.name || '').trim().toLowerCase();
            const isWater = nome === 'water' || nome === 'drinking water' || nome.includes('água') || nome.includes('agua') || (item.referencia && item.referencia.toLowerCase().includes('water'));
            return !isWater;
          });
          replacements.length = 0;
          replacements.push(...filteredReplacements);
        }

        const isValise = (
          String(jangada.containerModel || '').toLowerCase().includes('valise') ||
          String(jangada.containerModel || '').toLowerCase().includes('bag') ||
          String(jangada.containerModel || '').toLowerCase().includes('saco')
        );

        if (!isValise) {
          const { getContainerClosureMatchBundle } = require("@/modules/rafts/containerClosureStraps");
          const bundle = getContainerClosureMatchBundle({
            brand: jangada.brand,
            model: jangada.model,
            containerModel: jangada.containerModel,
            capacity: jangada.capacity,
            launchType: jangada.launchType,
            packType: jangada.packType,
            maxStowageHeight: jangada.maxStowageHeight,
          });

          if (bundle.exactMatches && bundle.exactMatches.length > 0) {
            const match = bundle.exactMatches[0];
            resolvedStrapRef = String(match.stockReference || '').split('/')[0].trim();
            strapQuantity = match.strapQuantity || 1;
            strapDescription = match.description || "Cinta de Fecho";
          }
        }
      }
    }

    if (resolvedStrapRef) {
      const exists = replacements.some(r => r.referencia === resolvedStrapRef);
      if (!exists) {
        const strapStock = await tx.stock.findFirst({
          where: { referencia: resolvedStrapRef },
          select: { id: true, descricao: true }
        });

        replacements.push({
          stockId: strapStock?.id || null,
          referencia: resolvedStrapRef,
          name: strapStock?.descricao || strapDescription,
          quantidade: strapQuantity,
          motivo: `Cinta de fecho substituída automaticamente`,
          codigoFabricante: null,
          validade: null
        });
      }
    }

    const getField = (key: string) => {
      if (payload.checklistSnapshot && payload.checklistSnapshot[key] !== undefined) {
        return String(payload.checklistSnapshot[key] || "");
      }
      if ((payload as any)[key] !== undefined) {
        return String((payload as any)[key] || "");
      }
      return oldRaft ? String((oldRaft as any)[key] || "") : null;
    };

    const inspectionData = {
      certificadoNumero,
      navioNome,
      navioId: Number.isFinite(navioId) && navioId > 0 ? navioId : null,
      jangadaId: finalJangadaId,
      jangadaSerial,
      coleteId: finalColeteId,
      coleteSerial,
      dataInspecao,
      dataProxInspecao,
      status: String(payload.status || "Concluída").trim() || "Concluída",
      sourceFile: String(payload.sourceFile || "checklist_quadro").trim() || "checklist_quadro",
      signatureBase64: payload.signatureBase64 || null,
      clienteAssinaturaBase64: payload.clienteAssinaturaBase64 || null,
      clienteNomeAssinatura: payload.clienteNomeAssinatura || null,
      guiaTransporteUrl: payload.guiaTransporteUrl || null,

      numeroObra: getField("numeroObra"),
      testeWP: getField("testeWP"),
      testeNAP: getField("testeNAP"),
      testeFS: getField("testeFS"),
      testeGI: getField("testeGI"),
      testeDL: getField("testeDL"),
      testeWPUnidadePressao: getField("testeWPUnidadePressao"),
      testeWPInstrumento: getField("testeWPInstrumento"),
      testeWPHoraInicio: getField("testeWPHoraInicio"),
      testeWPHoraFim: getField("testeWPHoraFim"),
      testeWPTemperaturaInicial: getField("testeWPTemperaturaInicial"),
      testeWPTemperaturaFinal: getField("testeWPTemperaturaFinal"),
      testeWPPressaoAtmosfericaInicial: getField("testeWPPressaoAtmosfericaInicial"),
      testeWPPressaoAtmosfericaFinal: getField("testeWPPressaoAtmosfericaFinal"),
      testeWPCamaraSuperiorInicio: getField("testeWPCamaraSuperiorInicio"),
      testeWPCamaraSuperiorFim: getField("testeWPCamaraSuperiorFim"),
      testeWPCamaraSuperiorQueda: getField("testeWPCamaraSuperiorQueda"),
      testeWPCamaraInferiorInicio: getField("testeWPCamaraInferiorInicio"),
      testeWPCamaraInferiorFim: getField("testeWPCamaraInferiorFim"),
      testeWPCamaraInferiorQueda: getField("testeWPCamaraInferiorQueda"),
      oficinaTemperatura: getField("oficinaTemperatura"),
      oficinaHumidade: getField("oficinaHumidade"),

      orcamento: payload.orcamento || Prisma.DbNull,
    };

    const inspecao = existingInspection
      ? await tx.inspecao.update({
          where: { id: existingInspection.id },
          data: {
            ...inspectionData,
            updatedAt: new Date(),
          },
        })
      : await tx.inspecao.upsert({
          where: { certificadoNumero },
          create: inspectionData,
          update: {
            ...inspectionData,
            updatedAt: new Date(),
          },
        });

    if (finalJangadaId && oldRaft) {
      // 1. Archive the previous inspection if oldRaft has an inspection certificate that is not yet in the Inspecao table
      if (oldRaft.ultimoCertificadoNumero && oldRaft.dataInspecao) {
        const existsPrevious = await tx.inspecao.findFirst({
          where: { certificadoNumero: oldRaft.ultimoCertificadoNumero }
        });

        if (!existsPrevious) {
          const archivedInsp = await tx.inspecao.create({
            data: {
              certificadoNumero: oldRaft.ultimoCertificadoNumero,
              navioNome: oldRaft.shipNameManual || "Sem Navio",
              navioId: oldRaft.shipId,
              jangadaId: oldRaft.id,
              jangadaSerial: oldRaft.serial,
              dataInspecao: oldRaft.dataInspecao,
              dataProxInspecao: oldRaft.dataProxInspecao,
              status: "Concluída",
              sourceFile: "checklist_quadro_historico",
              
              numeroObra: oldRaft.numeroObra,
              testeWP: oldRaft.testeWP,
              testeNAP: oldRaft.testeNAP,
              testeFS: oldRaft.testeFS,
              testeGI: oldRaft.testeGI,
              testeDL: oldRaft.testeDL,
              testeWPUnidadePressao: oldRaft.testeWPUnidadePressao,
              testeWPInstrumento: oldRaft.testeWPInstrumento,
              testeWPHoraInicio: oldRaft.testeWPHoraInicio,
              testeWPHoraFim: oldRaft.testeWPHoraFim,
              testeWPTemperaturaInicial: oldRaft.testeWPTemperaturaInicial,
              testeWPTemperaturaFinal: oldRaft.testeWPTemperaturaFinal,
              testeWPPressaoAtmosfericaInicial: oldRaft.testeWPPressaoAtmosfericaInicial,
              testeWPPressaoAtmosfericaFinal: oldRaft.testeWPPressaoAtmosfericaFinal,
              testeWPCamaraSuperiorInicio: oldRaft.testeWPCamaraSuperiorInicio,
              testeWPCamaraSuperiorFim: oldRaft.testeWPCamaraSuperiorFim,
              testeWPCamaraSuperiorQueda: oldRaft.testeWPCamaraSuperiorQueda,
              testeWPCamaraInferiorInicio: oldRaft.testeWPCamaraInferiorInicio,
              testeWPCamaraInferiorFim: oldRaft.testeWPCamaraInferiorFim,
              testeWPCamaraInferiorQueda: oldRaft.testeWPCamaraInferiorQueda,
              oficinaTemperatura: oldRaft.oficinaTemperatura,
              oficinaHumidade: oldRaft.oficinaHumidade,
            }
          });

          // Link all current active articles (inspecaoId: null) to this newly archived inspection record
          await tx.artigoJangada.updateMany({
            where: {
              jangadaId: oldRaft.id,
              inspecaoId: null
            },
            data: {
              inspecaoId: archivedInsp.id
            }
          });

          // Also archive the snapshot of the old liferaft state directly from memory
          const { writeInspectionSnapshot } = require("@/lib/inspection-snapshots");
          await writeInspectionSnapshot(oldRaft.ultimoCertificadoNumero, oldRaft);
        }
      }

      // 2. Update the main Jangada record (dossier) with the new inspection details
      const updateRaftData: any = {
        dataInspecao,
        dataProxInspecao,
        ultimoCertificadoNumero: certificadoNumero,
        numeroObra: getField("numeroObra") || payload.numeroObra || null,
        updatedAt: new Date(),
      };

      if (payload.cylinderSerial !== undefined) updateRaftData.cylinderSerial = payload.cylinderSerial;
      if (payload.cylinderDataTeste !== undefined) updateRaftData.cylinderDataTeste = toCanonicalDateStr(payload.cylinderDataTeste) ?? payload.cylinderDataTeste;
      if (payload.testeFS !== undefined) updateRaftData.testeFS = payload.testeFS;
      if (payload.testeNAP !== undefined) updateRaftData.testeNAP = payload.testeNAP;
      if (payload.testeGI !== undefined) updateRaftData.testeGI = payload.testeGI;
      if (payload.testeDL !== undefined) updateRaftData.testeDL = payload.testeDL;
      if (payload.signatureBase64 !== undefined) updateRaftData.signatureBase64 = payload.signatureBase64;

      if (payload.checklistSnapshot) {
        const snap = payload.checklistSnapshot;
        const mappings: Record<string, string> = {
          hruReferencia: "hruReferencia",
          hruDataInstalacao: "hruDataInstalacao",
          hruValidade: "hruValidade",
          radarReflector: "radarReflector",
          radarReflectorValidade: "radarReflectorValidade",
          cylinderSerial: "cylinderSerial",
          cylinderTara: "cylinderTara",
          cylinderPesoBruto: "cylinderPesoBruto",
          cylinderCo2: "cylinderCo2",
          cylinderN2: "cylinderN2",
          cylinderDataTeste: "cylinderDataTeste",
          cylinderDataProxTeste: "cylinderDataProxTeste",
          cylinderSistema: "cylinderSistema",
          valvulasAlivio: "valvulasAlivio",
          valvulasAtestar: "valvulasAtestar",
          
          testeWP: "testeWP",
          testeNAP: "testeNAP",
          testeFS: "testeFS",
          testeGI: "testeGI",
          testeDL: "testeDL",
          
          testeTemperaturaCamaraSuperior: "testeTemperaturaCamaraSuperior",
          testeTemperaturaCamaraInferior: "testeTemperaturaCamaraInferior",
          testePressaoCamaraSuperior: "testePressaoCamaraSuperior",
          testePressaoCamaraInferior: "testePressaoCamaraInferior",
          testeWPUnidadePressao: "testeWPUnidadePressao",
          testeWPInstrumento: "testeWPInstrumento",
          testeWPHoraInicio: "testeWPHoraInicio",
          testeWPHoraFim: "testeWPHoraFim",
          testeWPTemperaturaInicial: "testeWPTemperaturaInicial",
          testeWPTemperaturaFinal: "testeWPTemperaturaFinal",
          testeWPPressaoAtmosfericaInicial: "testeWPPressaoAtmosfericaInicial",
          testeWPPressaoAtmosfericaFinal: "testeWPPressaoAtmosfericaFinal",
          testeWPCamaraSuperiorInicio: "testeWPCamaraSuperiorInicio",
          testeWPCamaraSuperiorFim: "testeWPCamaraSuperiorFim",
          testeWPCamaraSuperiorQueda: "testeWPCamaraSuperiorQueda",
          testeWPCamaraInferiorInicio: "testeWPCamaraInferiorInicio",
          testeWPCamaraInferiorFim: "testeWPCamaraInferiorFim",
          testeWPCamaraInferiorQueda: "testeWPCamaraInferiorQueda",
          
          oficinaTemperatura: "oficinaTemperatura",
          oficinaHumidade: "oficinaHumidade"
        };

        const DATE_SNAPSHOT_KEYS = new Set([
          "hruDataInstalacao",
          "hruValidade",
          "radarReflectorValidade",
          "cylinderDataTeste",
          "cylinderDataProxTeste",
        ]);

        for (const [snapKey, dbKey] of Object.entries(mappings)) {
          if (snap[snapKey] !== undefined && snap[snapKey] !== null) {
            const rawValue = String(snap[snapKey]);
            updateRaftData[dbKey] = DATE_SNAPSHOT_KEYS.has(dbKey)
              ? toCanonicalDateStr(rawValue) ?? rawValue
              : rawValue;
          }
        }
      }

      await tx.jangada.update({
        where: { id: finalJangadaId },
        data: updateRaftData,
      });
    }

    // Só substituir/apagar os artigos históricos da inspeção quando a checklist
    // fornece explicitamente uma nova lista de artigos substituídos. Em re-gravações
    // sem `artigosSubstituidos` (ex.: editar apenas a data/estado), preserva-se o
    // histórico, evitando que os artigos desapareçam do histórico técnico.
    const hasExplicitArtigosSubstituidos = Array.isArray(payload.artigosSubstituidos);
    if (hasExplicitArtigosSubstituidos) {
      await tx.artigoJangada.deleteMany({ where: { inspecaoId: inspecao.id } });
    }

    const stockWarnings: string[] = [];
    const usarOrcamento = Boolean(payload.orcamento?.usarOrcamento);
    const hasExplicitOrcamento = !!payload.orcamento && Array.isArray(payload.orcamento.linhas) && payload.orcamento.linhas.length > 0;

    if (applyStockMovements) {
      if (hasExplicitOrcamento && usarOrcamento) {
        // Reservar stock a partir das linhas do orçamento em vez de deduzir diretamente
        const budgetLines = (payload.orcamento?.linhas || []).filter((linha) => {
          const sid = linha.stockId != null && linha.stockId !== "" ? Number(linha.stockId) : null;
          if (!Number.isFinite(sid ?? NaN) || (sid ?? 0) <= 0) return false;
          const ref = String(linha.referencia || "");
          if (/^L-/.test(ref)) return false;
          return true;
        });

        for (const linha of budgetLines) {
          const stockId = Number(linha.stockId);
          const qty = Math.max(1, Number(linha.quantidade) || 1);
          const stock = await tx.stock.findUnique({
            where: { id: stockId },
            select: { id: true, quantidade: true, quantidadeReservada: true, quantidadeMinima: true, referencia: true, descricao: true },
          });
          if (!stock) continue;

          const quantidadeReservadaAtual = stock.quantidadeReservada || 0;
          const disponivelAntes = stock.quantidade - quantidadeReservadaAtual;

          if (disponivelAntes < qty) {
            stockWarnings.push(`Stock insuficiente para reserva de ${stock.referencia || linha.referencia || stock.descricao}: disponível ${disponivelAntes}, pedido ${qty}.`);
          }

          const novaQuantidadeReservada = quantidadeReservadaAtual + qty;
          const novoDisponivel = stock.quantidade - novaQuantidadeReservada;

          // Alerta de stock mínimo (#6)
          if (stock.quantidadeMinima != null && novoDisponivel <= stock.quantidadeMinima) {
            stockWarnings.push(`Alerta stock mínimo: ${stock.referencia || stock.descricao} fica com ${novoDisponivel} disponível (mínimo ${stock.quantidadeMinima}).`);
          }

          await tx.stock.update({
            where: { id: stockId },
            data: { quantidadeReservada: novaQuantidadeReservada },
          });

          await tx.movimentacaoStock.create({
            data: {
              stockId,
              tipo: "reserva",
              quantidade: qty,
              quantidadeAntes: quantidadeReservadaAtual,
              quantidadeDepois: novaQuantidadeReservada,
              motivo: `Reserva por orçamento ${certificadoNumero}`,
              usuario: String(payload.responsavel || "operador"),
              inspecaoId: inspecao.id,
            },
          });
        }
      } else {
        for (const item of replacements) {
          if (!item.stockId) continue;

          const stock = await tx.stock.findUnique({
            where: { id: item.stockId },
            select: { id: true, quantidade: true, referencia: true },
          });

          if (!stock) {
            throw new Error(`Artigo de stock não encontrado para ${item.referencia || item.name}.`);
          }

          const isStrap = item.referencia === 'D508' || item.referencia === 'D509' || item.referencia === 'MK20-FLAT';
          if (stock.quantidade < item.quantidade && !isStrap) {
            throw new Error(`Stock insuficiente para ${stock.referencia || item.referencia || item.name}.`);
          }

          const quantidadeDepois = stock.quantidade - item.quantidade;

          await tx.stock.update({
            where: { id: item.stockId },
            data: { quantidade: quantidadeDepois },
          });

          await tx.movimentacaoStock.create({
            data: {
              stockId: item.stockId,
              tipo: "saida",
              quantidade: item.quantidade,
              quantidadeAntes: stock.quantidade,
              quantidadeDepois,
              motivo: item.motivo || `Consumo checklist ${certificadoNumero}`,
              usuario: String(payload.responsavel || "operador"),
              inspecaoId: inspecao.id,
            },
          });
        }
      }
    }

    if (replacements.length > 0 && finalJangadaId) {
      // 1. Criar os registos históricos de artigos associados à inspeção
      await tx.artigoJangada.createMany({
        data: replacements.map((item) => ({
          inspecaoId: inspecao.id,
          jangadaId: finalJangadaId,
          name: item.name,
          quantidade: item.quantidade,
          validade: item.validade,
          referencia: item.referencia,
          codigoFabricante: item.codigoFabricante,
        })),
      });

      // 2. Atualizar ou criar os correspondentes artigos ativos da jangada (inspecaoId = null)
      for (const item of replacements) {
        // Procuramos por um artigo ativo existente com a mesma referência ou mesmo nome
        const nameMatch = Prisma.sql`LOWER("name") = LOWER(${item.name})`;
        const activeItem = (await tx.$queryRaw<Array<{ id: number }>>`
          SELECT id FROM "ArtigoJangada"
          WHERE "jangadaId" = ${finalJangadaId}
            AND "inspecaoId" IS NULL
            AND (
              ${item.referencia ? Prisma.sql`"referencia" = ${item.referencia} OR ` : Prisma.empty}
              ${nameMatch}
            )
          LIMIT 1
        `)[0] || null;

        if (activeItem) {
          await tx.artigoJangada.update({
            where: { id: activeItem.id },
            data: {
              quantidade: item.quantidade,
              validade: item.validade,
              codigoFabricante: item.codigoFabricante,
              updatedAt: new Date(),
            },
          });
        } else {
          await tx.artigoJangada.create({
            data: {
              jangadaId: finalJangadaId,
              inspecaoId: null,
              name: item.name,
              quantidade: item.quantidade,
              validade: item.validade,
              referencia: item.referencia,
              codigoFabricante: item.codigoFabricante,
            },
          });
        }
      }
    }

    // 4. FATURAÇÃO AUTOMÁTICA (Consumíveis, Testes e Serviços)
    if (finalJangadaId) {
      const activeOrdem = await tx.ordemServico.findFirst({
        where: {
          jangadaId: finalJangadaId,
          status: { in: ["pendente", "em_progresso"] }
        },
        select: {
          id: true,
          inspecaoId: true,
          metadados: true,
          valorMaoObra: true,
          valorDesconto: true,
          isIsentoIva: true
        }
      });

      if (activeOrdem) {
        const payloadOrcamento = payload.orcamento;
        const hasExplicitOrcamento =
          !!payloadOrcamento &&
          Array.isArray(payloadOrcamento.linhas) &&
          payloadOrcamento.linhas.length > 0;

        const orderMeta = parseOrdemServicoMeta(activeOrdem.metadados);

        if (!applyStockMovements) {
          // Autosave/rascunho: não sobrescrever o orçamento da OS; apenas garantir a ligação
          if (activeOrdem.inspecaoId !== inspecao.id) {
            await tx.ordemServico.update({
              where: { id: activeOrdem.id },
              data: { inspecaoId: inspecao.id },
            });
          }
        } else if (hasExplicitOrcamento && payloadOrcamento?.usarOrcamento) {
          const nextMaterials: any[] = (payloadOrcamento?.linhas || []).map((linha, index) => {
            const stockIdNum = linha.stockId != null && linha.stockId !== "" ? Number(linha.stockId) : null;
            return {
              id: linha.id || `orcamento-${index}`,
              stockId: Number.isFinite(stockIdNum) ? stockIdNum : null,
              referencia: linha.referencia || "SEM-REF",
              descricao: linha.descricao || "Artigo",
              quantidadePrevista: Number(linha.quantidade) || 0,
              quantidadeUsada: Number(linha.quantidade) || 0,
              precoUnitario: Number(linha.precoUnitario) || 0,
              disponibilidade: 0,
              reservado: false,
              consumido: true,
              origem: "orcamento",
            };
          });

          const valorPecas = nextMaterials.reduce(
            (acc, item) =>
              acc +
              Math.max(0, Number(item.quantidadeUsada ?? item.quantidadePrevista ?? 0)) *
                Math.max(0, Number(item.precoUnitario || 0)),
            0
          );
          const valorMaoObra = 0;
          const valorDesconto = Number(payloadOrcamento?.valorDesconto) || 0;
          const isIsentoIva = Boolean(payloadOrcamento?.isIsentoIva);
          const subtotal = Math.max(0, valorPecas + valorMaoObra - valorDesconto);
          const iva = isIsentoIva ? 0 : subtotal * getIvaRate();
          const valorTotal = Math.round((subtotal + iva) * 100) / 100;

          await tx.ordemServico.update({
            where: { id: activeOrdem.id },
            data: {
              inspecaoId: inspecao.id,
              metadados: toOrdemServicoMetaJson({
                ...orderMeta,
                materials: nextMaterials,
              }),
              orcamentoStatus: "Emitido",
              valorPecas,
              valorMaoObra,
              valorDesconto,
              isIsentoIva,
              valorTotal,
            },
          });
        } else {
          const refsToFetch = ["L-JD"];
        if (payload.testeFS === 'PASSOU' || payload.testeFS === 'REPROVOU' || payload.testeFS === 'APROVOU') refsToFetch.push("L-FS");
        if (payload.testeNAP === 'PASSOU' || payload.testeNAP === 'REPROVOU' || payload.testeNAP === 'APROVOU') refsToFetch.push("L-NAP");
        if (payload.testeGI === 'PASSOU' || payload.testeGI === 'REPROVOU' || payload.testeGI === 'APROVOU') refsToFetch.push("L-GI");
        if (payload.testeDL === 'PASSOU' || payload.testeDL === 'REPROVOU' || payload.testeDL === 'APROVOU' || payload.cylinderDataTeste) {
          refsToFetch.push("L-TH");
        }
        if (payload.cylinderSerial) {
          refsToFetch.push("L-CO2");
        }

        for (const r of replacements) {
          if (r.referencia) {
            refsToFetch.push(r.referencia);
          }
        }

        const stockItems = await tx.stock.findMany({
          where: { referencia: { in: refsToFetch } },
          select: { id: true, referencia: true, descricao: true, precoVenda: true, quantidade: true }
        });
        const stockMap = new Map(stockItems.map(item => [item.referencia, item]));

        const inspectionMaterials: any[] = [];

        const services = ["L-JD", "L-FS", "L-NAP", "L-GI", "L-TH", "L-CO2"].filter(r => refsToFetch.includes(r));
        for (const ref of services) {
          const stock = stockMap.get(ref);
          inspectionMaterials.push({
            id: `service-${ref}`,
            stockId: stock?.id || null,
            referencia: ref,
            descricao: stock?.descricao || (
              ref === "L-JD" ? "Inspeção de Jangada" :
              ref === "L-FS" ? "Teste FS" :
              ref === "L-NAP" ? "Teste NAP" :
              ref === "L-GI" ? "Teste GI" :
              ref === "L-TH" ? "Teste Hidrostático" : "Carga de CO2"
            ),
            quantidadePrevista: 1,
            quantidadeUsada: 1,
            precoUnitario: stock?.precoVenda ?? 0,
            disponibilidade: stock?.quantidade ?? 0,
            reservado: false,
            consumido: true
          });
        }

        for (const r of replacements) {
          const stock = r.referencia ? stockMap.get(r.referencia) : null;
          inspectionMaterials.push({
            id: `replacement-${r.referencia || r.name}`,
            stockId: r.stockId || stock?.id || null,
            referencia: r.referencia || "SEM-REF",
            descricao: r.name || stock?.descricao || "Consumível",
            quantidadePrevista: r.quantidade,
            quantidadeUsada: r.quantidade,
            precoUnitario: stock?.precoVenda ?? 0,
            disponibilidade: stock?.quantidade ?? 0,
            reservado: false,
            consumido: true
          });
        }

        const currentMaterials = Array.isArray(orderMeta.materials) ? orderMeta.materials : [];

        const newRefs = new Set(inspectionMaterials.map(m => m.referencia));
        const filteredCurrent = currentMaterials.filter((m: any) => 
          m && m.id &&
          !m.id.startsWith("service-") && 
          !m.id.startsWith("strap-") && 
          !m.id.startsWith("replacement-") && 
          !newRefs.has(m.referencia)
        );

        const nextMaterials = [...filteredCurrent, ...inspectionMaterials];

        const valorPecas = nextMaterials.reduce((acc, item) => 
          acc + Math.max(0, Number(item.quantidadeUsada ?? item.quantidadePrevista ?? 0)) * Math.max(0, Number(item.precoUnitario || 0)),
          0
        );

        const subtotal = Math.max(0, valorPecas + (activeOrdem.valorMaoObra || 0) - (activeOrdem.valorDesconto || 0));
        const iva = activeOrdem.isIsentoIva ? 0 : subtotal * getIvaRate();
        const valorTotal = Math.round((subtotal + iva) * 100) / 100;

        await tx.ordemServico.update({
          where: { id: activeOrdem.id },
          data: {
            inspecaoId: inspecao.id,
            metadados: toOrdemServicoMetaJson({
              ...orderMeta,
              materials: nextMaterials
            }),
            valorPecas,
            valorTotal
          }
        });
        }
      }
    }

    return inspecao;
  });

  if (finalJangadaId) {
    const { saveInspectionSnapshot } = require("@/lib/inspection-snapshots");
    await saveInspectionSnapshot(certificadoNumero, finalJangadaId);
  }

  // 4.5 CARIMBO TEMPORAL: aplicar selo de integridade quando a inspeção é finalizada
  const resolvedFinalStatus = String(payload.status || "Concluída").trim() || "Concluída";
  if (resolvedFinalStatus === "Concluída") {
    try {
      await stampInspectionWithDigest(saved.id);
    } catch (stampError) {
      console.error("Erro ao aplicar carimbo temporal:", stampError);
    }
  }

  // 5. SYNC AUTOMÁTICO: Sempre criar OS quando inspeção é guardada
  if (finalJangadaId) {
    const testesReprovados: string[] = [];
    if (payload.testeWP && ["REPROVOU", "REPROVADO"].includes(String(payload.testeWP).toUpperCase())) testesReprovados.push("testeWP");
    if (payload.testeNAP && ["REPROVOU", "REPROVADO"].includes(String(payload.testeNAP).toUpperCase())) testesReprovados.push("testeNAP");
    if (payload.testeFS && ["REPROVOU", "REPROVADO"].includes(String(payload.testeFS).toUpperCase())) testesReprovados.push("testeFS");
    if (payload.testeGI && ["REPROVOU", "REPROVADO"].includes(String(payload.testeGI).toUpperCase())) testesReprovados.push("testeGI");
    if (payload.testeDL && ["REPROVOU", "REPROVADO"].includes(String(payload.testeDL).toUpperCase())) testesReprovados.push("testeDL");

    const artigosSync = replacements.filter(r => r.referencia).map(r => ({
      name: r.name,
      referencia: r.referencia,
      quantidade: r.quantidade,
      stockId: r.stockId,
      precoUnitario: undefined,
    }));

    try {
      const syncPayload = {
        inspecaoId: saved.id,
        jangadaId: finalJangadaId,
        testesReprovados,
        artigosSubstituidos: artigosSync,
        orcamento: payload.orcamento || null,
        autoCreateOS: true,
        isFinalSave: applyStockMovements,
      };

      await fetch(`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/ordens-servico/sync-inspecao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(syncPayload),
      });
    } catch (syncError) {
      console.error("Sync inspeção→OS falhou (não crítico):", syncError);
    }
  }

  await logAuditoria({
    tabela: "InspecaoChecklist",
    tipoOperacao: "UPDATE",
    idRegisto: saved.id,
    descricao: `Checklist guardada para ${certificadoNumero} (${replacements.length} artigo(s) substituído(s)).`,
    usuario: String(payload.responsavel || "sistema"),
    dadosDepois: {
      certificadoNumero,
      navioNome,
      jangadaSerial,
      dataInspecao,
      dataProxInspecao,
      status: payload.status || "Concluída",
      responsavel: payload.responsavel || null,
      applyStockMovements,
      checklistSnapshot: payload.checklistSnapshot || {},
      artigosSubstituidos: replacements,
    },
  });

  return {
    id: saved.id,
    certificadoNumero,
    artigosSubstituidosCount: replacements.length,
    stockWarnings,
  };
}
