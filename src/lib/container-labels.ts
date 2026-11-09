type Raft = { brand?: string | null; model?: string | null; launchType?: string | null; containerModel?: string | null; containerSize?: string | null };

/** Manual M269-00 p. 1152–1153: universal labels, TO only, excluding DSB LR07. */
export function containerLabelChecklist(raft: Raft) {
  const model = String(raft.model || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const brand = String(raft.brand || '').trim().toUpperCase();
  const launch = String(raft.launchType || '').trim().toUpperCase();
  const family = String(raft.containerModel || '').toUpperCase().replace(/\s/g, '');
  const size = String(raft.containerSize || '').trim();
  const knownSizes: Record<string, string[]> = { MK10: ['3', '4', '6', '7', '9'], MK14: ['12', '14', '17'], MK16: ['2'], MK18: ['1', '3'], G21: ['17'] };
  const supported = ['RFD', 'SURVITEC'].includes(brand) && /^SURVIVAMK(?:IV|4)(?:TO)?$/.test(model)
    && (launch === 'TO' || launch.includes('THROW')) && Boolean(knownSizes[family]?.includes(size));
  if (!supported) return { supported: false, labels: [] };
  return { supported: true, labels: [
    { name: 'Etiqueta de dados', reference: '04819001', quantity: 1, position: 1 },
    { name: 'DO NOT ROLL', reference: '41144001', quantity: 1, position: 2 },
    { name: 'SOLAS 96', reference: '43869001', quantity: 1, position: 3 },
    { name: 'Altura máxima / comprimento da retenida', reference: '21196001', quantity: 1, position: 4 },
    { name: 'Wheelmark', reference: '43973001', quantity: 1, position: 5 },
    { name: 'Inspeção visual', reference: '05656001', quantity: 1, position: 6 },
  ] };
}
