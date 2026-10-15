import { certificatePdfFileName } from "./certificate-pdf";
import {
  buildInspectionCertificateInput,
  type InspecaoForCertificate,
  type JangadaForCertificate,
} from "./certificate-input-from-jangada";
import {
  buildOreyCertificateTemplateInput,
  type JangadaForOreyCertificate,
  type NavioForOreyCertificate,
} from "./orey-certificate-input";
import { buildOreyCertificatePdfBuffer } from "./orey-certificate-pdf";
import type { InspectionCertificateInput } from "./inspection-certificate";
import { withCertificateVerification } from "./certificate-verification";

export type CarimbadoStation = { codigo?: string | null; nome?: string | null } | null | undefined;

/**
 * Gera o certificado carimbado de uma jangada reconstruindo o template OREY
 * (`template certificado orey.xltx`), aplicando o carimbo oficial da estação e
 * escrevendo o nome da estação em texto por cima do carimbo.
 *
 * Centraliza a lógica partilhada pelas rotas de emissão de certificados.
 */
export async function buildCarimbadoCertificatePdf(params: {
  jangada: JangadaForCertificate & JangadaForOreyCertificate;
  lastInspecao?: InspecaoForCertificate | null;
  ship?: NavioForOreyCertificate | null;
  shipName?: string | null;
  ownerName?: string | null;
  station?: CarimbadoStation;
}): Promise<{ buffer: Buffer; input: InspectionCertificateInput; fileName: string }> {
  const { jangada, lastInspecao, ship, shipName, ownerName, station } = params;

  const input = await withCertificateVerification(
    buildInspectionCertificateInput({
      jangada,
      lastInspecao: lastInspecao ?? null,
      shipName: shipName ?? undefined,
      ownerName: ownerName ?? undefined,
      stampStationCode: station?.codigo ?? null,
    }),
  );

  const templateInput = buildOreyCertificateTemplateInput({ raft: jangada, ship, inspection: input });

  const buffer = await buildOreyCertificatePdfBuffer(templateInput, {
    stamp: { imageDataUrl: input.stampImage, stationName: station?.nome ?? "" },
    verification: { qr: input.verificationQr, hash: input.verificationHash },
  });

  return { buffer, input, fileName: certificatePdfFileName(input) };
}
