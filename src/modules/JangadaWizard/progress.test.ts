import { getStepProgress } from './progress';
import { getMandatoryPackItemsForRaft } from '../rafts/mandatoryPack';
import type { InspectionData } from './types';

const context = { brand: 'RFD', model: 'Surviva', packType: 'SOLAS A', capacity: 8 };
const definitions = getMandatoryPackItemsForRaft(context);
const dated = definitions.find(item => item.validityFieldName)!;
const undated = definitions.find(item => !item.validityFieldName)!;
const complete = () => Object.fromEntries(definitions.map(item => [item.checklistName, { name: item.label, quantidadeVerificada: item.quantity, quantidade: 0 }]));
function progress(packItems: Record<string, unknown>) {
  return getStepProgress({ ...context, packItems } as unknown as InspectionData).find(step => step.step === 'pack')!;
}
it('identifica zero como quantidade insuficiente, não como campo vazio', () => {
  const items = complete();
  items[undated.checklistName].quantidadeVerificada = 0;
  expect(progress(items).missing).toContain(`${undated.label}: quantidade verificada 0; necessária ${undated.quantity}`);
  expect(progress(items).percent).toBeLessThan(100);
});
it('não exige validade a artigos sem controlo, mas exige-a nos substituídos controlados', () => {
  const items = complete();
  items[undated.checklistName].quantidade = 1;
  expect(progress(items).percent).toBe(100);
  items[dated.checklistName].quantidade = 1;
  expect(progress(items).missing).toContain(`${dated.label}: validade da substituição em falta`);
});
it('não trata artigos obrigatórios ausentes como completos', () => {
  const items = complete();
  delete items[undated.checklistName];
  expect(progress(items).missing).toContain(`${undated.label}: quantidade verificada em falta`);
});
