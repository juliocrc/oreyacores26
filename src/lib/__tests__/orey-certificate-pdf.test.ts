import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildOreyCertificatePdfBuffer } from "@/lib/orey-certificate-pdf";
import { buildOreyCertificateTemplateInput } from "@/lib/orey-certificate-input";
import type { InspectionCertificateInput } from "@/lib/inspection-certificate";

describe("buildOreyCertificatePdfBuffer", () => {
  it("gera um PDF a partir do template OREY (com carimbo e nome de estação)", async () => {
    const inspection: InspectionCertificateInput = {
      certNumber: "AZ26-169",
      inspectionDate: "2026-10-13",
      shipName: "RAINHA DA CALHETA",
      raftModel: "RAFT 12P",
      raftSerial: "SN-0001",
      status: "Concluída",
      technician: "Técnico Teste",
      clientName: "Armador Teste, Lda.",
      checklist: {
        ref_luz_exterior: "30203190",
        validade_luzes_exteriores: "2027-06-01",
        validade_bateria: "2027-06-01",
        ref_agua: "30201010",
        validade_agua: "2027-06-01",
        aprovacao_wp: "APROVADO",
        teste_nap: "YES",
        teste_gi: "NO",
      },
    };

    const templateInput = buildOreyCertificateTemplateInput({
      raft: {
        brand: "OREY",
        model: "RAFT 12P",
        serial: "SN-0001",
        capacity: 12,
        dataFabrico: "2021-03-01",
        dataProxInspecao: "2027-10-13",
        packType: "SOLAS A PACK",
        cylinderSerial: "CYL-123",
        cylinderCo2: "5.0",
        cylinderN2: "0.2",
        cylinderDataTeste: "2022-01-01",
        hruReferencia: "HRU-1",
        hruSerial: "HRU-1",
        hruValidade: "2027-01-01",
        radarReflector: "RR-1",
        radarReflectorValidade: "2027-01-01",
      },
      ship: { nome: "RAINHA DA CALHETA", bandeira: "Portugal", imo: "1234567", callSignal: "CQAB" },
      inspection,
    });

    const buffer = await buildOreyCertificatePdfBuffer(templateInput, {
      stamp: { stationName: "OREY AÇORES - ESTAÇÃO 1" },
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(5000);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const outDir = path.join(os.tmpdir(), "orey-certificado-tests");
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, "certificado-orey-sample.pdf");
    fs.writeFileSync(outFile, buffer);
    // Ajuda a inspeção visual manual durante o desenvolvimento.
    console.log(`[orey-certificate-pdf] PDF de exemplo: ${outFile}`);
  }, 60000);
});
