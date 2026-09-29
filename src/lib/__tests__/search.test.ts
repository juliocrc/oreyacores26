import {
  normalizeForSearch,
  compactForSearch,
  editDistance,
  matchesSearch,
  scoreMatch,
  allowedTypoDistance,
} from '../search';

describe('normalizeForSearch', () => {
  test('remove acentos e normaliza para minusculas', () => {
    expect(normalizeForSearch('Açores')).toBe('acores');
    expect(normalizeForSearch('ATLÂNTICO')).toBe('atlantico');
    expect(normalizeForSearch('MÃO')).toBe('mao');
  });

  test('colapsa espacos e tolera null/undefined', () => {
    expect(normalizeForSearch('  SURVIVA   MK   IV ')).toBe('surviva mk iv');
    expect(normalizeForSearch(null)).toBe('');
    expect(normalizeForSearch(undefined)).toBe('');
  });
});

describe('compactForSearch', () => {
  test('ignora separadores em numeros de serie', () => {
    expect(compactForSearch('SR 1234')).toBe('sr1234');
    expect(compactForSearch('SR-1234')).toBe('sr1234');
    expect(compactForSearch('L R 9 7')).toBe('lr97');
    expect(compactForSearch('LR97')).toBe('lr97');
  });
});

describe('editDistance', () => {
  test('calcula distancias corretas', () => {
    expect(editDistance('jangada', 'jangada', 3)).toBe(0);
    expect(editDistance('jangada', 'jangad', 3)).toBe(1);
    expect(editDistance('abc', 'xyz', 1)).toBeGreaterThan(1);
  });

  test('uma transposicao custa 1, nao 2', () => {
    expect(editDistance('jangada', 'jagnada', 3)).toBe(1);
    // Caso que motivou a mudança: números de série curtos escritos por transposição.
    expect(editDistance('srv9', 'rsv9', 1)).toBe(1);
  });

  test('corta cedo quando excede o maximo', () => {
    expect(editDistance('aaaaaaa', 'bbbbbbb', 1)).toBe(2); // maxDistance + 1
  });
});

describe('allowedTypoDistance', () => {
  test('escala com o tamanho da palavra', () => {
    expect(allowedTypoDistance('abc')).toBe(1);
    expect(allowedTypoDistance('jang')).toBe(1);
    expect(allowedTypoDistance('jangad')).toBe(2);
    expect(allowedTypoDistance('jangadas')).toBe(2);
    expect(allowedTypoDistance('inspecao')).toBe(2);
    expect(allowedTypoDistance('abdominavel')).toBe(3);
  });
});

describe('matchesSearch — nivel 1: sub-cadeia directa', () => {
  test('encontra por qualquer campo', () => {
    expect(matchesSearch('surv', 'Survitec', 'SRV-9', 'MARCA')).toBe(true);
    expect(matchesSearch('marca', 'SRV-9', 'AZZ', 'MARCA')).toBe(true);
  });

  test('term vazio nao filtra', () => {
    expect(matchesSearch('', 'qualquer')).toBe(true);
    expect(matchesSearch(null, 'qualquer')).toBe(true);
    expect(matchesSearch('   ', 'qualquer')).toBe(true);
  });

  test('nao encontra quando nao deve', () => {
    expect(matchesSearch('zzz', 'Survitec', 'SRV-9')).toBe(false);
  });
});

describe('matchesSearch — nivel 2: separadores', () => {
  test('encontra series com espacos ou hifens diferentes', () => {
    expect(matchesSearch('sr1234', 'SR-1234')).toBe(true);
    expect(matchesSearch('SR 1234', 'SR-1234')).toBe(true);
    expect(matchesSearch('lr97', 'LR 97 L')).toBe(true);
  });
});

describe('matchesSearch — nivel 3: tolerancia a erros', () => {
  test('agora transposicoes de letras', () => {
    expect(matchesSearch('jagnada', 'SRV-9', 'Jangada')).toBe(true);
    expect(matchesSearch('jangda', 'Jangada')).toBe(true);
  });

  test('encontra por sub-sequencia', () => {
    // Ordem dos caracteres preservada: j -> g -> d em "jangada".
    expect(matchesSearch('jgd', 'jangada')).toBe(true);
  });

  test('encontra por prefixo de palavra', () => {
    expect(matchesSearch('jang', 'jangada')).toBe(true);
    expect(matchesSearch('sur', 'Survitec')).toBe(true);
  });

  test('limitacao conhecida: abreviacao curta de palavra longa nao casa', () => {
    // "jgnd" tem 4 caracteres e "jangada" tem 7: a diferenca de comprimento
    // ja ultrapassa a tolerancia de 1 erro. Nao fingimos que isto funciona.
    expect(matchesSearch('jgnd', 'jangada')).toBe(false);
  });

  test('palavras longas toleram 2 erros', () => {
    expect(matchesSearch('inspekcao', 'inspecao')).toBe(true);
  });

  test('nao inventa resultados para termos muito diferentes', () => {
    expect(matchesSearch('jagnada', 'Navio')).toBe(false);
    expect(matchesSearch('xyzzy', 'jangada', 'survitec')).toBe(false);
  });

  test('exige que TODAS as palavras do termo casem', () => {
    expect(matchesSearch('sr 1234', 'SR-1234')).toBe(true);
    expect(matchesSearch('sr 9999', 'SR-1234')).toBe(false);
  });
});

describe('matchesSearch — robustez', () => {
  test('valores nulos nao causam erro nem falso positivo', () => {
    expect(matchesSearch('x', null, undefined, '')).toBe(false);
    expect(matchesSearch('x', null, 'AXE')).toBe(true);
  });

  test('lida com todos os campos vazios', () => {
    expect(matchesSearch('jangada', '', null, undefined)).toBe(false);
  });
});

describe('scoreMatch', () => {
  test('ordena por relevancia: exacto > comeca com > sub-cadeia', () => {
    const exacto = scoreMatch('sr97', 'SR97');
    const comecam = scoreMatch('sr97', 'SR9700');
    const contem = scoreMatch('97', 'MODELO SR97'); // no meio, não no início
    const tolerante = scoreMatch('jagnad', 'jangada'); // só por distância de edição

    expect(exacto).toBe(100);
    expect(comecam).toBe(90);
    expect(contem).toBe(70);
    expect(tolerante).toBe(25);
    expect(exacto).toBeGreaterThan(comecam);
    expect(comecam).toBeGreaterThan(contem);
    expect(contem).toBeGreaterThan(tolerante);
  });

  test('zero quando nao ha termo', () => {
    expect(scoreMatch('', 'SR97')).toBe(0);
  });

  test('devolve 100 em correspondencia exacta', () => {
    expect(scoreMatch('sr97', 'SR97')).toBe(100);
  });
});
