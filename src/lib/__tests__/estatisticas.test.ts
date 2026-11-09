import { buildBrandRaftStatistics, buildMonthlyTrend, classifyInspectionStatus, classifyTestResult, testPercentages } from '../estatisticas';

it('groups real records by canonical brand, model and numeric capacity without losing unknowns', () => {
  const rafts = [
    { brand: ' sea safe ', model: 'KHYJF6', capacity: 10 },
    { brand: 'SEA-SAFE', model: 'KHYJF-6', capacity: 10 },
    { brand: 'SEA-SAFE', model: 'KHYJF6', capacity: 4 },
    { brand: 'SEA-SAFE', model: 'KHYJF6', capacity: 25 },
    { brand: 'SEA-SAFE', model: 'KHYJF6', capacity: 0 },
    { brand: 'SEA-SAFE', model: '', capacity: null },
    { brand: ' eurivinil ', model: 'custom model', capacity: 6 },
    { brand: '', model: null, capacity: -1 },
    { brand: null, model: null, capacity: null },
  ];
  const result = buildBrandRaftStatistics(rafts);
  expect(result[0]).toEqual({ brand: 'SEA-SAFE', count: 6, models: [
    { model: 'KHYJF-6', capacity: 4, count: 1 },
    { model: 'KHYJF-6', capacity: 10, count: 2 },
    { model: 'KHYJF-6', capacity: 25, count: 1 },
    { model: 'KHYJF-6', capacity: null, count: 1 },
    { model: 'Modelo desconhecido', capacity: null, count: 1 },
  ] });
  expect(result).toContainEqual({ brand: 'EUROVINIL', count: 1, models: [{ model: 'CUSTOM MODEL', capacity: 6, count: 1 }] });
  expect(result).toContainEqual({ brand: 'Marca desconhecida', count: 2, models: [{ model: 'Modelo desconhecido', capacity: null, count: 2 }] });
  expect(result.reduce((sum, row) => sum + row.count, 0)).toBe(rafts.length);
  for (const row of result) expect(row.models.reduce((sum, model) => sum + model.count, 0)).toBe(row.count);
});

it('uses pack, serial and legacy identity rules rather than inventing catalog capacities', () => {
  expect(buildBrandRaftStatistics([
    { brand: 'RFD', model: 'SESAVA PLUS', capacity: 6, packType: 'R' },
    { brand: 'ARIMAR', model: 'old model', capacity: 8, serial: 'AO123' },
    { brand: 'RFD', model: 'ALMAR', capacity: 4 },
  ])).toEqual(expect.arrayContaining([
    { brand: 'RFD', count: 1, models: [{ model: 'SEASAVA PLUS R', capacity: 6, count: 1 }] },
    { brand: 'ARIMAR', count: 1, models: [{ model: 'SOS', capacity: 8, count: 1 }] },
    { brand: 'ALMAR', count: 1, models: [{ model: 'STD', capacity: 4, count: 1 }] },
  ]));
});

it('keeps every brand beyond eight and handles an empty park', () => {
  expect(buildBrandRaftStatistics([])).toEqual([]);
  expect(buildBrandRaftStatistics(Array.from({ length: 12 }, (_, i) => ({ brand: `Brand ${i}`, model: 'M', capacity: 6 })))).toHaveLength(12);
});

it.each(['Concluída', 'concluida', ' completed '])('recognizes completed status %s', state => {
  expect(classifyInspectionStatus(state)).toBe('completed');
});

it.each(['Condenada', 'Cancelada', 'Pendente', 'Em Curso', '', null, 'not completed'])('does not count %s as completed', state => {
  expect(classifyInspectionStatus(state)).not.toBe('completed');
});

it.each(['PASSOU', 'APROVOU', 'APROVADO', 'PASS', 'OK', 'SIM'])('recognizes passing result %s', result => {
  expect(classifyTestResult(result)).toBe('pass');
});

it.each(['REPROVOU', 'REPROVADO', 'FAIL', 'NÃO', 'NÃO OK', 'NOT OK'])('recognizes failing result %s', result => {
  expect(classifyTestResult(result)).toBe('fail');
});

it.each(['N/A', 'Não aplicável', 'Não realizado', 'NOT PASSED', '', null])('does not invent a result for %s', result => {
  expect(classifyTestResult(result)).toBe('na');
});

it('excludes NA from approval rates, including all-NA samples', () => {
  expect(testPercentages({ pass: 3, fail: 1, na: 96 })).toEqual({ total: 4, passPct: 75, failPct: 25 });
  expect(testPercentages({ pass: 0, fail: 0, na: 12 })).toEqual({ total: 0, passPct: 0, failPct: 0 });
});

it('returns exactly twelve calendar months with zeros and parses civil dates', () => {
  const trend = buildMonthlyTrend(['2025-10-01', '2025-11-01', '01/12/2025', '2026-01', '2026-02-31', '2026-10-25', '2026-11-01', 'garbage'], new Date('2026-10-25T12:00:00Z'));
  expect(trend).toHaveLength(12);
  expect(trend[0]).toEqual({ month: '2025-11', count: 1 });
  expect(trend[1]).toEqual({ month: '2025-12', count: 1 });
  expect(trend[2]).toEqual({ month: '2026-01', count: 1 });
  expect(trend[3]).toEqual({ month: '2026-02', count: 0 });
  expect(trend[11]).toEqual({ month: '2026-10', count: 1 });
  expect(trend.reduce((sum, row) => sum + row.count, 0)).toBe(4);
});

it('uses the Azores calendar month at UTC rollover', () => {
  expect(buildMonthlyTrend([], new Date('2026-01-01T00:30:00Z')).at(-1)?.month).toBe('2025-12');
});
