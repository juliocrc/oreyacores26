import { classifyLocalDraft } from './localDraftStatus';

const inspection = { id: 10, status: 'Concluída', updatedAt: '2026-10-29T10:00:00.000Z' };
const draft = { inspecaoId: 10, hasServerChanges: false, editVersions: { expectedUpdatedAt: inspection.updatedAt } };

it('identifica apenas a versão concluída efetivamente confirmada', () => {
  expect(classifyLocalDraft(draft, [inspection])).toBe('redundant');
  expect(classifyLocalDraft(draft, [{ ...inspection, id: 11 }])).toBe('unknown');
  expect(classifyLocalDraft(draft, [{ ...inspection, updatedAt: '2026-10-29T11:00:00Z' }])).toBe('unknown');
});
it('preserva alterações posteriores e rascunhos em curso', () => {
  expect(classifyLocalDraft({ ...draft, hasServerChanges: true }, [inspection])).toBe('pending');
  expect(classifyLocalDraft(draft, [{ ...inspection, status: 'Draft' }])).toBe('pending');
});
it('não declara redundância sem ligação ou sem evidência de gravação', () => {
  expect(classifyLocalDraft(draft, null)).toBe('unknown');
  expect(classifyLocalDraft({ ...draft, hasServerChanges: undefined }, [inspection])).toBe('unknown');
  expect(classifyLocalDraft({ ...draft, editVersions: {} }, [inspection])).toBe('unknown');
});
