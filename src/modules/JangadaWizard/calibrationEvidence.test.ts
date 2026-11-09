import { calibrationEvidence } from './calibrationEvidence';

it('compares calibration with the inspection date rather than today', () => {
  const sensor = { nome: 'Manómetro', dataProxCalibracao: '2026-05-10' };
  expect(calibrationEvidence(sensor, '2026-05-09')).toBeNull();
  expect(calibrationEvidence(sensor, '2026-05-11')).toContain('expirada');
});
it('warns when the equipment or dates cannot be confirmed', () => {
  expect(calibrationEvidence(undefined, '2026-01-01')).toContain('Não foi possível confirmar');
  expect(calibrationEvidence({ nome: 'Manómetro' }, '2026-01-01')).toContain('por confirmar');
  expect(calibrationEvidence({ nome: 'Manómetro', dataProxCalibracao: 'invalid' }, '')).toContain('por confirmar');
});
