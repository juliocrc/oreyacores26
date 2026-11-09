import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildOreyCertificatePdfBuffer } from "@/lib/orey-certificate-pdf";
import { buildOreyCertificateTemplateInput } from "@/lib/orey-certificate-input";
import type { InspectionCertificateInput } from "@/lib/inspection-certificate";
import * as renderer from '@/lib/xlsx-worksheet-render';
import { buildCertificatePayload } from '@/modules/JangadaWizard/buildCertificatePayload';
import { useJangadaWizardStore } from '@/modules/JangadaWizard/store/useJangadaWizardStore';

describe("buildOreyCertificatePdfBuffer", () => {
  it.each(['historical', 'wizard'])('draws blank SOS pack/HRU cells and no annual wording for a three-year %s certificate', async source => {
    const raft = {
      brand: 'ALMAR', model: 'SOS', serial: 'SOS-HISTORY-001', packType: 'Sem pack',
      dataProxInspecao: '2029-10-14', hruReferencia: 'STALE-HRU',
      hruSerial: 'STALE-HRU-SERIAL', hruValidade: '2027-05-01',
    };
    const inspection = { inspectionDate: '2026-10-14', certNumber: 'AZ26-SOS' };
    const input = source === 'historical'
      ? buildOreyCertificateTemplateInput({ raft, inspection })
      : buildCertificatePayload({ ...useJangadaWizardStore.getState().inspectionData, ...raft, dataInspecao: inspection.inspectionDate,
          certificadoNumero: inspection.certNumber, hruReference: raft.hruReferencia,
          hruExpiry: raft.hruValidade });
    const before = JSON.stringify(input);
    const originalRender = renderer.renderWorksheetToPdf;
    const render = jest.spyOn(renderer, 'renderWorksheetToPdf').mockImplementation((doc, ...args) => {
      jest.spyOn(doc, 'text');
      return originalRender(doc, ...args);
    });
    try {
      const buffer = await buildOreyCertificatePdfBuffer(input);
      const doc = render.mock.calls[0][0];
      const layout = render.mock.results[0].value as ReturnType<typeof originalRender>;
      const calls = (doc.text as jest.Mock).mock.calls;
      for (const [top, bottom] of [[27, 28], [31, 32]]) {
        const rect = layout.cellRect(top, 7, bottom, 12);
        const drawn = calls.filter(([, x, y]) => x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h);
        expect(drawn).toEqual([]);
      }
      const text = calls.map(([value]) => Array.isArray(value) ? value.join(' ') : value).join(' ');
      expect(text).not.toMatch(/According to SOLAS|De acordo|12 months|12 meses|Sem pack|STALE-HRU/);
      expect(text).toContain('14/10/2026');
      expect(text).toContain('14/10/2029');
      expect(text).toContain(raft.serial);
      expect(text).toContain('N/A');
      expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(JSON.stringify(input)).toBe(before);
    } finally {
      jest.restoreAllMocks();
    }
  }, 60000);

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
      stamp: {
        stationName: "OREY AÇORES - ESTAÇÃO 1",
        imageDataUrl: `data:image/jpeg;base64,${fs.readFileSync(path.join(process.cwd(), "public", "carimbooreyazores.jpg")).toString("base64")}`,
      },
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(5000);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const outDir = path.join(os.tmpdir(), "opencode", "orey-certificado-tests");
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, "certificado-orey-sample.pdf");
    fs.writeFileSync(outFile, buffer);
    // Ajuda a inspeção visual manual durante o desenvolvimento.
    console.log(`[orey-certificate-pdf] PDF de exemplo: ${outFile}`);
  }, 60000);
});
