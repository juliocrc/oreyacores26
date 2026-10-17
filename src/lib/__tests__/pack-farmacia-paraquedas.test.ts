import {
  packIncludesFirstAid,
  resolveDocumentPackType,
  stripFirstAidForPack,
  checklistHasParachuteRockets,
} from '@/config/packTemplates';

describe('pack farmácia / paraquedas logic', () => {
  it('pack R não inclui farmácia; E inclui', () => {
    expect(packIncludesFirstAid('R')).toBe(false);
    expect(packIncludesFirstAid('E')).toBe(true);
    expect(packIncludesFirstAid('SOLAS A')).toBe(true);
  });

  it('deteta paraquedas na checklist', () => {
    expect(checklistHasParachuteRockets({ foguetoes_paraquedas: 'YES' })).toBe(true);
    expect(checklistHasParachuteRockets({ ref_paraquedas: '30202239' })).toBe(true);
    expect(checklistHasParachuteRockets({ validade_paraquedas: '2029-03' })).toBe(true);
    expect(checklistHasParachuteRockets({ foguetoes_paraquedas: 'NO' })).toBe(false);
    expect(checklistHasParachuteRockets({})).toBe(false);
  });

  it('R com paraquedas passa a ser E; R sem paraquedas mantém-se R', () => {
    expect(resolveDocumentPackType('R', { foguetoes_paraquedas: 'YES' })).toBe('E');
    expect(resolveDocumentPackType('R', {})).toBe('R');
    expect(resolveDocumentPackType('SOLAS B', { foguetoes_paraquedas: 'YES' })).toBe('SOLAS B');
  });

  it('remove farmácia em pack R sem paraquedas', () => {
    const out = stripFirstAidForPack(
      { ambulancia: 'YES', validade_farmacia: '2029-03', ref_farmacia: 'X', qtd_farmacia: 1, validade_fachos_mao: '2028-06' },
      'R',
    );
    expect(out.ambulancia).toBeUndefined();
    expect(out.validade_farmacia).toBeUndefined();
    expect(out.ref_farmacia).toBeUndefined();
    expect(out.validade_fachos_mao).toBe('2028-06');
  });

  it('mantém farmácia num R que transporta paraquedas (pack efetivo E)', () => {
    const out = stripFirstAidForPack(
      { ambulancia: 'YES', validade_farmacia: '2029-03', foguetoes_paraquedas: 'YES' },
      'R',
    );
    expect(out.ambulancia).toBe('YES');
    expect(out.validade_farmacia).toBe('2029-03');
  });
});
