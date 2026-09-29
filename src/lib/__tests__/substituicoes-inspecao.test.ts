import {
  isComponenteSubstituido,
  isPackItemSubstituido,
  apenasComponentesSubstituidos,
  isClosureItemSubstituido,
} from '../substituicoes-inspecao';

describe('isComponenteSubstituido', () => {
  test('reconhece o estado de substituição', () => {
    expect(isComponenteSubstituido({ estado: 'SUBSTITUIDO' })).toBe(true);
  });

  test('tolera acentos, maiusculas_minusculas e espacos', () => {
    expect(isComponenteSubstituido({ estado: 'Substituída' })).toBe(true);
    expect(isComponenteSubstituido({ estado: 'substituido' })).toBe(true);
    expect(isComponenteSubstituido({ estado: '  SUBSTITUÍDO ' })).toBe(true);
    expect(isComponenteSubstituido({ estado: 'SUBSTITUIDA' })).toBe(true);
  });

  test('nao conta como substituicao um componente apenas inspecionado', () => {
    expect(isComponenteSubstituido({ estado: 'OK' })).toBe(false);
    expect(isComponenteSubstituido({ estado: 'REPROVADO' })).toBe(false);
    expect(isComponenteSubstituido({ estado: 'NA' })).toBe(false);
  });

  test('nao inventa substituicao a partir de outros campos', () => {
    // O bug original: ter validade nao significa ter sido trocada.
    expect(isComponenteSubstituido({ validade: '2027-01-01', serialLote: 'L1' })).toBe(false);
    expect(isComponenteSubstituido({ estado: undefined, validade: '2027-01-01' })).toBe(false);
  });

  test('aguenta entradas invalidas', () => {
    expect(isComponenteSubstituido(null)).toBe(false);
    expect(isComponenteSubstituido(undefined)).toBe(false);
    expect(isComponenteSubstituido("SUBSTITUIDO")).toBe(false);
    expect(isComponenteSubstituido({})).toBe(false);
  });
});

describe('isPackItemSubstituido', () => {
  test('so conta com quantidade registada', () => {
    expect(isPackItemSubstituido({ quantidade: 2 })).toBe(true);
    expect(isPackItemSubstituido({ quantidade: '1' })).toBe(true);
  });

  test('quantidade zero significa verificado, nao trocado', () => {
    expect(isPackItemSubstituido({ quantidade: 0 })).toBe(false);
    expect(isPackItemSubstituido({ quantidade: '0' })).toBe(false);
    expect(isPackItemSubstituido({})).toBe(false);
  });
});

describe('apenasComponentesSubstituidos', () => {
  test('mantem so os substituidos, pela ordem original', () => {
    const entrada = [
      { id: 'a', estado: 'OK' },
      { id: 'b', estado: 'SUBSTITUIDO' },
      { id: 'c', validade: '2027-01-01' },
      { id: 'd', estado: 'SUBSTITUÍDO' },
    ];
    const saida = apenasComponentesSubstituidos(entrada);
    expect(saida.map((c) => c.id)).toEqual(['b', 'd']);
  });

  test('devolve lista vazia em vez de rebentar', () => {
    expect(apenasComponentesSubstituidos(null)).toEqual([]);
    expect(apenasComponentesSubstituidos(undefined)).toEqual([]);
  });
});

describe('isClosureItemSubstituido', () => {
  test('material de fecho entra com quantidade', () => {
    expect(isClosureItemSubstituido({ quantidade: 3 })).toBe(true);
    expect(isClosureItemSubstituido({ quantidade: 0 })).toBe(false);
  });
});
