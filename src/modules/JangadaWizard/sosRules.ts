import { isSosRaft } from '@/lib/raft-model-rules';
import { HRU_REFERENCE_CANDIDATES } from '@/lib/stock-reference-rules';

export function isHruItem(item: any): boolean {
  const reference = String(item?.reference || item?.referencia || '').trim().toUpperCase();
  return item?.kind === 'hru' || HRU_REFERENCE_CANDIDATES.some(ref => ref === reference) || /\b(?:HRU|HAMMAR|H20)\b/i.test(
    [item?.type, item?.name, item?.descricao, item?.reference, item?.referencia].filter(Boolean).join(' '),
  );
}

// A working copy only: never clear the source draft or historical database records.
export function withoutSosEquipment<T>(data: T, sos = isSosRaft(data as any)): T {
  if (!sos || !data || typeof data !== 'object') return data;
  const result: any = {};
  for (const [key, value] of Object.entries(data)) {
    if (/^_?(?:hru|hammar|teste|dataUltimoGi)/i.test(key) ||
      /^(?:plastimo_pressure_test|next_gi_date|next_fs_nap_date|gi_rule|fs_nap_rule)/.test(key) ||
      /^(?:cylinderHydroTestDate|cylinderDataTeste|cylinderDataProxTeste|dataTeste|dataProxTeste|nextTestDate)$/.test(key) ||
      /^(?:wp|nap|fsTest|giTest|loadTest|pressureUnit|tempInitial|tempFinal|baroInitial|baroFinal)/.test(key)) continue;
    if (['componentes', 'containerClosureItems', 'artigosSubstituidos', 'substituicoes', 'linhas'].includes(key) && Array.isArray(value)) {
      result[key] = value.filter(item => !isHruItem(item));
    } else if (key === 'packItems' && value && typeof value === 'object') {
      result[key] = Object.fromEntries(Object.entries(value).filter(([, item]) => !isHruItem(item)));
    } else if (key === 'cylinders' && Array.isArray(value)) {
      result[key] = value.map(item => withoutSosEquipment(item, true));
    } else if (['checklist', 'checklistSnapshot', '_articleExpiry', 'orcamento', 'cylinder'].includes(key)) {
      result[key] = withoutSosEquipment(value, true);
    } else result[key] = value;
  }
  return result;
}
