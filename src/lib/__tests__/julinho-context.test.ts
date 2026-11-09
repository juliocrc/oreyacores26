import { resolveJulinhoFollowUp } from '../julinho/julinho-context';

it('understands a week follow-up only when inspections were the previous topic', () => {
  expect(resolveJulinhoFollowUp('E esta semana?', 'inspections')).toEqual({ query: 'que inspeções de jangadas vencem esta semana', topic: 'inspections' });
  expect(resolveJulinhoFollowUp('E esta semana?', null)).toEqual({ query: 'E esta semana?', topic: null });
});
it('supports follow-ups for tomorrow and next week without personal data', () => {
  expect(resolveJulinhoFollowUp('E amanhã?', 'inspections').query).toContain('vencem amanhã');
  expect(resolveJulinhoFollowUp('E a próxima semana?', 'inspections').query).toContain('próxima semana');
  expect(resolveJulinhoFollowUp('E as vencidas?', 'inspections').query).toContain('estão vencidas');
  expect(resolveJulinhoFollowUp('E amanhã?', null).query).toBe('E amanhã?');
});
it('does not retain personal data or assume a previous subject after a new question', () => {
  expect(resolveJulinhoFollowUp('próximas inspeções', null).topic).toBe('inspections');
  expect(resolveJulinhoFollowUp('cliente António', 'inspections').topic).toBeNull();
});

it('uses a confirmed raft or stock lookup for supported follow-up questions', () => {
  const raft = { kind: 'jangada' as const, term: '5017330300329' };
  const stock = { kind: 'stock-item' as const, term: '20701002' };
  expect(resolveJulinhoFollowUp('E a próxima inspeção?', raft)).toEqual({ query: 'jangada 5017330300329', topic: raft });
  expect(resolveJulinhoFollowUp('E a validade?', stock)).toEqual({ query: 'artigo 20701002', topic: stock });
  expect(resolveJulinhoFollowUp('E a validade?', null).query).toBe('E a validade?');
  expect(resolveJulinhoFollowUp('cliente António', raft).topic).toBeNull();
});
