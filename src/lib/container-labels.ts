type Raft = { brand?: string | null; model?: string | null; launchType?: string | null; containerModel?: string | null; containerSize?: string | null };

/** Manual M269-00 p. 1152–1153: universal labels, TO only, excluding DSB LR07. */
export function containerLabelChecklist(raft: Raft) {
  const model = String(raft.model || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const brand = String(raft.brand || '').trim().toUpperCase();
  const launch = String(raft.launchType || '').trim().toUpperCase();
  const family = String(raft.containerModel || '').toUpperCase().replace(/\s/g, '');
  const size = String(raft.containerSize || '').trim();
  const isMk4 = ['RFD', 'SURVITEC'].includes(brand) && /^SURVIVAMK(?:IV|4)(?:DL)?$/.test(model);
  const dlSizes: Record<string, string[]> = { MK10: ['4', '6', '7', '9'], MK14: ['14', '17'], MK20: ['7'] };
  if (isMk4 && (launch === 'DL' || launch.includes('DAVIT')) && dlSizes[family]?.includes(size)) {
    const mk20 = family === 'MK20';
    const labels = [
      ...(!mk20 ? [{ name: 'DO NOT ROLL', reference: '41144001', quantity: 1, position: 1 }] : []),
      { name: 'Lançamento DL 1', reference: mk20 ? '45425011' : '50906002', quantity: 1, position: 2 },
      { name: 'Lançamento DL 2', reference: mk20 ? '45425021' : '50906003', quantity: 1, position: 3 },
      { name: 'Lançamento DL 3', reference: mk20 ? '45425031' : '50906004', quantity: 1, position: 4 },
      { name: 'Etiqueta de dados', reference: '04819001', quantity: 1, position: 5 },
      { name: 'SOLAS 96', reference: '43869001', quantity: 1, position: 6 },
      { name: 'Etiqueta 1', reference: '20085011', quantity: 1, position: 7 },
      { name: 'Etiqueta 2', reference: '20085021', quantity: 2, position: 8 },
      { name: 'Etiqueta 3', reference: '20085031', quantity: 1, position: 9 },
      { name: 'Wheelmark', reference: '43973001', quantity: 1, position: 10 },
      { name: 'Altura máxima / comprimento da retenida', reference: '21196001', quantity: 1, position: 11 },
    ];
    return { supported: true, source: 'manual Marine MK IV M269-00, capítulo 11, páginas 1168–1169', labels };
  }
  // Figure 1110 and legend on p. 1129: universal MK III throwover labels
  // for all rafts, plus container-specific references.
  const mk3KnownSizes: Record<string, string[]> = { MK10: ['3', '4', '6', '7', '9'], MK14: ['12', '14', '17'], MK16: ['2'], MK18: ['1', '3'], G21: ['17'] };
  const mk3UniversalThrowover = [
    { name: 'Etiqueta de dados', reference: '04819001', quantity: 1, position: 1 },
    { name: 'Altura máxima / comprimento da retenida', reference: '21196001', quantity: 1, position: 3 },
    { name: 'DO NOT ROLL', reference: '41144001', quantity: 1, position: 4 },
    { name: 'Logótipo SURVIVA', reference: '20765001', quantity: 1, position: 5 },
    { name: 'Inspeção visual', reference: '05656001', quantity: 1, position: 7 },
    { name: 'SOLAS 96', reference: '43869001', quantity: 1, position: 9 },
    { name: 'Tape DO NOT CUT', reference: '15384001', quantity: 1, position: 15 },
    { name: 'I.A.L. compact disc', reference: '50976001', quantity: 1, position: 16 },
    { name: 'Folheto de instalação', reference: '43409001', quantity: 1, position: 19 },
  ];
  if (brand === 'RFD' && /^SURVIVAMK(?:III|3)(?:TO)?$/.test(model) &&
      (launch === 'TO' || launch.includes('THROW')) && Boolean(mk3KnownSizes[family]?.includes(size))) {
    const mk10Small = family === 'MK10' && ['3', '4'].includes(size);
    const labels = [
      ...mk3UniversalThrowover,
      ...(!mk10Small ? [{ name: 'Marca RFD', reference: '20958011', quantity: 1, position: 10 }] : []),
      ...(mk10Small ? [{ name: 'Marca RFD', reference: '06231001', quantity: 1, position: 8 }] : []),
    ];
    return { supported: true, source: 'manual Surviva MK III 251, capítulo 11, páginas 1126–1131', labels };
  }
  // MK III Davit Launch universal labels (p. 1127–1131).
  if (brand === 'RFD' && /^SURVIVAMK(?:III|3)(?:DL)?$/.test(model) &&
      (launch === 'DL' || launch.includes('DAVIT')) && Boolean(mk3KnownSizes[family]?.includes(size))) {
    const mk10Small = family === 'MK10' && ['3', '4'].includes(size);
    const labels = [
      { name: 'Etiqueta 1', reference: '20085011', quantity: 1, position: 1 },
      { name: 'Etiqueta 2', reference: '20085021', quantity: 1, position: 2 },
      { name: 'Etiqueta 3', reference: '20085031', quantity: 1, position: 3 },
      { name: 'Lançamento DL', reference: '20924011', quantity: 1, position: 4 },
      { name: 'Lançamento DL', reference: '20924021', quantity: 1, position: 5 },
      { name: 'Procedimento de lançamento', reference: '20879001', quantity: 1, position: 6 },
      ...mk3UniversalThrowover.filter(l => l.reference !== '05656001'), // Visual instruction is TO only
      ...(!mk10Small ? [{ name: 'Marca RFD', reference: '20958011', quantity: 1, position: 11 }] : []),
      ...(mk10Small ? [{ name: 'Marca RFD', reference: '06231001', quantity: 1, position: 7 }] : []),
    ];
    return { supported: true, source: 'manual Surviva MK III 251, capítulo 11, páginas 1126–1131', labels };
  }
  const knownSizes: Record<string, string[]> = { MK10: ['3', '4', '6', '7', '9'], MK14: ['12', '14', '17'], MK16: ['2'], MK18: ['1', '3'], G21: ['17'] };
  const supported = ['RFD', 'SURVITEC'].includes(brand) && /^SURVIVAMK(?:IV|4)(?:TO)?$/.test(model)
    && (launch === 'TO' || launch.includes('THROW')) && Boolean(knownSizes[family]?.includes(size));
  if (!supported) return { supported: false, labels: [] };
  return { supported: true, source: 'manual Marine MK IV M269-00, capítulo 11, páginas 1152–1153', labels: [
    { name: 'Etiqueta de dados', reference: '04819001', quantity: 1, position: 1 },
    { name: 'DO NOT ROLL', reference: '41144001', quantity: 1, position: 2 },
    { name: 'SOLAS 96', reference: '43869001', quantity: 1, position: 3 },
    { name: 'Altura máxima / comprimento da retenida', reference: '21196001', quantity: 1, position: 4 },
    { name: 'Wheelmark', reference: '43973001', quantity: 1, position: 5 },
    { name: 'Inspeção visual', reference: '05656001', quantity: 1, position: 6 },
  ] };
}
