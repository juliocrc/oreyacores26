import type { ChecklistItem, InspectionData } from './types';

export const ALL_CHECKLIST_IDS = [
  'cobertura_exterior', 'saida_antena', 'refletores', 'tubo_identificacao', 'costuras_juntas', 'camara_fundos', 'sistema_endireitar', 'bolsas_estabilizacao', 'luz_exterior_bateria', 'escada_borda', 'grinalda_espelhos', 'weak_link_painter',
  'escada_entrada', 'grinalda_interior', 'anel_linha', 'faca_seguranca', 'cobertura_interior', 'fecho_cobertura', 'colectores_agua', 'manual_instrucoes', 'tecido_camara_fundo', 'luz_interior_bateria',
  'container_estado', 'fitas_fecho', 'selo_hermetico', 'humidade_interior', 'etiqueta_servico', 'painter_reserva',
];

export const isChecklistUnassessed = (status?: string) => !status || status === 'POR_VERIFICAR';

export function markUnassessedChecklistOk(checklist: Record<string, ChecklistItem>, items: { id: string }[]) {
  const updated = { ...checklist };
  let changed = 0;
  for (const { id } of items) {
    if (!isChecklistUnassessed(updated[id]?.status)) continue;
    updated[id] = { ...updated[id], status: 'OK' };
    changed++;
  }
  return { checklist: updated, changed };
}

export function getChecklistCompletionErrors(data: Pick<InspectionData, 'checklist' | 'abate'>): string[] {
  // Abate is a non-conforming completion, not an approval of the checklist.
  if (data.abate?.ativo) return [];
  const checklist = data.checklist || {};
  const errors = ALL_CHECKLIST_IDS
    .filter((id) => !['OK', 'NA', 'N/A', 'SUBSTITUIDO', 'REPROVADO'].includes(checklist[id]?.status || ''))
    .map(id => `${id.replace(/_/g, ' ')}: por verificar.`);
  for (const [id, item] of Object.entries(checklist)) {
    if (item?.status === 'REPROVADO' && !item.justificacaoNaoSubstituicao?.trim()) {
      errors.push(`${id.replace(/_/g, ' ')}: REPROVADO, sem justificação de não substituição.`);
    }
  }
  return errors;
}

export function getChecklistExceptionWarnings(data: Pick<InspectionData, 'checklist'>): string[] {
  return Object.entries(data.checklist || {})
    .filter(([, item]) => item?.status === 'REPROVADO' && item.justificacaoNaoSubstituicao?.trim())
    .map(([id, item]) => `${id.replace(/_/g, ' ')}: REPROVADO, não substituído. Justificação: ${item.justificacaoNaoSubstituicao!.trim()}. A conclusão não declara conformidade deste item.`);
}
