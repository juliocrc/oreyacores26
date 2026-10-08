import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { listAuditoriaFiles } from "@/lib/auditorias-storage";
import { resolveLifejacketManuals } from "@/modules/lifejackets/manualResolver";
import { canonicalizeDateFields } from "@/lib/date-display";

const COLETE_EVIDENCIAS_DIR_PREFIX = "coletes-evidencias";

function buildEvidenceRelativeDir(id: number) {
  return `${COLETE_EVIDENCIAS_DIR_PREFIX}/${id}`;
}

function inferEvidenceDocumentType(filename: string) {
  return /\.pdf$/i.test(filename) ? "Anexo PDF" : "Foto de inspeção";
}

function parseFlexibleDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const raw = String(value).trim();
  if (!raw) return null;

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;

  const match = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]) - 1;
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    const candidate = new Date(year, month, day);
    return Number.isNaN(candidate.getTime()) ? null : candidate;
  }

  return null;
}

function toIso(value: unknown) {
  const date = parseFlexibleDate(value);
  return date ? date.toISOString() : null;
}

function getStartOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function getDaysRemaining(value: unknown) {
  const date = parseFlexibleDate(value);
  if (!date) return null;
  return Math.ceil((date.getTime() - getStartOfToday().getTime()) / (1000 * 60 * 60 * 24));
}

function getSeverity(daysRemaining: number | null): "critical" | "warning" | "ok" | "info" {
  if (daysRemaining === null) return "info";
  if (daysRemaining < 0) return "critical";
  if (daysRemaining <= 30) return "critical";
  if (daysRemaining <= 90) return "warning";
  return "ok";
}

function getDeadlineStatus(daysRemaining: number | null) {
  if (daysRemaining === null) return "sem-data";
  if (daysRemaining < 0) return "expirado";
  if (daysRemaining === 0) return "vence-hoje";
  if (daysRemaining <= 30) return "a-expirar";
  if (daysRemaining <= 90) return "planear";
  return "ok";
}

function normalizeText(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function rankDeadline(daysRemaining: number | null) {
  if (daysRemaining === null) return 99999;
  if (daysRemaining < 0) return Math.abs(daysRemaining);
  return daysRemaining + 10000;
}

function dedupeById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function sortTimeline<T extends { date: string | null }>(items: T[]) {
  return items.sort((a, b) => {
    const aTime = parseFlexibleDate(a.date)?.getTime() ?? 0;
    const bTime = parseFlexibleDate(b.date)?.getTime() ?? 0;
    return bTime - aTime;
  });
}

function countChecklistFlags(values: Array<string | null | undefined>, target: string) {
  return values.filter((value) => String(value || "").trim().toUpperCase() === target).length;
}

function sanitizeColeteUpdatePayload(data: unknown) {
  const rec = (data ?? {}) as Record<string, unknown>;
  return {
    shipId: Object.prototype.hasOwnProperty.call(rec, "shipId")
      ? (rec.shipId === null || rec.shipId === "" ? null : Number(rec.shipId) || null)
      : undefined,
    serial: Object.prototype.hasOwnProperty.call(rec, "serial") ? (rec.serial ? String(rec.serial).trim() : null) : undefined,
    marca: Object.prototype.hasOwnProperty.call(rec, "marca") ? (rec.marca ? String(rec.marca).trim() : null) : undefined,
    modelo: Object.prototype.hasOwnProperty.call(rec, "modelo") ? (rec.modelo ? String(rec.modelo).trim() : null) : undefined,
    tamanho: Object.prototype.hasOwnProperty.call(rec, "tamanho") ? (rec.tamanho ? String(rec.tamanho).trim() : null) : undefined,
    estado: Object.prototype.hasOwnProperty.call(rec, "estado") ? (rec.estado ? String(rec.estado).trim() : "Ativo") : undefined,
    dataFabrico: Object.prototype.hasOwnProperty.call(rec, "dataFabrico") ? (rec.dataFabrico || null) : undefined,
    dataInspecao: Object.prototype.hasOwnProperty.call(rec, "dataInspecao") ? (rec.dataInspecao || null) : undefined,
    dataProxInspecao: Object.prototype.hasOwnProperty.call(rec, "dataProxInspecao") ? (rec.dataProxInspecao || null) : undefined,
    observacoes: Object.prototype.hasOwnProperty.call(rec, "observacoes") ? (rec.observacoes ? String(rec.observacoes).trim() : null) : undefined,
    temLuz: Object.prototype.hasOwnProperty.call(rec, "temLuz") ? (rec.temLuz === true || String(rec.temLuz).toLowerCase() === "true" || String(rec.temLuz).toUpperCase() === "SIM" ? true : (rec.temLuz === false || String(rec.temLuz).toLowerCase() === "false" || String(rec.temLuz).toUpperCase() === "NAO" || String(rec.temLuz).toUpperCase() === "NÃO" ? false : null)) : undefined,
    testePressao: Object.prototype.hasOwnProperty.call(rec, "testePressao") ? (rec.testePressao ? String(rec.testePressao).trim() : null) : undefined,
    testeInsuflacao: Object.prototype.hasOwnProperty.call(rec, "testeInsuflacao") ? (rec.testeInsuflacao ? String(rec.testeInsuflacao).trim() : null) : undefined,
    testeVazamento: Object.prototype.hasOwnProperty.call(rec, "testeVazamento") ? (rec.testeVazamento ? String(rec.testeVazamento).trim() : null) : undefined,
    cilindroRef: Object.prototype.hasOwnProperty.call(rec, "cilindroRef") ? (rec.cilindroRef ? String(rec.cilindroRef).trim() : null) : undefined,
    cilindroLote: Object.prototype.hasOwnProperty.call(rec, "cilindroLote") ? (rec.cilindroLote ? String(rec.cilindroLote).trim() : null) : undefined,
    cilindroValidade: Object.prototype.hasOwnProperty.call(rec, "cilindroValidade") ? (rec.cilindroValidade ? String(rec.cilindroValidade).trim() : null) : undefined,
    pastilhaRef: Object.prototype.hasOwnProperty.call(rec, "pastilhaRef") ? (rec.pastilhaRef ? String(rec.pastilhaRef).trim() : null) : undefined,
    pastilhaLote: Object.prototype.hasOwnProperty.call(rec, "pastilhaLote") ? (rec.pastilhaLote ? String(rec.pastilhaLote).trim() : null) : undefined,
    pastilhaValidade: Object.prototype.hasOwnProperty.call(rec, "pastilhaValidade") ? (rec.pastilhaValidade ? String(rec.pastilhaValidade).trim() : null) : undefined,
    luzRef: Object.prototype.hasOwnProperty.call(rec, "luzRef") ? (rec.luzRef ? String(rec.luzRef).trim() : null) : undefined,
    luzLote: Object.prototype.hasOwnProperty.call(rec, "luzLote") ? (rec.luzLote ? String(rec.luzLote).trim() : null) : undefined,
    luzValidade: Object.prototype.hasOwnProperty.call(rec, "luzValidade") ? (rec.luzValidade ? String(rec.luzValidade).trim() : null) : undefined,
    apitoRef: Object.prototype.hasOwnProperty.call(rec, "apitoRef") ? (rec.apitoRef ? String(rec.apitoRef).trim() : null) : undefined,
    apitoLote: Object.prototype.hasOwnProperty.call(rec, "apitoLote") ? (rec.apitoLote ? String(rec.apitoLote).trim() : null) : undefined,
    apitoValidade: Object.prototype.hasOwnProperty.call(rec, "apitoValidade") ? (rec.apitoValidade ? String(rec.apitoValidade).trim() : null) : undefined,
    mecanismoInflacao: Object.prototype.hasOwnProperty.call(rec, "mecanismoInflacao") ? (rec.mecanismoInflacao ? String(rec.mecanismoInflacao).trim() : null) : undefined,
    mecanismoValidade: Object.prototype.hasOwnProperty.call(rec, "mecanismoValidade") ? (rec.mecanismoValidade ? String(rec.mecanismoValidade).trim() : null) : undefined,
  };
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!id) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    
    const url = new URL(req.url);
    const includeStock = url.searchParams.get("includeStock") === "true";

    const colete = await prisma.colete.findUnique({
      where: { id },
      select: {
        id: true,
        shipId: true,
        serial: true,
        marca: true,
        modelo: true,
        tamanho: true,
        estado: true,
        dataFabrico: true,
        dataInspecao: true,
        dataProxInspecao: true,
        observacoes: true,
        createdAt: true,
        updatedAt: true,
        testePressao: true,
        testeInsuflacao: true,
        testeVazamento: true,
        cilindroRef: true,
        cilindroLote: true,
        cilindroValidade: true,
        pastilhaRef: true,
        pastilhaLote: true,
        pastilhaValidade: true,
        temLuz: true,
        luzRef: true,
        luzLote: true,
        luzValidade: true,
        apitoRef: true,
        apitoLote: true,
        apitoValidade: true,
        verificacoes: {
          orderBy: { dataVerificacao: "desc" },
        },
        certificado: true,
      },
    });
    if (!colete) return NextResponse.json({ error: "Colete não encontrado" }, { status: 404 });

    const [navio, shipInspecoes, evidenceFiles, globalStock] = await Promise.all([
      colete.shipId
        ? prisma.navio.findUnique({
            where: { id: colete.shipId },
            select: {
              id: true,
              nome: true,
              matricula: true,
              mmsi: true,
              callSignal: true,
              proprietario: true,
              cliente: {
                select: {
                  id: true,
                  nome: true,
                  telefone: true,
                  telmovel: true,
                  morada: true,
                  moradaNumero: true,
                  codigoPostal: true,
                  localidade: true,
                  ilha: true,
                },
              },
            },
          })
        : Promise.resolve(null),
      prisma.inspecao.findMany({
        where: {
          OR: [
            { coleteId: colete.id },
            ...(normalizeText(colete.serial) ? [{ coleteSerial: colete.serial! }] : []),
            ...(colete.shipId ? [{ navioId: colete.shipId }] : []),
          ],
        },
        include: {
          artigos: {
            include: {
              stock: { select: { foto: true } },
            },
          },
        },
        orderBy: { dataInspecao: "desc" },
        take: 12,
      }),
      listAuditoriaFiles(buildEvidenceRelativeDir(colete.id)),
      includeStock
        ? prisma.stock.findMany({
            where: { estadoArtigo: "ATIVO" },
            select: {
              id: true,
              referencia: true,
              descricao: true,
              quantidade: true,
              categoria: true,
              validade: true,
              lote: true,
              foto: true,
            },
          })
        : Promise.resolve([]),
    ]);

      const resolvedManuals = resolveLifejacketManuals(colete.marca, colete.modelo);

    const checklistSnapshots = colete.verificacoes.map((verification) => [
      verification.tecidoExterior,
      verification.colagens,
      verification.zataosVelcro,
      verification.fitasReflectoras,
      verification.sistemaInflacao,
      verification.mecanismoInflacao,
      verification.camaras,
      verification.garrafaCO2,
      verification.tuboInflador,
    ]);

    const totalFalhas = checklistSnapshots.reduce((sum, values) => sum + countChecklistFlags(values, "F"), 0);
    const totalSubstituicoes = checklistSnapshots.reduce((sum, values) => sum + countChecklistFlags(values, "S"), 0);
    const totalReparacoes = checklistSnapshots.reduce((sum, values) => sum + countChecklistFlags(values, "R"), 0);

    const deadlineCandidates = [] as Array<{
      id: string;
      title: string;
      entityType: "colete" | "navio";
      entityLabel: string;
      date: string;
      daysRemaining: number | null;
      severity: "critical" | "warning" | "ok" | "info";
      status: string;
      href: string;
      source: string;
    }>;

    const addDeadline = (entry: {
      id: string;
      title: string;
      entityType: "colete" | "navio";
      entityLabel: string;
      date: unknown;
      href: string;
      source: string;
    }) => {
      const iso = toIso(entry.date);
      if (!iso) return;
      const daysRemaining = getDaysRemaining(entry.date);
      deadlineCandidates.push({
        ...entry,
        date: iso,
        daysRemaining,
        severity: getSeverity(daysRemaining),
        status: getDeadlineStatus(daysRemaining),
      });
    };

    addDeadline({
      id: `colete-next-${colete.id}`,
      title: "Próxima inspeção do colete",
      entityType: "colete",
      entityLabel: colete.serial,
      date: colete.dataProxInspecao,
      href: `/equipamentos/${colete.id}`,
      source: "Ficha do colete",
    });

    if (colete.certificado) {
      addDeadline({
        id: `colete-cert-${colete.id}`,
        title: "Validade do certificado",
        entityType: "colete",
        entityLabel: colete.serial,
        date: colete.certificado.dataValidade,
        href: `/equipamentos/${colete.id}`,
        source: "Certificado do colete",
      });
    }

    const timeline = [] as Array<{
      id: string;
      kind: string;
      title: string;
      description: string;
      entityType: "colete" | "navio";
      entityLabel: string;
      date: string | null;
      status: string;
      severity: "critical" | "warning" | "ok" | "info";
      href?: string;
      source: string;
    }>;

    timeline.push({
      id: `colete-created-${colete.id}`,
      kind: "record",
      title: `Registo do colete ${colete.serial || `#${colete.id}`}`,
      description: "Criação inicial da ficha do equipamento.",
      entityType: "colete",
      entityLabel: colete.serial || `#${colete.id}`,
      date: toIso(colete.createdAt),
      status: "criado",
      severity: "info",
      href: `/equipamentos/${colete.id}`,
      source: "Ficha do colete",
    });

    timeline.push({
      id: `colete-updated-${colete.id}`,
      kind: "record",
      title: `Atualização da ficha do colete ${colete.serial || `#${colete.id}`}`,
      description: "Última atualização administrativa ou técnica do registo.",
      entityType: "colete",
      entityLabel: colete.serial || `#${colete.id}`,
      date: toIso(colete.updatedAt),
      status: "atualizado",
      severity: "info",
      href: `/equipamentos/${colete.id}`,
      source: "Ficha do colete",
    });

    colete.verificacoes.forEach((verification) => {
      const values = [
        verification.tecidoExterior,
        verification.colagens,
        verification.zataosVelcro,
        verification.fitasReflectoras,
        verification.sistemaInflacao,
        verification.mecanismoInflacao,
        verification.camaras,
        verification.garrafaCO2,
        verification.tuboInflador,
      ];
      const hasFailure = countChecklistFlags(values, "F") > 0;
      timeline.push({
        id: `colete-verificacao-${verification.id}`,
        kind: "verification",
        title: `Verificação do colete ${colete.serial || `#${colete.id}`}`,
        description: [
          normalizeText(verification.inspectorNome) ? `Inspetor: ${verification.inspectorNome}` : null,
          hasFailure ? "Com falhas registadas" : "Sem falhas críticas registadas",
        ].filter(Boolean).join(" · "),
        entityType: "colete",
        entityLabel: colete.serial || `#${colete.id}`,
        date: toIso(verification.dataVerificacao),
        status: hasFailure ? "revisão" : "verificado",
        severity: hasFailure ? "warning" : "ok",
        href: `/equipamentos/${colete.id}`,
        source: "Verificações do colete",
      });
    });

    if (colete.certificado) {
      timeline.push({
        id: `colete-certificado-${colete.certificado.id}`,
        kind: "certificate",
        title: `Certificado do colete ${colete.serial || `#${colete.id}`}`,
        description: colete.certificado.numeroCertificado,
        entityType: "colete",
        entityLabel: colete.serial || `#${colete.id}`,
        date: toIso(colete.certificado.dataCertificado),
        status: colete.certificado.resultado || "emitido",
        severity: String(colete.certificado.resultado || "").toLowerCase() === "reprovado" ? "critical" : "ok",
        href: `/equipamentos/${colete.id}`,
        source: "Certificado do colete",
      });
    }

    shipInspecoes.forEach((inspection) => {
      timeline.push({
        id: `navio-inspecao-${inspection.id}`,
        kind: "inspection",
        title: `Inspeção associada ao navio ${navio?.nome || ""}`.trim(),
        description: [inspection.certificadoNumero, inspection.status].filter(Boolean).join(" · "),
        entityType: "navio",
        entityLabel: navio?.nome || `Navio #${colete.shipId}`,
        date: toIso(inspection.dataInspecao || inspection.createdAt),
        status: inspection.status || "Concluída",
        severity: "info",
        href: navio ? `/navios/${navio.id}` : undefined,
        source: "Histórico do navio associado",
      });
    });

    deadlineCandidates.forEach((deadline) => {
      timeline.push({
        id: `deadline-${deadline.id}`,
        kind: "deadline",
        title: deadline.title,
        description: `${deadline.entityLabel} · ${deadline.source}`,
        entityType: deadline.entityType,
        entityLabel: deadline.entityLabel,
        date: deadline.date,
        status: deadline.status,
        severity: deadline.severity,
        href: deadline.href,
        source: deadline.source,
      });
    });

    const documents = [] as Array<{
      id: string;
      title: string;
      documentType: string;
      entityType: "colete";
      entityLabel: string;
      reference?: string | null;
      issueDate?: string | null;
      expiryDate?: string | null;
      status: string;
      severity: "critical" | "warning" | "ok" | "info";
      href: string;
      source: string;
    }>;

    if (colete.certificado) {
      const certificateDays = getDaysRemaining(colete.certificado.dataValidade);
      documents.push({
        id: `document-cert-${colete.certificado.id}`,
        title: `Certificado do colete ${colete.serial || `#${colete.id}`}`,
        documentType: "Certificado de colete",
        entityType: "colete",
        entityLabel: colete.serial || `#${colete.id}`,
        reference: colete.certificado.numeroCertificado,
        issueDate: toIso(colete.certificado.dataCertificado),
        expiryDate: toIso(colete.certificado.dataValidade),
        status: colete.certificado.resultado || "emitido",
        severity: getSeverity(certificateDays),
        href: `/equipamentos/${colete.id}`,
        source: "Certificado do colete",
      });
    }

    resolvedManuals.manuals.forEach((manual, index) => {
      documents.push({
        id: `document-manual-${colete.id}-${index}`,
        title: manual.fileName,
        documentType: "Manual técnico",
        entityType: "colete",
        entityLabel: colete.serial || `#${colete.id}`,
        reference: manual.label,
        issueDate: null,
        expiryDate: null,
        status: "biblioteca",
        severity: "info",
        href: manual.href,
        source: "Biblioteca técnica do modelo",
      });
    });

    evidenceFiles
      .slice()
      .sort((a, b) => String(b.uploadedAt || b.modified).localeCompare(String(a.uploadedAt || a.modified)))
      .forEach((file, index) => {
        const href = `/api/coletes/${colete.id}/evidencias?name=${encodeURIComponent(file.name)}`;
        documents.push({
          id: `document-evidence-${colete.id}-${index}`,
          title: file.originalName || file.name,
          documentType: inferEvidenceDocumentType(file.name),
          entityType: "colete",
          entityLabel: colete.serial || `#${colete.id}`,
          reference: file.name,
          issueDate: String(file.uploadedAt || file.modified),
          expiryDate: null,
          status: "anexado",
          severity: "info",
          href,
          source: "Evidências operacionais do colete",
        });

        timeline.push({
          id: `colete-evidence-${colete.id}-${index}`,
          kind: "evidence",
          title: `Evidência anexada ao colete ${colete.serial || `#${colete.id}`}`,
          description: file.originalName || file.name,
          entityType: "colete",
          entityLabel: colete.serial || `#${colete.id}`,
          date: toIso(file.uploadedAt || file.modified),
          status: "anexado",
          severity: "info",
          href,
          source: "Evidências operacionais do colete",
        });
      });

    const sortedDeadlines = deadlineCandidates.slice().sort((a, b) => rankDeadline(a.daysRemaining) - rankDeadline(b.daysRemaining));
    const nextDeadline = sortedDeadlines[0] || null;
    const criticalCount = deadlineCandidates.filter((item) => item.severity === "critical").length;
    const warningCount = deadlineCandidates.filter((item) => item.severity === "warning").length;
    const latestVerification = colete.verificacoes[0] || null;
    const lastInspectionAt = latestVerification?.dataVerificacao || colete.dataInspecao || null;
    const sortedTimeline = sortTimeline(dedupeById(timeline)).slice(0, 30);
    const statusHealth = criticalCount > 0
      ? "critical"
      : warningCount > 0 || totalFalhas > 0
        ? "warning"
        : "ok";

    const dossier = {
      summary: {
        verificationCount: colete.verificacoes.length,
        totalFalhas,
        totalSubstituicoes,
        totalReparacoes,
        hasCertificate: Boolean(colete.certificado),
        criticalCount,
        warningCount,
        statusHealth,
        statusLabel: statusHealth === "critical" ? "Ação imediata necessária" : statusHealth === "warning" ? "Requer seguimento" : "Operacional",
        nextDeadline: nextDeadline ? {
          id: nextDeadline.id,
          title: nextDeadline.title,
          entityLabel: nextDeadline.entityLabel,
          date: nextDeadline.date,
          daysRemaining: nextDeadline.daysRemaining,
          severity: nextDeadline.severity,
          status: nextDeadline.status,
          href: nextDeadline.href,
          source: nextDeadline.source,
        } : null,
        lastInspectionAt: toIso(lastInspectionAt),
        lastActivityAt: sortedTimeline[0]?.date || null,
      },
      timeline: sortedTimeline,
      documents,
      deadlines: sortedDeadlines,
    };

    return NextResponse.json({
      ...colete,
      navio,
      dossier,
      inspecoes: shipInspecoes.filter(
        (insp) =>
          insp.coleteId === colete.id ||
          (colete.serial && insp.coleteSerial === colete.serial)
      ),
      globalStock: includeStock ? globalStock : undefined,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || "Erro ao obter colete" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!id) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    await prisma.colete.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || "Erro ao eliminar colete" }, { status: 400 });
  }
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!id) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    const data = canonicalizeDateFields(await req.json(), [
      "dataFabrico",
      "dataInspecao",
      "dataProxInspecao",
      "cilindroValidade",
      "pastilhaValidade",
      "luzValidade",
      "apitoValidade",
      "mecanismoValidade",
    ]);
    const payload = sanitizeColeteUpdatePayload(data);
    const updateData = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));

    if (Object.prototype.hasOwnProperty.call(updateData, "serial") && !updateData.serial) {
      return NextResponse.json({ error: "Nº de série do colete é obrigatório." }, { status: 400 });
    }

    const current = await prisma.colete.findUnique({
      where: { id },
      select: { shipId: true, serial: true }
    });

    // O serial e unico na base de dados. Sem esta verificacao previa, corrigir um
    // numero de serie para outro ja registado devolveva o erro cru do Prisma
    // (P2002) em vez de uma mensagem compreensivel.
    if (Object.prototype.hasOwnProperty.call(updateData, "serial")) {
      const serialPretendido = String(updateData.serial);
      if (current && current.serial && current.serial === serialPretendido) {
        delete updateData.serial;
      } else {
        const duplicado = await prisma.colete.findUnique({
          where: { serial: serialPretendido },
          select: { id: true },
        });
        if (duplicado && duplicado.id !== id) {
          return NextResponse.json(
            { error: `O nº de série "${serialPretendido}" já está atribuído a outro colete.` },
            { status: 409 }
          );
        }
      }
    }

    if (current && Object.prototype.hasOwnProperty.call(updateData, "shipId") && updateData.shipId !== current.shipId) {
      let origemNome = null;
      let destinoNome = null;

      if (current.shipId) {
        const s = await prisma.navio.findUnique({ where: { id: current.shipId }, select: { nome: true } });
        origemNome = s?.nome || null;
      }
      if (updateData.shipId) {
        const s = await prisma.navio.findUnique({ where: { id: Number(updateData.shipId) }, select: { nome: true } });
        destinoNome = s?.nome || null;
      }

      await prisma.movimentoEquipamento.create({
        data: {
          tipoEquipamento: "Colete",
          equipamentoId: id,
          serial: String(current.serial || updateData.serial || ""),
          origemShipId: current.shipId,
          origemShipNome: origemNome,
          destinoShipId: updateData.shipId ? Number(updateData.shipId) : null,
          destinoShipNome: destinoNome,
          motivo: "Alteração de Navio"
        }
      });
    }

    const updated = await prisma.colete.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        shipId: true,
        serial: true,
        marca: true,
        modelo: true,
        tamanho: true,
        estado: true,
        dataFabrico: true,
        dataInspecao: true,
        dataProxInspecao: true,
        observacoes: true,
        createdAt: true,
        updatedAt: true,
        testePressao: true,
        testeInsuflacao: true,
        testeVazamento: true,
        cilindroRef: true,
        cilindroLote: true,
        cilindroValidade: true,
        pastilhaRef: true,
        pastilhaLote: true,
        pastilhaValidade: true,
        temLuz: true,
        luzRef: true,
        luzLote: true,
        luzValidade: true,
        apitoRef: true,
        apitoLote: true,
        apitoValidade: true,
      },
    });
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || "Erro ao atualizar colete" }, { status: 400 });
  }
}
