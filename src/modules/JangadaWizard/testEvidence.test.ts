import { missingTestEvidence } from './testEvidence';

it('does not ask for measurements for tests not performed', () => {
  expect(missingTestEvidence({ testeWP: 'N/A', testeNAP: '' })).toEqual([]);
});
it('reports missing recorded evidence, accepts zero as a value and never invents times', () => {
  const result = missingTestEvidence({ testeWP: 'PASSOU', wpTempInicio: 0, wpHoraInicio: '10:00' });
  expect(result[0].missing).not.toContain('temperatura inicial');
  expect(result[0].missing).not.toContain('hora inicial');
  expect(result[0].missing).toContain('hora final');
  expect(result[0].missing).toContain('pressão final inferior');
});
