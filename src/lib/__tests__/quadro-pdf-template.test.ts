import { buildQuadroPDFArtifacts } from '@/lib/quadro-pdf-template';
import { buildQuadroInspectionArtifacts } from '@/lib/quadro-template';
import * as renderer from '@/lib/xlsx-worksheet-render';
import ExcelJS from 'exceljs';
import { buildQuadroChecklistPayload } from '@/lib/quadro-payload';
import { buildCertificatePayload } from '@/modules/JangadaWizard/buildCertificatePayload';
import { useJangadaWizardStore } from '@/modules/JangadaWizard/store/useJangadaWizardStore';
import { buildInspectionCertificateInput } from '@/lib/certificate-input-from-jangada';
import { buildOreyCertificateTemplateInput } from '@/lib/orey-certificate-input';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTemplateBuffer } from '@/lib/template-loader';
import { PDFDocument } from 'pdf-lib';
import { buildQuadroInspectionPdfBuffer } from '@/lib/quadro-pdf';

describe('buildQuadroPDFArtifacts', () => {
  it('mantém SEASAVA PLUS R numa linha no Excel e no PDF', async () => {
    const input = { brand: 'RFD', raftModel: 'SEASAVA PLUS R', raftCapacity: 8 };
    const excel = await buildQuadroInspectionArtifacts(input);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(excel.buffer as unknown as Parameters<ExcelJS.Xlsx['load']>[0]);
    const sheet = workbook.getWorksheet('QUADRO')!;
    const model = sheet.getCell('I7');
    expect(model.value).toBe('SEASAVA PLUS R');
    expect(model.alignment?.wrapText).not.toBe(true);
    expect(model.alignment?.shrinkToFit).toBe(true);
    expect(sheet.getCell('H7').value).toBe('RFD');
    const pdf = await buildQuadroPDFArtifacts(input);
    const operators = [...pdf.buffer.toString('latin1').matchAll(/\(([^()]*)\) Tj/g)].map(match => match[1]);
    expect(operators).toContain('SEASAVA PLUS R');
  });
  it('keeps the complete raft serial on one line in Excel and PDF', async () => {
    const input = { raftSerial: '5017330300329' };
    const excel = await buildQuadroInspectionArtifacts(input);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(excel.buffer as unknown as Parameters<ExcelJS.Xlsx['load']>[0]);
    const serial = workbook.getWorksheet('QUADRO')!.getCell('C7');
    expect(serial.value).toBe(input.raftSerial);
    expect(serial.alignment?.wrapText).not.toBe(true);
    expect(serial.alignment?.shrinkToFit).toBe(true);
    const pdf = await buildQuadroPDFArtifacts(input);
    const textOperators = [...pdf.buffer.toString('latin1').matchAll(/\(([^()]*)\) Tj/g)].map(match => match[1]);
    expect(textOperators).toContain(input.raftSerial);
  });

  it.each([['30410046', 'GIST'], ['99999999', '']])('uses a verified firing-head designation rather than the number %s', async (reference, expected) => {
    const input = { raftSerial: '5017330300329', checklist: { cabeca_disparo: reference } };
    const excel = await buildQuadroInspectionArtifacts(input);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(excel.buffer as unknown as Parameters<ExcelJS.Xlsx['load']>[0]);
    expect(workbook.getWorksheet('QUADRO')!.getCell('C49').value || '').toBe(expected);
    const pdf = await buildQuadroPDFArtifacts(input);
    const operators = [...pdf.buffer.toString('latin1').matchAll(/\(([^()]*)\) Tj/g)].map(match => match[1]);
    expect(operators).not.toContain(reference);
    if (expected) expect(operators).toContain(expected);
  });
  it.each([
    ['mbar', 'inH2O [   ] inHg [   ] mbar [ X ]'],
    ['hpa', 'inH2O [   ] inHg [   ] hPa [ X ]'],
    ['inh2o', 'inH2O [ X ] inHg [   ] mbar [   ]'],
    ['inhg', 'inH2O [   ] inHg [ X ] mbar [   ]'],
    ['', 'inH2O [   ] inHg [   ] mbar [   ]'],
  ])('preserves the merged template pressure selector for %s', async (unit, expected) => {
    const { buffer } = await buildQuadroInspectionArtifacts({ pressureUnit: unit, wpUpperStart: '227', wpUpperEnd: '221' });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<ExcelJS.Xlsx['load']>[0]);
    const sheet = workbook.getWorksheet('QUADRO')!;
    expect(sheet.getCell('D69').value).toBe(expected);
    expect(sheet.getCell('D70').master.address).toBe('D69');
    expect(sheet.getCell('C73').value).toBe('227');
    expect(sheet.getCell('D73').value).toBe('221');
  });

  it('renders the saved mbar selection in the PDF using the same template layout', async () => {
    const { buffer } = await buildQuadroPDFArtifacts({ pressureUnit: 'mbar', wpUpperStart: '227', wpUpperEnd: '221' });
    const text = [...buffer.toString('latin1').matchAll(/\(([^()]*)\) Tj/g)].map(match => match[1]).join('').replace(/\s/g, '');
    expect(text).toContain('inH2O[]inHg[]mbar[X]');
    expect(text).not.toContain('UnidadeWP:');
  });
  it('renders only the Excel QUADRO on one portrait A4 without article annexes', async () => {
    const input = {
      raftSerial: 'DENSE-QUADRO-001', packType: 'SOLAS A',
      inspectionDate: '2026-10-06', nextInspectionDate: '2027-10-06',
      shipName: 'NAVIO DE TESTE COM NOME COMPLETO MUITO LONGO',
      technician: 'Tecnico Responsavel com Nome Completo Muito Longo',
      checklist: Object.fromEntries([
        'farmacia', 'comprimidos', 'paraquedas', 'fachos_mao', 'potes_fumo',
        'luzes_exteriores', 'luz_interior', 'bateria', 'lanterna', 'pilhas_lanterna',
        'agua', 'racoes',
      ].map(key => [`validade_${key}`, '2030-09'])),
      cylinderHydroTestDate: '2026-03',
      substituicoes: Array.from({ length: 24 }, (_, index) => ({
        descricao: `Artigo de substituicao com descricao completa numero ${index}`,
        referencia: `DENSE-REFERENCE-${String(index).padStart(2, '0')}`,
        quantidade: index + 1, validade: '2030-09',
      })),
    };
    const before = JSON.stringify(input);
    const render = jest.spyOn(renderer, 'renderWorksheetToPdf');
    const { buffer } = await buildQuadroPDFArtifacts(input);
    const pdf = await PDFDocument.load(buffer);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPage(0).getWidth()).toBeCloseTo(210 * 72 / 25.4, 1);
    expect(pdf.getPage(0).getHeight()).toBeCloseTo(297 * 72 / 25.4, 1);
    expect(render).toHaveBeenCalledTimes(1);
    expect(render.mock.calls[0][1].name).toBe('QUADRO');
    let bottom = 8.89;
    for (const result of render.mock.results) {
      const layout = result.value as ReturnType<typeof renderer.renderWorksheetToPdf>;
      expect(layout.offsetX).toBeGreaterThanOrEqual(6.35);
      expect(layout.offsetY).toBeGreaterThanOrEqual(bottom - 0.001);
      expect(layout.offsetX + layout.contentWidth * layout.scale).toBeLessThanOrEqual(210 - 6.35 + 0.01);
      bottom = layout.offsetY + layout.contentHeight * layout.scale;
      expect(bottom).toBeLessThanOrEqual(297 - 8.89 + 0.01);
    }
    // Long values can be wrapped into multiple PDF text operators.
    const content = [...buffer.toString('latin1').matchAll(/\(([^()]*)\) Tj/g)]
      .map(match => match[1]).join('').replace(/\s/g, '');
    expect(content).toContain(input.raftSerial);
    expect(content).toContain(input.shipName.replace(/\s/g, ''));
    expect(content).toContain(input.technician.replace(/\s/g, ''));
    input.substituicoes.forEach(article => {
      expect(content).not.toContain(article.referencia);
      expect(content).not.toContain(article.descricao.replace(/\s/g, ''));
    });
    expect(content).toContain('IM.048/02');
    expect(content).not.toContain('RESUMO');
    expect(content).not.toContain('Diasp/Expirar');
    const excel = await buildQuadroInspectionArtifacts(input);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(excel.buffer as unknown as Parameters<ExcelJS.Xlsx['load']>[0]);
    expect(workbook.getWorksheet('Artigos a Expirar')).toBeDefined();
    expect(workbook.getWorksheet('Artigos Substituidos')).toBeDefined();
    expect(JSON.stringify(input)).toBe(before);
  });

  it('keeps the signed-quadro renderer on one portrait A4 page', async () => {
    const buffer = await buildQuadroInspectionPdfBuffer({ raftSerial: 'SIGNED-QUADRO-001' }, {
      stamp: { stationName: 'Estacao de Servico' },
    });
    const pdf = await PDFDocument.load(buffer);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPage(0).getWidth()).toBeCloseTo(210 * 72 / 25.4, 1);
    expect(pdf.getPage(0).getHeight()).toBeCloseTo(297 * 72 / 25.4, 1);
  });

  it.each([
    'R', 'PACK R', 'MIN', 'SIMPLIFICADO MÍNIMO',
    'E', 'PACK E', 'PESCA LOCAL', 'PESCA COSTEIRA', 'SIMPLIFICADO REDUZIDO',
    'REDUZIDO', 'CLASSE E', 'DGRM E', 'LOCAL E', 'COASTAL', 'PACK 2', '<24H',
  ])('removes stale rations from historical %s documents without changing the source', async packType => {
    const jangada = {
      packType, cylinderDataTeste: '2017-06-01',
      inspectionChecklistValues: {
        racoes_alimentares: 'YES', ref_racoes: 'STALE-RATION', qtd_racoes: 8,
        validade_racoes: '2017-06', substituicao_explicita__racoes_alimentares: 8,
      },
      artigos: [{ name: 'Food Rations', referencia: 'STALE-RATION', quantidade: 8, validade: '2017-06' }],
    };
    const original = JSON.stringify(jangada);
    const certificate = buildInspectionCertificateInput({ jangada, preserveSavedChecklist: true, stamp: false });
    expect(certificate.checklist).toMatchObject({ racoes_alimentares: 'NO' });
    const orey = buildOreyCertificateTemplateInput({ raft: jangada, inspection: { ...certificate, checklist: jangada.inspectionChecklistValues } });
    expect(orey.checklist).toMatchObject({ racoes_alimentares: 'NO' });
    for (const key of ['ref_racoes', 'qtd_racoes', 'validade_racoes', 'substituicao_explicita__racoes_alimentares']) {
      expect(certificate.checklist).not.toHaveProperty(key);
      expect(orey.checklist).not.toHaveProperty(key);
      expect(buildQuadroChecklistPayload(jangada)).not.toHaveProperty(key);
    }
    // Also exercise direct exports of unclean archived inputs and reference-only aliases.
    const input = { packType, inspectionDate: '2026-07-01', cylinderHydroTestDate: '2017-06',
      checklist: jangada.inspectionChecklistValues,
      substituicoes: [...jangada.artigos, { name: 'Historical article', referencia: '30202084', quantidade: 1, validade: '2017-06' }],
    };
    const before = JSON.stringify(input);
    const excel = await buildQuadroInspectionArtifacts(input);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(excel.buffer as unknown as Parameters<ExcelJS.Xlsx['load']>[0]);
    const form = workbook.getWorksheet('QUADRO')!;
    expect(form.getCell('E66').value).toBe('☐');
    expect(form.getCell('F66').value || '').toBe('');
    expect(form.getCell('F67').value || '').toBe('');
    expect(form.getCell('I66').value).toBe('06-2017');
    expect(JSON.stringify(workbook.getWorksheet('Artigos a Expirar')!.getSheetValues())).not.toContain('Rações Alimentares');
    expect(workbook.getWorksheet('Artigos Substituidos')).toBeUndefined();
    const render = jest.spyOn(renderer, 'renderWorksheetToPdf');
    await buildQuadroPDFArtifacts(input);
    expect(render).toHaveBeenCalledTimes(1);
    expect(render.mock.calls[0][1].model).toEqual(form.model);
    expect(render.mock.calls[0][1].pageSetup).toEqual(form.pageSetup);
    expect(JSON.stringify(input)).toBe(before);
    expect(JSON.stringify(jangada)).toBe(original);
  });

  it('retains applicable SOLAS A ration data and clears empty template expiry cells', async () => {
    const input = { packType: 'SOLAS A', checklist: { racoes_alimentares: 'YES', ref_racoes: 'FOOD', qtd_racoes: 6, validade_racoes: '2030-09' } };
    expect(buildQuadroChecklistPayload({ packType: input.packType, inspectionChecklistValues: input.checklist })).toMatchObject(input.checklist);
    const excel = await buildQuadroInspectionArtifacts(input);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(excel.buffer as unknown as Parameters<ExcelJS.Xlsx['load']>[0]);
    expect(workbook.worksheets[0].getCell('F67').value).toBe('09-2030');
    expect(JSON.stringify(workbook.getWorksheet('Artigos a Expirar')!.getSheetValues())).toContain('Rações Alimentares');
    const empty = await buildQuadroInspectionArtifacts({ cylinderHydroTestDate: '2017-06' });
    await workbook.xlsx.load(empty.buffer as unknown as Parameters<ExcelJS.Xlsx['load']>[0]);
    expect(workbook.worksheets[0].getCell('F67').value || '').toBe('');
    expect(workbook.worksheets[0].getCell('I66').value).toBe('06-2017');
  });

  it('preserves unknown/custom pack selections and does not mistake water rations for food', () => {
    const saved = { racoes_alimentares: 'YES', ref_racoes: 'CUSTOM', qtd_racoes: 2, validade_racoes: '2031-08' };
    expect(buildQuadroChecklistPayload({ packType: 'CUSTOM', inspectionChecklistValues: saved })).toMatchObject(saved);
    const waterOnly = buildQuadroChecklistPayload({ packType: 'SOLAS A', artigos: [
      { name: 'Water Rations', referencia: '30202085', validade: '2033-02', quantidade: 8 },
    ] });
    expect(waterOnly.racoes_alimentares).toBe('NO');
    expect(waterOnly).not.toHaveProperty('validade_racoes');
  });

  it('carries saved ficha light values through the real XLSX/PDF without mutation or cross-export leaks', async () => {
    const jangada = {
      serial: 'DOC-REVIEW-SYNTHETIC', cylinderDataTeste: '2026-03-01',
      inspectionChecklistValues: {
        validade_luz_exterior: '2030-09', ref_luz_exterior: 'EXT-TEST', qtd_luz_exterior: 2,
        luz_exterior_bateria: 'YES', validade_luz_interior: '2031-02',
        ref_luz_interior: 'INT-TEST', qtd_luz_interior: 3, luz_interior_bateria: 'NO',
        validade_bateria: '2032-04', ref_bateria_litio: 'LIT-TEST', qtd_bateria_litio: 4,
        bateria_litio: 'YES', cobertura_exterior: true,
      },
    };
    const lastInspecao = { dataInspecao: '2026-07-01', dataProxInspecao: '2027-07-01', responsavel: 'Iuri Rebelo' };
    const original = JSON.stringify(jangada);
    const certificate = buildInspectionCertificateInput({ jangada, lastInspecao, stamp: false });
    const input = { ...buildOreyCertificateTemplateInput({ raft: jangada, inspection: certificate }),
      serviceStationCode: 'LIS', serviceStationName: 'Lisboa', technician: certificate.technician,
      checklist: certificate.checklist as Record<string, string>,
    };
    const originalInput = JSON.stringify(input);
    const excel = await buildQuadroInspectionArtifacts(input);
    const render = jest.spyOn(renderer, 'renderWorksheetToPdf');
    const pdf = await buildQuadroPDFArtifacts(input);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(excel.buffer as unknown as Parameters<ExcelJS.Xlsx['load']>[0]);
    const form = workbook.getWorksheet('QUADRO')!;
    const template = new ExcelJS.Workbook();
    await template.xlsx.load(await loadTemplateBuffer('template quadro.xlsx') as unknown as Parameters<ExcelJS.Xlsx['load']>[0]);
    const originalForm = template.getWorksheet('QUADRO')!;
    for (const address of ['F24', 'F25', 'F26']) {
      expect(originalForm.getCell(address).master.address).toBe(address);
    }
    expect(form.getCell('F24').value).toBe('(4) LIT-TEST');
    expect(form.getCell('F26').value).toEqual(originalForm.getCell('F26').value);
    expect(render.mock.calls[0][1].model).toEqual(form.model);
    expect(form.getCell('C29').value).toBe('09-2030');
    expect(form.getCell('F23').value).toBe('02-2031');
    expect(form.getCell('F25').value).toBe('04-2032');
    expect(form.getCell('I66').value).toBe('03-2026');
    expect(form.getCell('C81').value).toBe('OREY TÉCNICA – 50374');
    expect(form.getCell('H81').value).toBe('Iuri Rebelo');
    const rows = workbook.getWorksheet('Artigos a Expirar')!.getSheetValues() as ExcelJS.CellValue[][];
    const validitySheet = workbook.getWorksheet('Artigos a Expirar')!;
    const summary = rows.findIndex(row => row?.[1] === 'RESUMO');
    expect(validitySheet.getCell(summary, 2).value).toBe('Total: 4 | Expirados: 0 | Críticos (<=30d): 0 | Atenção (<=90d): 0 | OK: 4');
    expect(validitySheet.getCell(summary, 6).master.address).toBe(`B${summary}`);
    expect(validitySheet.getCell(summary, 2).alignment.wrapText).toBe(true);
    for (const [label, reference, quantity, expiry] of [
      ['Luz Exterior / Bateria', 'EXT-TEST', 2, '09-2030'],
      ['Luz Interior / Bateria', 'INT-TEST', 3, '02-2031'],
      ['Bateria de Lítio', 'LIT-TEST', 4, '04-2032'],
    ]) {
      expect(rows.find(row => row?.[1] === label)?.slice(1, 5)).toEqual([label, reference, quantity, expiry]);
    }
    expect(JSON.stringify(jangada)).toBe(original);
    expect(JSON.stringify(input)).toBe(originalInput);
    const next = await buildQuadroInspectionArtifacts({ serviceStationCode: 'AZ', checklist: {} });
    const other = new ExcelJS.Workbook();
    await other.xlsx.load(next.buffer as unknown as Parameters<ExcelJS.Xlsx['load']>[0]);
    expect(other.worksheets[0].getCell('C81').value).toBe('OREY TÉCNICA – 50937');
    for (const address of ['C29', 'F23', 'F24', 'F25', 'H81']) expect(other.worksheets[0].getCell(address).value || '').toBe('');
    const dir = join(tmpdir(), 'opencode', 'quadro-review');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'synthetic-quadro.xlsx'), excel.buffer);
    writeFileSync(join(dir, 'synthetic-quadro.pdf'), pdf.buffer);
  }, 30000);
  it('keeps hydraulic test date on the form but expires it five years later, with distinct light validities', async () => {
    const input = {
      inspectionDate: '2026-07-01', nextInspectionDate: '2027-07-01',
      cylinderHydroTestDate: '2026-03', technician: 'Iuri Rebelo',
      serviceStationCode: 'LIS', serviceStationName: 'Lisboa',
      checklist: { cyl_test_val: '2026-03', validade_luzes_exteriores: '2030-09', validade_luz_interior: '2031-02', validade_bateria: '2032-04' },
    };
    const excel = await buildQuadroInspectionArtifacts(input);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(excel.buffer as unknown as Parameters<ExcelJS.Xlsx['load']>[0]);
    const form = workbook.getWorksheet('QUADRO')!;
    expect(form.getCell('I66').value).toBe('03-2026');
    expect(form.getCell('C29').value).toBe('09-2030');
    expect(form.getCell('F23').value).toBe('02-2031');
    expect(form.getCell('F25').value).toBe('04-2032');
    expect(form.getCell('C81').value).toBe('OREY TÉCNICA – 50374');
    expect(form.getCell('H81').value).toBe('Iuri Rebelo');
    const rows = workbook.getWorksheet('Artigos a Expirar')!.getSheetValues() as ExcelJS.CellValue[][];
    expect(rows.find(row => row?.[1] === 'Teste Hidráulico Cilindro')).toEqual(expect.arrayContaining(['03-2031', 'OK']));
    expect(rows.find(row => row?.[1] === 'Luz Exterior / Bateria')).toEqual(expect.arrayContaining(['09-2030', 'OK']));
    expect(rows.find(row => row?.[1] === 'Bateria de Lítio')).toEqual(expect.arrayContaining(['04-2032', 'OK']));
    const render = jest.spyOn(renderer, 'renderWorksheetToPdf');
    await buildQuadroPDFArtifacts(input);
    expect(render.mock.calls[0][1].getCell('C29').value).toBe(form.getCell('C29').value);
    expect(render.mock.calls[0][1].getCell('H81').value).toBe('Iuri Rebelo');
  });
  it.each([
    [{ cylinderSistema: 'GIST', inspectionChecklistValues: { cabeca_disparo: '06721009' } }, 'DK94'],
    [{ cylinderCabecaDisparoDescricao: 'Custom head ABC', cylinderCabecaDisparoRef: '08426009' }, 'Custom head ABC'],
    [{ cylinderSistema: 'THANNER DK99 / DK96' }, ''],
  ])('preserves saved or explicit heads in actual XLSX C49: %j', async (source, expected) => {
    const checklist = buildQuadroChecklistPayload(source) as Record<string, string>;
    const excel = await buildQuadroInspectionArtifacts({ checklist });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(excel.buffer as unknown as Parameters<ExcelJS.Xlsx['load']>[0]);
    expect(workbook.worksheets[0].getCell('C49').value ?? '').toBe(expected);
  });

  it('exports the wizard selected head as VTE99 in actual XLSX C49', async () => {
    const previous = useJangadaWizardStore.getState();
    try {
      previous.initializeWizard({ cylinderCabecaDisparoRef: '10388043', cylinderSistema: 'GIST' });
      const payload = buildCertificatePayload(useJangadaWizardStore.getState().inspectionData);
      const excel = await buildQuadroInspectionArtifacts(payload);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(excel.buffer as unknown as Parameters<ExcelJS.Xlsx['load']>[0]);
      expect(workbook.worksheets[0].getCell('C49').value).toBe('VTE99');
    } finally {
      useJangadaWizardStore.setState(previous, true);
    }
  });

  it.each([
    ['08426009', 'GIST'], ['08008009', 'DK99'], ['06721009', 'DK94'], ['10388043', 'VTE99'],
    ['Z5943', 'DK96'], ['GISTW', 'GISTW'],
  ])('writes the selected head designation in exported XLSX C49: %s', async (reference, expected) => {
    const checklist = buildQuadroChecklistPayload({
      cylinderCabecaDisparoRef: reference,
      cylinderSistema: 'THANNER DK99 / DK96',
      inspectionChecklistValues: { cabeca_disparo: 'stale' },
    }) as Record<string, string>;
    const excel = await buildQuadroInspectionArtifacts({ checklist });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(excel.buffer as unknown as Parameters<ExcelJS.Xlsx['load']>[0]);
    expect(workbook.worksheets[0].getCell('C49').value).toBe(expected);
  });

  it('normalizes persisted checklist references in C49 for XLSX and PDF', async () => {
    const input = { checklist: { cabeca_disparo: '08211009' } };
    const excel = await buildQuadroInspectionArtifacts(input);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(excel.buffer as unknown as Parameters<ExcelJS.Xlsx['load']>[0]);
    expect(workbook.worksheets[0].getCell('C49').value).toBe('GIST');
    const render = jest.spyOn(renderer, 'renderWorksheetToPdf');
    await buildQuadroPDFArtifacts(input);
    expect(render.mock.calls[0][1].getCell('C49').value).toBe('GIST');
    expect(input.checklist.cabeca_disparo).toBe('08211009');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([false, true])('generates a PDF with substitutions: %s', async (withSubstitutions) => {
    const log = jest.spyOn(console, 'log');
    const render = jest.spyOn(renderer, 'renderWorksheetToPdf');
    const { buffer, fileName } = await buildQuadroPDFArtifacts({
      raftSerial: 'SN/001',
      inspectionDate: '2026-10-06',
      technician: 'Tecnico Responsavel da Inspecao',
      checklist: {},
      substituicoes: withSubstitutions
        ? [{ descricao: 'Lanterna', referencia: 'TORCH-WATERPROOF', quantidade: 1 }]
        : [],
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(5000);
    expect(fileName).toBe('SN 001 - 2026_quadro.pdf');
    expect((await PDFDocument.load(buffer)).getPageCount()).toBe(1);
    expect(buffer.toString('latin1')).not.toContain('RESUMO');
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('could not fit page'));
    const worksheet = render.mock.calls[0][1];
    expect(worksheet.getCell('H81').value).toBe('Tecnico Responsavel da Inspecao');
    expect(worksheet.getCell('J82').master.address).toBe('H81');
    expect(worksheet.pageSetup.printArea).toBe('B2:J84');
    expect(renderer.computeWorksheetLayout(worksheet)).toMatchObject({ minCol: 2, maxCol: 10, minRow: 2, maxRow: 84 });
    expect(render).toHaveBeenCalledTimes(1);
    if (withSubstitutions) {
      expect(buffer.toString('latin1')).not.toContain('TORCH-WATERPROOF');
    }
  });

  it('renders the exact cells, styles and page setup emitted in the Excel workbook', async () => {
    const input = {
      technician: 'Tecnico com Nome Completo Muito Longo',
      inspectionDate: '2026-10-06',
      raftSerial: '5017210100016',
      shipName: 'NAVIO DE TESTE COM NOME COMPLETO MUITO LONGO',
      serviceStationName: 'ESTACAO DE SERVICO DE TESTE COM NOME MUITO LONGO',
      checklist: { cobertura_exterior: true },
    };
    const excel = await buildQuadroInspectionArtifacts(input);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(excel.buffer as unknown as Parameters<ExcelJS.Xlsx['load']>[0]);
    const originalRender = renderer.renderWorksheetToPdf;
    const sheets = [workbook.getWorksheet('QUADRO')!];
    let index = 0;
    jest.spyOn(renderer, 'renderWorksheetToPdf').mockImplementation((doc, worksheet, source, options) => {
      expect(worksheet.model).toEqual(sheets[index++].model);
      return originalRender(doc, worksheet, source, options);
    });
    const pdf = await buildQuadroPDFArtifacts(input);
    expect(index).toBe(sheets.length);
    const technicianCell = workbook.worksheets[0].getCell('H81');
    expect(technicianCell.value).toBe(input.technician);
    expect(technicianCell.alignment).toMatchObject({ wrapText: true, shrinkToFit: true });
    expect(workbook.worksheets[0].model.merges).toContain('H81:J82');
    const form = workbook.worksheets[0];
    expect(form.getCell('C7').value).toBe(input.raftSerial);
    expect(form.getCell('E7').value).toBe(input.shipName);
    for (const address of ['C7', 'E7', 'C81', 'H81', 'B17', 'D17', 'G17']) {
      expect(form.getCell(address).alignment.shrinkToFit).toBe(true);
    }
    const template = new ExcelJS.Workbook();
    await template.xlsx.load(await loadTemplateBuffer('template quadro.xlsx') as unknown as Parameters<ExcelJS.Xlsx['load']>[0]);
    for (let row = 9; row <= 66; row++) {
      for (const column of ['B', 'D', 'G']) {
        const cell = form.getCell(`${column}${row}`);
        if (typeof cell.value !== 'string' || (cell.isMerged && cell.master !== cell)) continue;
        expect(cell.alignment.shrinkToFit).toBe(true);
        expect(Boolean(cell.alignment.wrapText)).toBe(Boolean(template.worksheets[0].getCell(cell.address).alignment.wrapText));
      }
    }
    const dir = join(tmpdir(), 'opencode', 'quadro-review');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'long-names-quadro.xlsx'), excel.buffer);
    writeFileSync(join(dir, 'long-names-quadro.pdf'), pdf.buffer);
  });
});
