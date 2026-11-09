import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import { buildCertificatePayload } from './buildCertificatePayload';
import { buildQuadroInspectionArtifacts, type QuadroTemplateInput } from '@/lib/quadro-template';
import ExcelJS from 'exceljs';

it.each(['mbar', 'hpa', 'inh2o', 'inhg'])('preserva a unidade %s da inspeção até ao quadro', async unit => {
  useJangadaWizardStore.getState().initializeWizard({ id: 195, testeWPUnidadePressao: 'inh2o', testeWPCamaraSuperiorInicio: '218', testeWPCamaraSuperiorFim: '217' }, { id: 42, testeWPUnidadePressao: unit });
  const data = useJangadaWizardStore.getState().inspectionData;
  const payload = buildCertificatePayload(data);
  expect(payload.pressureUnit).toBe(unit);
  expect(payload.wpUpperStart).toBe('218');
  expect(payload.wpUpperEnd).toBe('217');
  const { buffer } = await buildQuadroInspectionArtifacts(payload as QuadroTemplateInput);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<ExcelJS.Xlsx['load']>[0]);
  const value = String(workbook.getWorksheet('QUADRO')!.getCell('D69').value);
  const expected = unit === 'inh2o' ? /inH2O \[ X \]/ : unit === 'inhg' ? /inHg \[ X \]/ : unit === 'mbar' ? /mbar \[ X \]/ : /hPa \[ X \]/;
  expect(value).toMatch(expected);
});
