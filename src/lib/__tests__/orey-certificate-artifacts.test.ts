import ExcelJS from "exceljs";
import { buildCertificatePayload } from '@/modules/JangadaWizard/buildCertificatePayload';
import { buildOreyCertificateArtifacts, fillTemplate } from "@/lib/orey-certificate-template";
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
    hruSerial: "H20-987654",
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
  it('leva os testes e o HRU do rascunho até às células do certificado', () => {
    const payload = buildCertificatePayload({ brand: 'RFD', model: 'SeaSava Plus R', serial: 'X', capacity: 8, packType: 'R', dataInspecao: '2026-10-29', hruReference: '20701002', hruSerial: 'HRU-123', hruDataInstalacao: '10/2026', testes: { testeNAP: 'PASSOU', testeGI: 'PASSOU', testeFS: 'PASSOU', testeDL: 'N/A' } } as never);
    const sheet = new ExcelJS.Workbook().addWorksheet('CERTIFICADO');
    fillTemplate(sheet, payload);
    expect(['E41', 'H41', 'J41', 'L41'].map(cell => sheet.getCell(cell).value)).toEqual(['YES', 'YES', 'YES', 'NO']);
    expect(sheet.getCell('G31').value).toBe('20701002');
    expect(sheet.getCell('I31').value).toBe('HRU-123');
    expect(sheet.getCell('K31').value).toBe('10-2028');
  });
  it('transfere os resultados atuais dos testes e os dados reais do HRU para o certificado', () => {
    const sheet = new ExcelJS.Workbook().addWorksheet('CERTIFICADO');
    fillTemplate(sheet, { ...buildInput(), checklist: { testeNAP: 'PASSOU', testeGI: 'PASSOU', testeFS: 'PASSOU', testeDL: 'N/A', teste_gi: 'NO' } });
    expect(['E41', 'H41', 'J41', 'L41'].map(cell => sheet.getCell(cell).value)).toEqual(['YES', 'YES', 'YES', 'NO']);
    expect(['E43', 'H43', 'J43'].map(cell => sheet.getCell(cell).value)).toEqual(['10/26', '10/26', '10/26']);
    expect(sheet.getCell('G31').value).toBe('HRU-1');
    expect(sheet.getCell('I31').value).toBe('H20-987654');
  });
  it('não inventa NAP ou um modelo de HRU quando não foram registados', () => {
    const sheet = new ExcelJS.Workbook().addWorksheet('CERTIFICADO');
    fillTemplate(sheet, { ...buildInput(), hruReference: '', hruSerial: '', checklist: {} });
    expect(sheet.getCell('E41').value).toBe('NO');
    expect(sheet.getCell('G31').value).toBe('');
  });
  it.each([
    ['EUROVINIL', 'EUROVINIL ISO 9650-1', 'EUROVINIL ISO 9650-1'],
    ['EUROVINIL', 'ISO 9650-1', 'EUROVINIL ISO 9650-1'],
    ['RFD', 'SeaSava', 'RFD SeaSava'],
    ['RFD', 'RFD SeaSava', 'RFD SeaSava'],
    ['RFD', 'RFDevice', 'RFD RFDevice'],
    ['DSB', 'DSB LR05', 'DSB LR05'],
    ['DSB', 'LR05', 'DSB LR05'],
    ['VIKING', 'VIKING DK+', 'VIKING DK+'],
  ])('prints brand and model without duplication: %s %s', (brand, raftModel, expected) => {
    const worksheet = new ExcelJS.Workbook().addWorksheet('CERTIFICADO');
    fillTemplate(worksheet, { ...buildInput(), brand, raftModel });
    expect(worksheet.getCell('C13').value).toBe(expected);
  });
  it.each([{ brand: 'OREY', raftModel: 'SOS' }, { brand: 'ALMAR', raftModel: 'SOS' }, { brand: 'SOS', raftModel: 'RAFT' }])('blanks SOS pack and HRU despite historical values: %j', identity => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('CERTIFICADO');
    fillTemplate(worksheet, { ...buildInput(), ...identity, checklist: { teste_nap: 'YES', teste_gi: 'YES', teste_fs: 'YES', teste_dl: 'YES' } });
    for (const address of ['L20', 'E41', 'H41', 'J41', 'L41']) expect(worksheet.getCell(address).value).toBe('N/A');
    for (const address of ['G27', 'I27', 'K27', 'G31', 'I31', 'K31', 'E43', 'H43', 'J43', 'L43']) expect(worksheet.getCell(address).value).toBe('');
  });
  it.each([1, 3])('preserves dates and only removes the annual wording for a %i-year XLSX', async years => {
    const input = { ...buildInput(), nextInspectionDate: `${2026 + years}-10-14` };
    const before = JSON.stringify(input);
    const artifacts = await buildOreyCertificateArtifacts(input);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(artifacts.buffer as unknown as Parameters<ExcelJS.Xlsx['load']>[0]);
    const sheet = workbook.getWorksheet('CERTIFICADO')!;
    expect(sheet.getCell('C48').text).toBe('14/10/2026');
    expect(sheet.getCell('K48').text).toBe(`14/10/${2026 + years}`);
    expect(sheet.getCell('G27').text).toBe(input.packType);
    expect(sheet.getCell('I27').text).toBe(input.raftSerial);
    expect(sheet.getCell('K27').text).toBe(`14/10/${2026 + years}`);
    expect(sheet.getCell('B55').text).toBe(years === 3 ? '' : 'According to SOLAS regulation, this inflatable liferaft requires servicing within 12 months from the date of inspection.');
    expect(sheet.getCell('B56').text).toBe(years === 3 ? '' : 'De acordo com a regulação SOLAS, esta jangada insuflavel requer inspecção dentro de 12 meses a partir da data de inspecção.');
    expect(JSON.stringify(input)).toBe(before);
  }, 60000);
  it.each([
    ['2026-01-01', '2028-12-31', true],
    ['2024-02-29', '2027-02-28', true],
    ['14/10/2026', '14/10/2029', true],
    ['2026-10-14', '2027-10-14', false],
    ['2026-10-14', '', false],
    ['', '2029-10-14', false],
  ])('uses recorded dates rather than SOS identity: %s to %s', (inspectionDate, nextInspectionDate, removed) => {
    const worksheet = new ExcelJS.Workbook().addWorksheet('CERTIFICADO');
    worksheet.getCell('B55').value = 'Annual English wording';
    worksheet.getCell('B56').value = 'Annual Portuguese wording';
    fillTemplate(worksheet, { ...buildInput(), brand: 'ALMAR', raftModel: 'SOS', inspectionDate, nextInspectionDate });
    expect(worksheet.getCell('B55').text).toBe(removed ? '' : 'Annual English wording');
    expect(worksheet.getCell('B56').text).toBe(removed ? '' : 'Annual Portuguese wording');
  });
  it('serializes blank SOS pack and HRU merged blocks even with stale saved equipment', async () => {
    const artifacts = await buildOreyCertificateArtifacts({ ...buildInput(), brand: 'ALMAR', raftModel: 'SOS' });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(artifacts.buffer as unknown as Parameters<ExcelJS.Xlsx['load']>[0]);
    const sheet = workbook.getWorksheet('CERTIFICADO')!;
    for (const row of [27, 28, 31, 32]) {
      for (const column of ['G', 'H', 'I', 'J', 'K', 'L']) expect(sheet.getCell(`${column}${row}`).text).toBe('');
    }
    expect(sheet.getCell('I13').text).toBe('SN-0002');
    expect(sheet.getCell('K48').text).toBe('14/10/2027');
    expect(sheet.getCell('L20').text).toBe('N/A');
    expect(sheet.getCell('B55').text).toContain('12 months');
  }, 60000);
  it("gera o Excel com G48 preenchido e sem alterar os tamanhos de letra do template", async () => {
    const artifacts = await buildOreyCertificateArtifacts(buildInput());
    expect(artifacts.buffer.length).toBeGreaterThan(5000);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(artifacts.buffer as unknown as Parameters<ExcelJS.Xlsx["load"]>[0]);
    const worksheet = workbook.getWorksheet("CERTIFICADO") || workbook.worksheets[0];

    expect(String(worksheet.getCell("G48").value || "")).toContain("50937");
    expect(String(worksheet.getCell("I61").value)).toContain("OREY");
    expect(worksheet.getCell("I62").value).toBe("For authorized servicing station");
    expect(worksheet.getCell("J68").value).toBe("Signature");
    expect(worksheet.getCell("J67").border.bottom?.style).toBeDefined();
    expect(worksheet.getCell("G31").value).toBe("HRU-1");
    for (const address of ["I31", "J31", "I32", "J32"]) {
      expect(worksheet.getCell(address).value).toBe("H20-987654");
    }
    expect(worksheet.getCell("D65").value).toBe("RAINHA DA CALHETA");
    expect(worksheet.getCell("B57").value).toBe("Verificar autenticidade");
    expect(String(worksheet.getCell("B58").value || "")).toMatch(/^Hash: [a-f0-9]{16}$/);
    expect(worksheet.getImages().length).toBeGreaterThan(0);

    expect(worksheet.getCell("A8").font.size).toBe(8);
    expect(worksheet.getCell("I3").font.size).toBe(12);
    expect(worksheet.getCell("I4").font.size).toBe(8);
    expect(worksheet.getCell("I5").font.size).toBe(8);
    expect(worksheet.getCell("B56").font.size).toBe(8);
    expect(worksheet.getCell("B57").font.size).toBe(5);
    expect(worksheet.getCell("B58").font.size).toBe(5);
  }, 60000);
});
