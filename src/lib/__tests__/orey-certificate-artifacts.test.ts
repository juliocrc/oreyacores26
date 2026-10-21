import ExcelJS from "exceljs";
import { buildOreyCertificateArtifacts } from "@/lib/orey-certificate-template";
import type { OreyCertificateTemplateInput } from "@/lib/orey-certificate-template";

function buildInput(): OreyCertificateTemplateInput {
  return {
    certNumber: "AZ26-170",
    inspectionDate: "2026-10-14",
    nextInspectionDate: "2027-10-14",
    shipName: "RAINHA DA CALHETA",
    shipFlag: "Portugal",
    shipImo: "1234567",
    shipCallSign: "CQAB",
    owner: "Armador Teste, Lda.",
    brand: "OREY",
    raftModel: "RAFT 12P",
    raftCapacity: 12,
    raftSerial: "SN-0002",
    manufactureDate: "2021-03-01",
    fabricType: "PU",
    packType: "SOLAS A PACK",
    cylinderSerial: "CYL-123",
    cylinderCo2: "5.0",
    cylinderN2: "0.2",
    cylinderHydroTestDate: "2022-01-01",
    hruReference: "HRU-1",
    hruSerial: "HRU-1",
    hruExpiry: "2027-01-01",
    radarReflector: "RR-1",
    radarReflectorExpiry: "2027-01-01",
    technician: "Técnico Teste",
    clientName: "Armador Teste, Lda.",
    status: "Concluída",
    checklist: {
      aprovacao_wp: "APROVADO",
      teste_nap: "YES",
      teste_gi: "NO",
    },
  };
}

describe("buildOreyCertificateArtifacts", () => {
  it("gera o Excel com os mesmos campos do PDF e áreas da estação limpas", async () => {
    const artifacts = await buildOreyCertificateArtifacts(buildInput());
    expect(artifacts.buffer.length).toBeGreaterThan(5000);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(artifacts.buffer as unknown as Parameters<ExcelJS.Xlsx["load"]>[0]);
    const worksheet = workbook.getWorksheet("CERTIFICADO") || workbook.worksheets[0];

    expect(worksheet.getCell("G48").value).toBeNull();
    expect(worksheet.getCell("I61").value).toBeNull();
    expect(worksheet.getCell("B57").value).toBe("Verificar autenticidade");
    expect(String(worksheet.getCell("B58").value || "")).toMatch(/^Hash: [a-f0-9]{16}$/);
    expect(worksheet.getImages().length).toBeGreaterThan(0);
  }, 60000);
});
