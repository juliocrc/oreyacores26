import { buildQuadroChecklistPayload, buildWpDerivedValues } from "./quadro-payload";
import type { InspectionCertificateInput } from "./inspection-certificate";
import { getStampDataUrl } from "./certificate-stamp";

export type CertificateArtigoLike = {
  name?: string | null;
  descricao?: string | null;
  referencia?: string | null;
  validade?: string | Date | null;
  quantidade?: number | null;
  codigoFabricante?: string | null;
};

export type JangadaForCertificate = {
  serial?: string | null;
  brand?: string | null;
  model?: string | null;
  capacity?: number | null;
  dataFabrico?: string | null;
  packType?: string | null;
  owner?: string | null;
  shipNameManual?: string | null;
  shipId?: number | null;
  ultimoCertificadoNumero?: string | null;
  dataInspecao?: string | Date | null;
  dataProxInspecao?: string | Date | null;
  testeWP?: string | null;
  testeNAP?: string | null;
  testeFS?: string | null;
  testeGI?: string | null;
  testeDL?: string | null;
  testeWPUnidadePressao?: string | null;
  testeWPHoraInicio?: string | null;
  testeWPTemperaturaInicial?: string | number | null;
  testeWPTemperaturaFinal?: string | number | null;
  testeWPPressaoAtmosfericaInicial?: string | number | null;
  testeWPPressaoAtmosfericaFinal?: string | number | null;
  testeWPCamaraSuperiorInicio?: string | number | null;
  testeWPCamaraSuperiorFim?: string | number | null;
  testeWPCamaraInferiorInicio?: string | number | null;
  testeWPCamaraInferiorFim?: string | number | null;
  hruValidade?: string | Date | null;
  hruReferencia?: string | null;
  cylinderDataTeste?: string | null;
  inspectionChecklistValues?: Record<string, unknown> | null;
  artigos?: CertificateArtigoLike[] | null;
};

export type InspecaoForCertificate = {
  certificadoNumero?: string | null;
  dataInspecao?: string | Date | null;
  dataProxInspecao?: string | Date | null;
  responsavel?: string | null;
  status?: string | null;
  signatureBase64?: string | null;
  testeWP?: string | null;
  testeNAP?: string | null;
  testeFS?: string | null;
  testeGI?: string | null;
  testeDL?: string | null;
  testeWPUnidadePressao?: string | null;
  testeWPHoraInicio?: string | null;
  testeWPTemperaturaInicial?: string | number | null;
  testeWPTemperaturaFinal?: string | number | null;
  testeWPPressaoAtmosfericaInicial?: string | number | null;
  testeWPPressaoAtmosfericaFinal?: string | number | null;
  testeWPCamaraSuperiorInicio?: string | number | null;
  testeWPCamaraSuperiorFim?: string | number | null;
  testeWPCamaraInferiorInicio?: string | number | null;
  testeWPCamaraInferiorFim?: string | number | null;
  artigos?: CertificateArtigoLike[] | null;
};

function pick<T>(inspectionValue: T | null | undefined, raftValue: T | null | undefined): T | null | undefined {
  if (inspectionValue !== null && inspectionValue !== undefined && inspectionValue !== "") return inspectionValue;
  return raftValue;
}

function toDateInput(value: unknown): string {
  if (!value) return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString().slice(0, 10);
}

function isImageDataUrl(value?: string | null): value is string {
  return Boolean(value && /^data:image\/(png|jpe?g|webp);base64,/i.test(value));
}

/**
 * Constrói o payload do certificado (PDF/`inspection-certificate`) a partir de uma
 * jangada e da sua última inspeção. Reutiliza a mesma checklist do quadro/dossier
 * (`buildQuadroChecklistPayload`) e aplica os valores derivados do teste WP.
 *
 * Por omissão aplica o carimbo oficial OREY na área de assinatura do certificado.
 */
export function buildInspectionCertificateInput(params: {
  jangada: JangadaForCertificate;
  lastInspecao?: InspecaoForCertificate | null;
  shipName?: string | null;
  ownerName?: string | null;
  /** Código da estação de serviço, para escolher o carimbo respetivo. */
  stampStationCode?: string | null;
  /** Aplicar o carimbo na área de assinatura do certificado. Default: true. */
  stamp?: boolean;
}): InspectionCertificateInput {
  const { jangada, lastInspecao } = params;

  const wp = {
    testeWP: pick(lastInspecao?.testeWP, jangada.testeWP),
    testeNAP: pick(lastInspecao?.testeNAP, jangada.testeNAP),
    testeFS: pick(lastInspecao?.testeFS, jangada.testeFS),
    testeGI: pick(lastInspecao?.testeGI, jangada.testeGI),
    testeDL: pick(lastInspecao?.testeDL, jangada.testeDL),
    pressureUnit: pick(lastInspecao?.testeWPUnidadePressao, jangada.testeWPUnidadePressao),
    startTime: pick(lastInspecao?.testeWPHoraInicio, jangada.testeWPHoraInicio),
    tempInitial: pick(lastInspecao?.testeWPTemperaturaInicial, jangada.testeWPTemperaturaInicial),
    tempFinal: pick(lastInspecao?.testeWPTemperaturaFinal, jangada.testeWPTemperaturaFinal),
    baroInitial: pick(lastInspecao?.testeWPPressaoAtmosfericaInicial, jangada.testeWPPressaoAtmosfericaInicial),
    baroFinal: pick(lastInspecao?.testeWPPressaoAtmosfericaFinal, jangada.testeWPPressaoAtmosfericaFinal),
    upperStart: pick(lastInspecao?.testeWPCamaraSuperiorInicio, jangada.testeWPCamaraSuperiorInicio),
    upperEnd: pick(lastInspecao?.testeWPCamaraSuperiorFim, jangada.testeWPCamaraSuperiorFim),
    lowerStart: pick(lastInspecao?.testeWPCamaraInferiorInicio, jangada.testeWPCamaraInferiorInicio),
    lowerEnd: pick(lastInspecao?.testeWPCamaraInferiorFim, jangada.testeWPCamaraInferiorFim),
  };

  const checklist = buildQuadroChecklistPayload({
    inspectionChecklistValues: jangada.inspectionChecklistValues || null,
    artigos: (jangada.artigos || []) as never,
    prevArtigos: (lastInspecao?.artigos || []) as never,
    testeWP: wp.testeWP,
    testeNAP: wp.testeNAP,
    testeFS: wp.testeFS,
    testeGI: wp.testeGI,
    testeDL: wp.testeDL,
    hruValidade: jangada.hruValidade,
    hruSerial: jangada.hruReferencia,
    dataInspecao: lastInspecao?.dataInspecao || jangada.dataInspecao,
    cylinderDataTeste: jangada.cylinderDataTeste,
    substituicoes: (lastInspecao?.artigos || []).map((artigo) => ({
      descricao: artigo.descricao ?? artigo.name ?? null,
      referencia: artigo.referencia ?? null,
      quantidade: artigo.quantidade ?? null,
      validade: artigo.validade ? String(artigo.validade) : null,
    })),
  });

  const derived = buildWpDerivedValues({
    pressureUnit: wp.pressureUnit,
    startTime: wp.startTime,
    tempInitial: wp.tempInitial,
    tempFinal: wp.tempFinal,
    baroInitial: wp.baroInitial,
    baroFinal: wp.baroFinal,
    upperStart: wp.upperStart,
    upperEnd: wp.upperEnd,
    lowerStart: wp.lowerStart,
    lowerEnd: wp.lowerEnd,
  });

  checklist.p1_corrigida_superior = derived.upper.correctedEndDisplay || "";
  checklist.p1_corrigida_inferior = derived.lower.correctedEndDisplay || "";
  checklist.queda_real_superior = derived.upper.dropPercentDisplay || "";
  checklist.queda_real_inferior = derived.lower.dropPercentDisplay || "";
  if (!checklist.aprovacao_wp) {
    checklist.aprovacao_wp =
      wp.testeWP && wp.testeWP !== "N/A"
        ? wp.testeWP
        : derived.upper.passes === false || derived.lower.passes === false
          ? "REPROVADO"
          : derived.upper.passes && derived.lower.passes
            ? "APROVADO"
            : "";
  }

  const stampDataUrl = params.stamp === false ? null : getStampDataUrl(params.stampStationCode);
  const technicianSignature = isImageDataUrl(lastInspecao?.signatureBase64) ? lastInspecao.signatureBase64 : undefined;

  return {
    certNumber: lastInspecao?.certificadoNumero || jangada.ultimoCertificadoNumero || "",
    inspectionDate: toDateInput(lastInspecao?.dataInspecao || jangada.dataInspecao),
    shipName: params.shipName || jangada.shipNameManual || "",
    raftModel: jangada.model || "",
    raftSerial: jangada.serial || "",
    status: lastInspecao?.status || "Concluída",
    technician: lastInspecao?.responsavel || "Técnico Autorizado",
    checklist,
    technicianName: lastInspecao?.responsavel || "",
    technicianSignature,
    stampImage: stampDataUrl || undefined,
    clientName: params.ownerName || jangada.owner || "",
  };
}
