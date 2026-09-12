import { resolveNominalCharge } from '../nominalCharge';

describe('resolveNominalCharge — cargas nominais dos manuais (DSB LR97/LR97L, RFD Surviva MKIII)', () => {
  test('DSB LR97 25 pessoas: TO vs DL', () => {
    const to = resolveNominalCharge({ brand: 'DSB', model: 'LR97', capacity: 25, launchType: 'TO' });
    expect(to).not.toBeNull();
    expect(to!.co2).toBe(10.77);
    expect(to!.n2).toBe(0.54);
    expect(to!.totalKg).toBeCloseTo(11.31, 3);
    expect(to!.configuration).toBe('TO');
    expect(to!.codRef).toBe('DSB-LR97-025');

    const dl = resolveNominalCharge({ brand: 'DSB', model: 'LR97', capacity: 25, launchType: 'DL' });
    expect(dl!.co2).toBe(12.57);
    expect(dl!.n2).toBe(0.63);
    expect(dl!.totalKg).toBeCloseTo(13.2, 3);
    expect(dl!.configuration).toBe('DL');
    expect(dl!.codRef).toBe('DSB-LR97-025-DL');
  });

  test('DSB LR97 16/20: cargas específicas TO vs DL', () => {
    expect(resolveNominalCharge({ brand: 'DSB', model: 'LR97', capacity: 16, launchType: 'TO' })!.co2).toBe(7.18);
    expect(resolveNominalCharge({ brand: 'DSB', model: 'LR97', capacity: 16, launchType: 'DL' })!.co2).toBe(8.8);
    expect(resolveNominalCharge({ brand: 'DSB', model: 'LR97', capacity: 20, launchType: 'TO' })!.co2).toBe(8.8);
    expect(resolveNominalCharge({ brand: 'DSB', model: 'LR97', capacity: 20, launchType: 'DL' })!.co2).toBe(10.77);
  });

  test('DSB LR97 L (davit 12-25): usa cargas DL do manual', () => {
    expect(resolveNominalCharge({ brand: 'DSB', model: 'LR97 L', capacity: 12, launchType: 'DL' })!.co2).toBe(5.38);
    expect(resolveNominalCharge({ brand: 'DSB', model: 'LR97 L', capacity: 16, launchType: 'DL' })!.co2).toBe(8.8);
    expect(resolveNominalCharge({ brand: 'DSB', model: 'LR97 L', capacity: 25, launchType: 'DL' })!.co2).toBe(12.57);
  });

  test('RFD SURVIVA MKIII (europeu/TPED): 20 TO vs DL, 6P', () => {
    const to = resolveNominalCharge({ brand: 'RFD', model: 'SURVIVA MKIII', capacity: 20, launchType: 'TO' });
    expect(to!.co2).toBe(6.343);
    expect(to!.n2).toBe(0.773);
    expect(to!.totalKg).toBeCloseTo(7.116, 3);
    expect(to!.configuration).toBe('TO');

    const dl = resolveNominalCharge({ brand: 'RFD', model: 'SURVIVA MKIII', capacity: 20, launchType: 'DL' });
    expect(dl!.co2).toBe(8.722);
    expect(dl!.n2).toBe(1.063);
    expect(dl!.totalKg).toBeCloseTo(9.785, 3);
    expect(dl!.configuration).toBe('DL');

    expect(resolveNominalCharge({ brand: 'RFD', model: 'SURVIVA MKIII', capacity: 6 })!.co2).toBe(3.171);
    expect(resolveNominalCharge({ brand: 'RFD', model: 'SURVIVA MKIII', capacity: 4 })!.totalKg).toBeCloseTo(1.631, 3);
  });

  test('capacidade como string (ex: "25P") é interpretada', () => {
    const result = resolveNominalCharge({ brand: 'DSB', model: 'LR97', capacity: '25P', launchType: 'TO' });
    expect(result!.capacity).toBe(25);
    expect(result!.co2).toBe(10.77);
  });

  test('source do manual é exposto', () => {
    const result = resolveNominalCharge({ brand: 'RFD', model: 'SURVIVA MKIII', capacity: 10 });
    expect(result!.source?.doc).toBe('RFD SURVIVA MKIII Service Manual');
    expect(result!.source?.note).toContain('europeu');
  });

  test('DSB LR07 (plataforma MKIV/GIST): valores corrigidos pelo M269-02 p.117', () => {
    const ten = resolveNominalCharge({ brand: 'DSB', model: 'LR07', capacity: 10, launchType: 'TO' });
    expect(ten!.co2).toBe(5.38);
    expect(ten!.n2).toBe(0.27);

    const sixteen = resolveNominalCharge({ brand: 'DSB', model: 'LR07', capacity: 16, launchType: 'TO' });
    expect(sixteen!.co2).toBe(7.18);
    expect(sixteen!.n2).toBe(0.36);

    const twenty = resolveNominalCharge({ brand: 'DSB', model: 'LR07', capacity: 20, launchType: 'TO' });
    expect(twenty!.co2).toBe(8.8);
    expect(twenty!.n2).toBe(0.44);
  });

  test('RFD SURVIVA MKIV TO mantém valores da tabela M269-02', () => {
    expect(resolveNominalCharge({ brand: 'RFD', model: 'SURVIVA MKIV', capacity: 4, launchType: 'TO' })!.co2).toBe(1.98);

    const mkiv = resolveNominalCharge({ brand: 'RFD', model: 'SURVIVA MKIV', capacity: 25, launchType: 'TO' });
    expect(mkiv!.co2).toBe(10.77);
    expect(mkiv!.n2).toBe(0.54);

    const dl = resolveNominalCharge({ brand: 'RFD', model: 'SURVIVA MKIV', capacity: 25, launchType: 'DL' });
    expect(dl!.co2).toBe(12.57);
  });

  test('sem correspondência devolve null', () => {
    expect(resolveNominalCharge({ brand: 'DESCONHECIDA', model: 'X', capacity: 12 })).toBeNull();
    expect(resolveNominalCharge({ brand: 'DSB', model: 'LR97', capacity: 9 })).toBeNull();
    expect(resolveNominalCharge({ brand: 'DSB', model: 'LR97', capacity: 0 })).toBeNull();
    expect(resolveNominalCharge({})).toBeNull();
  });
});