import prisma from "@/lib/prisma";
import { getInspectionStatus } from "@/lib/inspection-status";
import { signCertificatePdfToken } from "@/lib/certificate-pdf-token";
import { isPortalInspectionCertified } from "@/lib/portal-inspection-documents";
import { isSosDocumentRaft } from '@/lib/raft-document-rules';
import { invoiceDisplay } from '@/lib/invoice-official';

export type PortalClienteData = Awaited<ReturnType<typeof buildPortalClienteData>>;

export async function buildPortalClienteData(clienteId: number) {
  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: {
      id: true,
      nome: true,
      nif: true,
      numeroCliente: true,
      email: true,
      telefone: true,
      telmovel: true,
      morada: true,
      moradaNumero: true,
      codigoPostal: true,
      localidade: true,
      ilha: true,
    },
  });

  if (!cliente) return null;

  const navios = await prisma.navio.findMany({
    where: { clienteId: cliente.id },
    select: { id: true, nome: true, matricula: true, ilha: true, portoRegisto: true, tipoPesca: true, tipoNavio: true, comprimentoMetros: true },
  });
  const navioIds = navios.map((n) => n.id);

  const coletes = await prisma.colete.findMany({
    where: { shipId: { in: navioIds } },
    select: { id: true, shipId: true, serial: true, marca: true, modelo: true, dataProxInspecao: true },
    orderBy: { serial: "asc" },
  });

  const jangadas = await prisma.jangada.findMany({
    where: {
      shipId: { in: navioIds },
    },
  });

  const jangadaIds = jangadas.map((j) => j.id);
  const inspecoes =
    jangadaIds.length > 0
      ? await prisma.inspecao.findMany({
          where: { jangadaId: { in: jangadaIds } },
          orderBy: [{ dataInspecao: "desc" }, { id: "desc" }],
        })
      : [];

  const { getJangadaWorkflowStatus } = await (await import("@/lib/jangada-workflow-status"));
  const jangadasFormatadas = await Promise.all(jangadas.map(async (j) => {
    const ultimaInspecao = inspecoes.find((i) => i.jangadaId === j.id) || null;
    const dataInspecao = ultimaInspecao?.dataInspecao
      ? new Date(ultimaInspecao.dataInspecao).toISOString()
      : j.dataInspecao;
    const dataProxInspecao = ultimaInspecao?.dataProxInspecao
      ? new Date(ultimaInspecao.dataProxInspecao).toISOString()
      : j.dataProxInspecao;
    const statusInfo = getInspectionStatus(dataProxInspecao);

    const certNum = ultimaInspecao?.certificadoNumero || j.ultimoCertificadoNumero || null;

    let workflow: {
      state: string;
      label: string;
      dataHora: string | null;
      queueStatus?: string | null;
    } = { state: "SEM_ESTADO", label: "Sem estado na estação", dataHora: null };
    try {
      const wf = await getJangadaWorkflowStatus(j.id);
      workflow = {
        state: wf.state,
        label: wf.labelPt,
        dataHora: wf.dataHora ? wf.dataHora.toISOString() : null,
        queueStatus: wf.queueStatus,
      };
    } catch {
      workflow = { state: "SEM_ESTADO", label: "Sem estado na estação", dataHora: null };
    }

    const navioObj = navios.find((n) => n.id === j.shipId);
    const isPesca = Boolean(
      navioObj?.tipoPesca &&
        navioObj.tipoPesca.toLowerCase() !== "não aplicável" &&
        navioObj.tipoPesca.toLowerCase() !== "outro",
    );

    return {
      id: j.id,
      serial: j.serial,
      brand: j.brand,
      model: j.model,
      capacity: j.capacity,
      owner: j.owner,
      navioId: j.shipId || null,
      navioNome: j.shipNameManual || navioObj?.nome || null,
      tipoPesca: navioObj?.tipoPesca || null,
      isPesca,
      dataInspecao,
      dataProxInspecao,
      status: statusInfo,
      diasParaProxima: statusInfo.daysLeft,
      ultimoCertificadoNumero: certNum,
      certificadoExternoNumero: j.certificadoExternoNumero,
      certificadoExternoUrl: null as string | null,
      quadroInspecaoId: ultimaInspecao?.id ?? null,
      quadroInspecaoData: ultimaInspecao?.dataInspecao ? new Date(ultimaInspecao.dataInspecao).toISOString() : null,
      quadroPdfUrl: !isSosDocumentRaft(j) && ultimaInspecao && isPortalInspectionCertified(ultimaInspecao)
        ? `/api/portal/documentos?jangadaId=${j.id}&inspecaoId=${ultimaInspecao.id}&document=quadro&format=pdf`
        : null,
      certificadoPdfUrl:
        certNum
          ? `/api/certificados/pdf?serial=${encodeURIComponent(j.serial)}`
          : null,
      certificadoPdfPublicUrl:
        certNum && j.serial
          ? `/api/certificados/pdf?serial=${encodeURIComponent(j.serial)}&t=${signCertificatePdfToken(j.serial)}`
          : null,
      hruReferencia: j.hruReferencia,
      hruValidade: j.hruValidade,
      hruValidadeDias: null as number | null,
      radarReflector: j.radarReflector,
      radarReflectorValidade: j.radarReflectorValidade,
      cylinderSistema: j.cylinderSistema,
      cylinderDataTeste: j.cylinderDataTeste,
      workflowStatus: workflow,
      };
    }));

  const ordensServico = await prisma.ordemServico.findMany({
    where: { clienteId: cliente.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      numeroOrdem: true,
      status: true,
      orcamentoStatus: true,
      valorTotal: true,
      createdAt: true,
      dataConclusao: true,
      jangada: { select: { id: true, serial: true, brand: true, model: true } },
    },
  });

  const invoiceRecords = await prisma.fatura.findMany({
    where: { clienteId: cliente.id },
    orderBy: { dataEmissao: "desc" },
    include: {
      notaCredito: true,
      recibos: { orderBy: { dataEmissao: "desc" } },
      ordemServicos: {
        include: {
          ordemServico: {
            select: {
              id: true,
              numeroOrdem: true,
              jangada: { select: { id: true, serial: true, brand: true, model: true } },
            },
          },
        },
      },
    },
  });

  // Internal records and reference-only entries are not client invoice documents.
  const faturas = invoiceRecords.filter(f => {
    const display = invoiceDisplay(f);
    return display.numeroFaturaOficial && display.pdfOficial;
  }).slice(0, 10);
  const faturasFormatadas = faturas.map((f) => ({
    id: f.id,
    numeroFatura: invoiceDisplay(f).numeroFaturaOficial!,
    valorTotal: Number(f.valorTotal || 0),
    valorPago: f.recibos.reduce((acc, r) => acc + Number(r.valorPago || 0), 0),
    pagamentoStatus: f.pagamentoStatus,
    dataEmissao: f.dataEmissao ? new Date(f.dataEmissao).toISOString() : new Date().toISOString(),
    cancelada: f.cancelada,
    motivoCancelamento: f.motivoCancelamento,
    numeroNotaCredito: f.notaCredito?.numeroNotaCredito || null,
    numeroRecibo: f.recibos[0]?.numeroRecibo || null,
    faturaPdfUrl: `/api/portal/faturas/${f.id}/oficial`,
    ordemServicos: f.ordemServicos.map((os) => ({
      id: os.ordemServico.id,
      numeroOrdem: os.ordemServico.numeroOrdem || `#${os.ordemServico.id}`,
      jangada: os.ordemServico.jangada,
    })),
  }));

  let totalFaturado = 0;
  let totalRecebido = 0;
  for (const f of faturas) {
    if (!f.cancelada) {
      totalFaturado += Number(f.valorTotal || 0);
      totalRecebido += f.recibos.reduce((acc, r) => acc + Number(r.valorPago || 0), 0);
    }
  }

  return {
    cliente,
    navios,
    coletes,
    jangadas: jangadasFormatadas,
    ordensServico: ordensServico.map((o) => ({
      ...o,
      createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : new Date().toISOString(),
      dataConclusao: o.dataConclusao ? new Date(o.dataConclusao).toISOString() : null,
    })),
    faturas: faturasFormatadas,
    resumoFaturas: {
      totalFaturas: faturas.length,
      totalFaturado,
      totalRecebido,
      totalEmDivida: Math.max(0, totalFaturado - totalRecebido),
    },
  };
}
