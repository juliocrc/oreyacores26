export type RaftManualInput = {
  brand?: string | null; model?: string | null; capacity?: number | null; launchType?: string | null;
  packType?: string | null; containerModel?: string | null; containerSize?: string | null;
  maxStowageHeight?: string | null; dataFabrico?: string | null; dataProxInspecao?: string | null;
};

/** Advisory identification only: names do not prove the applicable edition or approval. */
export function getRaftManualApplicability(raft: RaftManualInput) {
  const model = String(raft.model || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const brand = String(raft.brand || '').trim();
  const seasavaCandidate = brand.toUpperCase() === 'RFD' && /^SEASAVA/.test(model);
  const eurovinil = brand.toUpperCase() === 'EUROVINIL';
  const euroModel = model.replace(/^EUROVINIL/, '');
  const syntesy = eurovinil && /^(?:LEISURE)?SYNTESY/.test(euroModel);
  const compactDry = eurovinil && /^COMPACTDRY/.test(euroModel);
  const m14 = eurovinil && /^(?:LEISURE)?M14/.test(euroModel);
  const crewsaverMk2 = brand.toUpperCase() === 'CREWSAVER' && /^(?:ISOTYPE[12]|MARINER)MK2/.test(model);
  const crewsaver2017 = brand.toUpperCase() === 'CREWSAVER' && /^(?:ISOTYPE[12]|MARINER(?:USA)?)EV2017/.test(model);
  const oceanIso = brand.toUpperCase().replace(/[^A-Z0-9]/g, '') === 'OCEANSAFETY' && /^(?:ISO|OCEANISO|OSISO|OCEANSAFETYISO)(?:ULTRALITE)?$/.test(model);
  const euroCandidate = syntesy || compactDry || m14 || crewsaverMk2 || crewsaver2017;
  const isViking = String(brand || '').trim().toUpperCase() === 'VIKING';
  const isDuarry = String(brand || '').trim().toUpperCase() === 'DUARRY';
  const manual = isDuarry ? 'DUARRY Liferafts — Manual do fabricante (SOLAS/ISO)'
    : isViking ? 'VIKING Liferaft Manual - Standard — Edição 9 (2025-04-01)'
    : m14 ? 'Eurovinil Leisure M14 — Ver. 1, junho 2017'
    : oceanIso ? 'Ocean Safety Ocean ISO / UltraLite — edição 02/2020'
    : crewsaver2017 ? 'Crewsaver ISO TYPE1/TYPE2 e MARINER (EV) — Ver. 1, junho 2017'
    : syntesy || compactDry || crewsaverMk2 ? 'Eurovinil Leisure Syntesy / Crewsaver MK2 — Ver. 1, abril 2021'
    : seasavaCandidate || (brand && /^SURVIVAMK(?:III|3)(?:TO|DL)?$/.test(model)) ? 'Surviva MK III — manual 251'
    : brand && /^SURVIVAMK(?:IV|4)(?:TO|DL)?$/.test(model) ? 'Marine MK IV — M269-00'
    : null;
  const checks = [
    { label: 'Marca', value: brand || null },
    { label: 'Modelo', value: raft.model?.trim() || null },
    { label: 'Lotação', value: Number.isFinite(raft.capacity) && (raft.capacity || 0) > 0 ? String(raft.capacity) : null },
    { label: 'Tipo de lançamento', value: raft.launchType?.trim() || null },
    { label: 'Pack', value: raft.packType?.trim() || null },
    { label: 'Contentor', value: raft.containerModel?.trim() || null },
    { label: 'Tamanho do contentor', value: raft.containerSize?.trim() || null },
    { label: 'Altura de estiva', value: raft.maxStowageHeight?.trim() || null },
    { label: 'Data de fabrico', value: raft.dataFabrico?.trim() || null },
    { label: 'Próxima inspeção', value: raft.dataProxInspecao?.trim() || null },
  ];
  return { manual, checks, missing: checks.filter(check => !check.value).map(check => check.label),
    identificationNote: oceanIso ? 'Associação consultiva: confirmar modelo, lotação, embalagem Mk1/Mk2 ou valise, pack, sistema de inflação, ano, revisão vigente e boletins. O manual é destinado a estações autorizadas.' : euroCandidate ? 'Associação consultiva pela designação do modelo. Confirmar variante, aprovação, edição atual e boletins antes da inspeção.' : eurovinil ? 'Eurovinil: confirmar modelo e geração; ISO Type 1/2 pode corresponder a manuais diferentes.' : seasavaCandidate ? 'RFD SeaSava: manual MK III associado por indicação operacional. Confirmar variante, aprovação, edição e componentes antes da inspeção.' : null,
    pendingConfirmation: ['Edição e revisão do manual', 'Aprovação e apêndices aplicáveis', 'Último ensaio GI e histórico de reparações'] };
}
