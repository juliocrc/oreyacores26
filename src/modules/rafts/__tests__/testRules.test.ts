import { getAutomaticRaftTests, getTestRecommendations } from '../testRules';

function atAgeYears(ageYears: number, launchType?: string) {
  const inspectionDate = '2025-06-01';
  const manufactureYear = 2025 - ageYears;
  return getAutomaticRaftTests({
    brand: 'DSB',
    model: 'LR97',
    launchType,
    dataFabrico: `${manufactureYear}-01-01`,
    inspectionDate,
  });
}

describe('getAutomaticRaftTests — regras FS/NAP/GI/DL (manuais DSB/RFD + A.761(18))', () => {
  test('WP é sempre obrigatório', () => {
    expect(atAgeYears(1).testeWP).toBe('YES');
    expect(atAgeYears(21).testeWP).toBe('YES');
  });

  test('GI: de 5 em 5 anos (5, 10, 15, 20)', () => {
    expect(atAgeYears(4).testeGI).toBe('NO');
    expect(atAgeYears(5).testeGI).toBe('YES');
    expect(atAgeYears(9).testeGI).toBe('NO');
    expect(atAgeYears(10).testeGI).toBe('YES');
    expect(atAgeYears(11).testeGI).toBe('NO');
    expect(atAgeYears(15).testeGI).toBe('YES');
    expect(atAgeYears(20).testeGI).toBe('YES');
  });

  test('FS: obrigatório a partir do 10º ano (incl. anos de GI)', () => {
    expect(atAgeYears(9).testeFS).toBe('NO');
    expect(atAgeYears(10).testeFS).toBe('YES');
    expect(atAgeYears(11).testeFS).toBe('YES');
    expect(atAgeYears(15).testeFS).toBe('YES');
    expect(atAgeYears(20).testeFS).toBe('YES');
  });

  test('NAP: obrigatório anualmente a partir do 10º ano INCLUSIVE nos anos de GI (manuais DSB/RFD)', () => {
    expect(atAgeYears(9).testeNAP).toBe('NO');
    expect(atAgeYears(10).testeNAP).toBe('YES');
    expect(atAgeYears(11).testeNAP).toBe('YES');
    expect(atAgeYears(12).testeNAP).toBe('YES');
    expect(atAgeYears(15).testeNAP).toBe('YES');
    // Ano GI aos 20 anos — o NAP NÃO é dispensado (anteriormente era 'N/A')
    expect(atAgeYears(20).testeNAP).toBe('YES');
    expect(atAgeYears(21).testeNAP).toBe('YES');
  });

  test('DL (davit): sobrecarga/suspensão a cada 2º serviço (anos pares)', () => {
    expect(atAgeYears(0, 'DL').testeDL).toBe('NO');
    expect(atAgeYears(1, 'DL').testeDL).toBe('NO');
    expect(atAgeYears(2, 'DL').testeDL).toBe('YES');
    expect(atAgeYears(3, 'DL').testeDL).toBe('NO');
    expect(atAgeYears(6, 'DL').testeDL).toBe('YES');
    expect(atAgeYears(9, 'DL').testeDL).toBe('NO');
    expect(atAgeYears(12, 'DL').testeDL).toBe('YES');
  });

  test('DL: N/A para jangadas throw-over', () => {
    const result = atAgeYears(10, 'TO');
    expect(result.testeDL).toBe('N/A');
    expect(result.isDlOverloadDue).toBe(false);
  });
});

describe('RFD SEASAVA PLUS / SEASAVA PLUS R — regras de teste aplicadas às mesmas', () => {
  test('SEASAVA PLUS: NAP/FS anuais a partir do 10º ano incl. ano de GI (20), GI de 5 em 5', () => {
    for (const model of ['SEASAVA PLUS', 'SEASAVA PLUS R'] as const) {
      const age10 = getAutomaticRaftTests({
        brand: 'RFD',
        model,
        dataFabrico: '2015-01-01',
        inspectionDate: '2025-06-01',
      });
      expect(age10.testeGI).toBe('YES');
      expect(age10.testeFS).toBe('YES');
      expect(age10.testeNAP).toBe('YES');

      const age20 = getAutomaticRaftTests({
        brand: 'RFD',
        model,
        dataFabrico: '2005-01-01',
        inspectionDate: '2025-06-01',
      });
      expect(age20.testeGI).toBe('YES');
      expect(age20.testeNAP).toBe('YES');
      expect(age20.testeFS).toBe('YES');

      const age9 = getAutomaticRaftTests({
        brand: 'RFD',
        model,
        dataFabrico: '2016-01-01',
        inspectionDate: '2025-06-01',
      });
      expect(age9.testeFS).toBe('NO');
      expect(age9.testeNAP).toBe('NO');
    }
  });

  test('SEASAVA PLUS (throw-over): teste DL N/A; DSB LR97 DL continua a aplicar-se', () => {
    const to = getAutomaticRaftTests({
      brand: 'RFD',
      model: 'SEASAVA PLUS R',
      launchType: 'Throw-Over',
      dataFabrico: '2010-01-01',
      inspectionDate: '2025-06-01',
    });
    expect(to.testeDL).toBe('N/A');
    expect(to.isDlOverloadDue).toBe(false);

    const dlEvenYear = getAutomaticRaftTests({
      brand: 'DSB',
      model: 'LR97',
      launchType: 'DL',
      dataFabrico: '2011-01-01',
      inspectionDate: '2025-06-01',
    });
    expect(dlEvenYear.testeDL).toBe('YES');

    const dlOddYear = getAutomaticRaftTests({
      brand: 'DSB',
      model: 'LR97',
      launchType: 'DL',
      dataFabrico: '2010-01-01',
      inspectionDate: '2025-06-01',
    });
    expect(dlOddYear.testeDL).toBe('NO');
  });
});

describe('getTestRecommendations', () => {
  test('recomendação NAP no ano 20 (ano de GI) mantém status required e mensagem atualizada', () => {
    const recs = getTestRecommendations({
      brand: 'DSB',
      model: 'LR97',
      launchType: 'DL',
      dataFabrico: '2005-01-01',
      inspectionDate: '2025-06-01',
    });
    const nap = recs.find((r) => r.testId === 'testeNAP');
    expect(nap).toBeDefined();
    expect(nap!.status).toBe('required');
    expect(nap!.reason).toContain('incluindo anos de GI');
    expect(nap!.ageYears).toBe(20);
  });

  test('GI aos 5 anos: required; FS/NAP ainda não exigidos', () => {
    const recs = getTestRecommendations({
      brand: 'DSB',
      model: 'LR97',
      dataFabrico: '2020-01-01',
      inspectionDate: '2025-06-01',
    });
    const byId = Object.fromEntries(recs.map((r) => [r.testId, r]));
    expect(byId['testeGI'].status).toBe('required');
    expect(byId['testeFS'].status).toBe('optional');
    expect(byId['testeNAP'].status).toBe('optional');
  });
});