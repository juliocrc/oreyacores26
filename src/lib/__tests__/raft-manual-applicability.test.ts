import { getRaftManualApplicability } from '../raft-manual-applicability';

it.each([['SURVIVA MKIII TO', 'MK III'], ['Surviva MK IV DL', 'MK IV']])('identifies %s as a candidate, never as confirmed', (model, expected) => {
  const result = getRaftManualApplicability({ brand: 'RFD', model });
  expect(result.manual).toContain(expected);
  expect(result.missing).toContain('Próxima inspeção');
  expect(result.pendingConfirmation).toContain('Edição e revisão do manual');
});

it('does not assume a manual for unrelated models, unknown variants or missing brand', () => {
  expect(getRaftManualApplicability({ brand: 'RFD', model: 'SURVIVA MKIII SPECIAL' }).manual).toBeNull();
  expect(getRaftManualApplicability({ model: 'SURVIVA MKIV' }).manual).toBeNull();
  expect(getRaftManualApplicability({ brand: 'DSB', model: 'LR 97' }).manual).toBeNull();
});

it('associates RFD SeaSava models with MK III while retaining technical confirmation', () => {
  const result = getRaftManualApplicability({ brand: 'RFD', model: 'SeaSava Plus' });
  expect(result.manual).toContain('MK III');
  expect(result.identificationNote).toContain('Confirmar variante');
  expect(getRaftManualApplicability({ brand: 'RFD', model: 'SeaSava' }).manual).toContain('MK III');
  expect(getRaftManualApplicability({ brand: 'Outra', model: 'SeaSava Plus' }).manual).toBeNull();
});

it('identifica Ocean ISO e UltraLite como candidatos, não outras gamas', () => {
  for (const model of ['Ocean ISO', 'ISO ULTRALITE', 'Ocean ISO Ultralite']) {
    const result = getRaftManualApplicability({ brand: 'Ocean Safety', model });
    expect(result.manual).toContain('02/2020');
    expect(result.identificationNote).toContain('consultiva');
  }
  expect(getRaftManualApplicability({ brand: 'Ocean Safety', model: 'Charter 2.0' }).manual).toBeNull();
  expect(getRaftManualApplicability({ brand: 'Ocean Safety', model: 'Ocean ISO Special' }).manual).toBeNull();
  expect(getRaftManualApplicability({ brand: 'Outra', model: 'Ocean ISO' }).manual).toBeNull();
});
