import ExcelJS from 'exceljs';
import { buildQuadroInspectionArtifacts, loadFilledQuadroWorkbook } from '@/lib/quadro-template';
import { buildQuadroPDFArtifacts } from '@/lib/quadro-pdf-template';
import * as renderer from '@/lib/xlsx-worksheet-render';
import { buildCertificatePayload } from '@/modules/JangadaWizard/buildCertificatePayload';
import type { InspectionData } from '@/modules/JangadaWizard/types';
import { buildQuadroChecklistPayload } from '@/lib/quadro-payload';
import { buildInspectionCertificateInput, resolveInspectionTechnician } from '@/lib/certificate-input-from-jangada';

jest.mock('@/lib/certificate-stamp', () => ({ getStampDataUrl: () => null }));

const replacementKey = 'substituicao_explicita__comprimidos_p_enjoo';

describe('QUADRO replacement cells', () => {
  it.each<Record<string, string | number | boolean>>([{}, { comprimidos_enjoo: 'NO' }, {
    comprimidos_enjoo: 'YES', ref_comprimidos: 'EXISTING', qtd_comprimidos: 12,
  }, {
    comprimidos_enjoo: false, ref_comprimidos: 'STALE', qtd_comprimidos: 0, [replacementKey]: 1,
  }])('clears the template example without inventing a replacement: %j', async checklist => {
    const { worksheet } = await loadFilledQuadroWorkbook({ checklist, substituicoes: [] });
    expect(worksheet.getCell('I15').text).toBe('');
  });

  it('uses saved zero replacement quantities without losing existing expiry', async () => {
    const checklist = buildQuadroChecklistPayload({
      inspectionChecklistValues: {
        comprimidos_enjoo: 'NO', ref_comprimidos: 'STALE', [replacementKey]: 1,
        validade_comprimidos: '2030-09',
        _articleExpiry: { packItems: {
          tablets: { name: 'Comprimidos p/ Enjoo', quantidade: 0, quantidadeVerificada: 12 },
        } },
      },
    });
    const before = JSON.stringify(checklist);
    const { worksheet } = await loadFilledQuadroWorkbook({ checklist: checklist as never });
    expect(worksheet.getCell('I15').text).toBe('');
    expect(worksheet.getCell('J15').text).toBe('09-2030');
    expect(JSON.stringify(checklist)).toBe(before);
  });

  it('does not confuse presence with replacement and keeps the actual applied reference', async () => {
    const { worksheet } = await loadFilledQuadroWorkbook({
      checklist: { comprimidos_enjoo: 'NO' },
      substituicoes: [{ descricao: 'Seasickness Tablets', referencia: 'ACTUAL-LOT-REF', quantidade: 3, validade: '2031-04' }],
    });
    expect(worksheet.getCell('I15').text).toBe('(3) ACTUAL-LOT-REF');
    expect(worksheet.getCell('J15').text).toBe('04-2031');
  });

  it('overwrites stale wizard replacement flags when the applied quantity becomes zero', async () => {
    const payload = buildCertificatePayload({
      brand: 'DSB', model: 'LR07', packType: 'SOLAS B', capacity: 6,
      checklist: { comprimidos_enjoo: 'NO', [replacementKey]: 4, qtd_comprimidos: 4 },
      packItems: { tablets: { name: 'Comprimidos p/ Enjoo', quantidade: 0, quantidadeVerificada: 6, validade: '2030-09' } },
    } as unknown as InspectionData);
    expect(payload.checklist[replacementKey]).toBe(0);
    expect(payload.substituicoes).toEqual([]);
    const { worksheet } = await loadFilledQuadroWorkbook(payload);
    expect(worksheet.getCell('I15').text).toBe('');
    expect(worksheet.getCell('J15').text).toBe('09-2030');
  });

  it('renders the same cleared cells, expiry and merged technician footer in PDF and XLSX', async () => {
    const input = { technician: 'Saved Inspector', serviceStationName: 'Historical Station',
      checklist: { comprimidos_enjoo: 'NO', validade_comprimidos: '2030-09' } };
    const excel = await buildQuadroInspectionArtifacts(input);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(excel.buffer as unknown as Parameters<ExcelJS.Xlsx['load']>[0]);
    const sheet = workbook.getWorksheet('QUADRO')!;
    expect(sheet.getCell('I15').text).toBe('');
    expect(sheet.getCell('H81').text).toBe('Saved Inspector');
    expect(sheet.getCell('J82').master.address).toBe('H81');
    expect(sheet.getCell('C81').text).toBe('Historical Station');
    const render = jest.spyOn(renderer, 'renderWorksheetToPdf');
    try {
      await buildQuadroPDFArtifacts(input);
      const pdfSheet = render.mock.calls[0][1];
      for (const cell of ['H14', 'I15', 'J15', 'H81', 'J82', 'C81']) {
        expect(pdfSheet.getCell(cell).text).toBe(sheet.getCell(cell).text);
      }
    } finally { render.mockRestore(); }
  });
});

describe('saved inspection technician', () => {
  it('prefers the exact recorded responsible, then snapshot, then technician relation', () => {
    expect(resolveInspectionTechnician({ responsavel: ' Original ', tecnico: { nome: 'Other' } })).toBe('Original');
    expect(resolveInspectionTechnician({ checklistSnapshot: { responsavel: ' Archived ' }, tecnico: { nome: 'Other' } })).toBe('Archived');
    expect(resolveInspectionTechnician({ responsavel: ' ', tecnico: { nome: ' Related Inspector ' } })).toBe('Related Inspector');
    const input = buildInspectionCertificateInput({ jangada: {}, lastInspecao: { tecnico: { nome: 'Historical Inspector' } }, stamp: false });
    expect(input.technician).toBe('Historical Inspector');
    expect(input.technicianName).toBe('Historical Inspector');
  });
});
