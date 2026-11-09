/** Never infer redundancy from dates or from another completed inspection. */
export function classifyLocalDraft(draft: any, inspections: unknown): 'redundant' | 'pending' | 'unknown' {
  if (!Array.isArray(inspections) || !draft || !draft.inspecaoId) return 'unknown';
  const inspection = inspections.find((item: any) => Number(item?.id) === Number(draft.inspecaoId));
  if (!inspection) return 'unknown';
  if (draft.hasServerChanges === true) return 'pending';
  const version = draft.editVersions?.expectedUpdatedAt;
  if (draft.hasServerChanges !== false || !version || !inspection.updatedAt ||
      new Date(version).getTime() !== new Date(inspection.updatedAt).getTime()) return 'unknown';
  return ['concluída', 'concluida', 'condenada'].includes(String(inspection.status || '').trim().toLowerCase()) ? 'redundant' : 'pending';
}

export function draftTime(value: unknown): string {
  const date = new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? 'desconhecida' : date.toLocaleString('pt-PT');
}
