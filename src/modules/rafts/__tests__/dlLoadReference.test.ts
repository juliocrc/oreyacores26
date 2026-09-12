import { getDlLoadReference } from '../dlLoadReference';

describe('getDlLoadReference — cargas de suspensão DL (1,1 × G)', () => {
  test('DSB LR97/LR97 L: tabela do manual (75 kg × lotação × 1,1, arred. 25 kg)', () => {
    for (const [capacity, expected] of [
      [12, 1000],
      [16, 1325],
      [20, 1650],
      [25, 2075],
    ] as const) {
      const ref = getDlLoadReference({ brand: 'DSB', model: 'LR97 L', capacity });
      expect(ref).not.toBeNull();
      expect(ref!.minKg).toBe(expected);
      expect(ref!.maxKg).toBe(expected);
      expect(ref!.source?.doc).toBe('LR97/LR97 L Service Manual');
    }
  });

  test('Família MKIV (LR07/Surviva MKIV): faixas do TABLEAU 502', () => {
    const ref = getDlLoadReference({ brand: 'DSB', model: 'LR07', capacity: 20 });
    expect(ref!.minKg).toBe(2019);
    expect(ref!.maxKg).toBe(2069);

    const surviva = getDlLoadReference({ brand: 'RFD', model: 'SURVIVA MKIV', capacity: 12 });
    expect(surviva!.minKg).toBe(1293);
    expect(surviva!.maxKg).toBe(1343);
  });

  test('Sem tabela: fallback à fórmula 75 kg × lotação × 1,1', () => {
    const ref = getDlLoadReference({ brand: 'OUTRA', model: 'DESCONHECIDO', capacity: 12 });
    expect(ref!.minKg).toBeNull();
    expect(ref!.formulaKg).toBe(Math.round(1.1 * 75 * 12));
  });

  test('duração mínima de 5 minutos e capacidade tratada como string', () => {
    const ref = getDlLoadReference({ brand: 'DSB', model: 'LR97', capacity: '25P' });
    expect(ref!.durationMinutes).toBe(5);
    expect(ref!.capacity).toBe(25);
  });

  test('devolve null sem capacidade válida', () => {
    expect(getDlLoadReference({ brand: 'DSB', model: 'LR97' })).toBeNull();
    expect(getDlLoadReference({ capacity: 0 })).toBeNull();
  });
});