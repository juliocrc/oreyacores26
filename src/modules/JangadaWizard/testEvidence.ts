/** Advisory completeness only; does not certify a test or block an inspection. */
export function missingTestEvidence(tests: Record<string, unknown>): Array<{ test: string; missing: string[] }> {
  const specs = [
    { result: 'testeWP', label: 'WP', fields: [
      ['wpHoraInicio', 'hora inicial'], ['wpHoraFim', 'hora final'], ['wpTempInicio', 'temperatura inicial'], ['wpTempFim', 'temperatura final'],
      ['wpPressaoAtmInicio', 'pressão atmosférica inicial'], ['wpPressaoAtmFim', 'pressão atmosférica final'],
      ['wpCamaraSupInicio', 'pressão inicial superior'], ['wpCamaraSupFim', 'pressão final superior'],
      ['wpCamaraInfInicio', 'pressão inicial inferior'], ['wpCamaraInfFim', 'pressão final inferior'],
      ['wpUnidadePressao', 'unidade de pressão'], ['wpManometroId', 'manómetro'], ['wpBarometroId', 'barómetro'],
    ] },
    { result: 'testeNAP', label: 'NAP', fields: [
      ['napHoraInicio', 'hora inicial'], ['napHoraFim', 'hora final'], ['napTempInicio', 'temperatura inicial'], ['napTempFim', 'temperatura final'],
      ['napPressaoAtmInicio', 'pressão atmosférica inicial'], ['napPressaoAtmFim', 'pressão atmosférica final'],
      ['napCamaraSupInicio', 'pressão inicial superior'], ['napCamaraSupFim', 'pressão final superior'],
      ['napCamaraInfInicio', 'pressão inicial inferior'], ['napCamaraInfFim', 'pressão final inferior'],
      ['napUnidadePressao', 'unidade de pressão'], ['napManometroId', 'manómetro'],
    ] },
  ];
  return specs.filter(spec => tests[spec.result] === 'PASSOU' || tests[spec.result] === 'REPROVOU').map(spec => ({
    test: spec.label,
    missing: spec.fields.filter(([key]) => String(tests[key] ?? '').trim() === '').map(([, label]) => label),
  })).filter(item => item.missing.length > 0);
}
