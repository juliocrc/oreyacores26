import {
  normalizeModelFilterKey,
  canonicalizeRaftModelLabel,
  uniqueNormalizedLabels,
} from '../jangadas-page-helpers';

describe('normalizeModelFilterKey — avoids repeated models in dropdowns', () => {
  test('colapsa espaços, hífens e pontuação de variantes do mesmo modelo', () => {
    const keys = [
      'LR97',
      'LR 97',
      'LR-97',
      'LR 97 L',
      'LR97L',
      'SURVIVA MK IV',
      'SURVIVA MKIV',
      'SEA-SAFE BR',
      'SEA SAFE BR',
    ].map((value) => normalizeModelFilterKey(value));

    expect(keys[0]).toBe('LR97');
    expect(keys[1]).toBe('LR97');
    expect(keys[2]).toBe('LR97');
    expect(keys[3]).toBe('LR97L');
    expect(keys[4]).toBe('LR97L');
    expect(keys[5]).toBe('SURVIVAMKIV');
    expect(keys[6]).toBe('SURVIVAMKIV');
    expect(keys[7]).toBe('SEASAFEBR');
    expect(keys[8]).toBe('SEASAFEBR');
  });

  test('mantém modelos distintos separados (SEASAVA PLUS vs SEASAVA PLUS R)', () => {
    expect(normalizeModelFilterKey('SEASAVA PLUS')).toBe('SEASAVAPLUS');
    expect(normalizeModelFilterKey('SEASAVA PLUS R')).toBe('SEASAVAPLUSR');
    expect(normalizeModelFilterKey('SEASAVA PLUS')).not.toBe(normalizeModelFilterKey('SEASAVA PLUS R'));
  });
});

describe('canonicalizeRaftModelLabel — RFD', () => {
  test('SURVIVA MK IV / SURVIVA MKIV convergem para o nome técnico canónico', () => {
    expect(canonicalizeRaftModelLabel('RFD', 'SURVIVA MK IV')).toBe('SURVIVA MKIV TO');
    expect(canonicalizeRaftModelLabel('RFD', 'SURVIVA MKIV')).toBe('SURVIVA MKIV TO');
  });

  test('SEASAVA PLUS e SEASAVA PLUS R mantêm-se como modelos distintos', () => {
    expect(canonicalizeRaftModelLabel('RFD', 'SEASAVA PLUS')).toBe('SEASAVA PLUS');
    expect(canonicalizeRaftModelLabel('RFD', 'SEASAVA PLUS R')).toBe('SEASAVA PLUS R');
    expect(canonicalizeRaftModelLabel('RFD', 'seasava plus r')).toBe('SEASAVA PLUS R');
  });
});

describe('canonicalizeRaftModelLabel — DSB', () => {
  test('variantes LR 97 convergem para LR97; LR 97 L para LR97 L', () => {
    expect(canonicalizeRaftModelLabel('DSB', 'LR 97')).toBe('LR97');
    expect(canonicalizeRaftModelLabel('DSB', 'LR-97')).toBe('LR97');
    expect(canonicalizeRaftModelLabel('DSB', 'LR 97 L')).toBe('LR97 L');
  });

  test('modelo desconhecido não é reescrito', () => {
    expect(canonicalizeRaftModelLabel('DSB', 'MODELO-0001')).toBeNull();
    expect(canonicalizeRaftModelLabel('', 'LR97')).toBe('LR97');
  });
});

describe('uniqueNormalizedLabels — dropdown sem repetidos', () => {
  test('variantes de LR97 produzem uma única entrada', () => {
    const labels = uniqueNormalizedLabels(['LR97', 'LR 97', 'LR-97', 'LR 97', 'LR05']);
    expect(labels).toEqual(['LR05', 'LR97']);
  });
});