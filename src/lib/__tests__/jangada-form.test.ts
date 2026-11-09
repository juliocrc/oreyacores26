import { changedJangadaFields, jangadaSaveChanges, mergeJangadaSave, JANGADA_LIGHT_EQUIPMENT, readJangadaLightEquipment } from '../jangada-form';
import { getValidityCoverageStatus } from '../stock-validity';

it('uses exactly the save projection for dirty checks and ignores refreshed metadata', () => {
  const baseline = { serial: 'A', artigos: [], inspecoes: [], ownerDisplay: 'Old', delivered: false, updatedAt: 'old' };
  const refreshed = { ...baseline, artigos: [{ id: 1 }], inspecoes: [{ id: 2 }], ownerDisplay: 'New', delivered: true, updatedAt: 'new' };
  expect(jangadaSaveChanges(refreshed, baseline)).toEqual({});
  expect(jangadaSaveChanges({ ...refreshed, serial: 'B' }, baseline)).toEqual({ serial: 'B' });
  expect(jangadaSaveChanges({ ...refreshed, serial: 'A' }, baseline)).toEqual({});
});

it('remains dirty only for typing made during a save, and clears after the next save', () => {
  const submitted = { serial: 'A', cylinderTara: '1,5' };
  const saved = { cylinderTara: '1.5' };
  const baseline = { ...submitted, ...saved };
  const current = mergeJangadaSave({ ...submitted, serial: 'AB' }, submitted, saved);
  expect(jangadaSaveChanges(current, baseline)).toEqual({ serial: 'AB' });
  expect(jangadaSaveChanges(current, current)).toEqual({});
});

it.each(JANGADA_LIGHT_EQUIPMENT)('checks $label independently through the next inspection, not today', equipment => {
  const data = { inspectionChecklistValues: { [equipment.valKey]: '06/2027' } };
  const expiry = String(readJangadaLightEquipment(data, equipment)[equipment.valKey]);
  expect(getValidityCoverageStatus(expiry, '2027-06-30')).toBe('ok');
  expect(getValidityCoverageStatus(expiry, '2027-07-01')).toBe('replace');
  expect(getValidityCoverageStatus(expiry, '')).toBe('pending');
});

it('does not resend old checklist values, dates or capacity on an unrelated edit', () => {
  const baseline = { capacity: 25, dataInspecao: '2026-01-01', inspectionChecklistValues: { cylinderSerial: 'OLD' }, cylinderSerial: 'OLD' };
  expect(changedJangadaFields({ ...baseline, cylinderSerial: 'NEW' }, baseline)).toEqual({ cylinderSerial: 'NEW' });
});

it('preserves explicit clearing, zero and false while omitting undefined', () => {
  expect(changedJangadaFields({ owner: '', shipId: null, capacity: 0, delivered: false, missing: undefined },
    { owner: 'Owner', shipId: 1, capacity: 25, delivered: true })).toEqual({ owner: '', shipId: null, capacity: 0, delivered: false });
});

it('keeps typing made during a slow save, including edits to the same field', () => {
  const submitted = { serial: 'A', owner: 'Owner', cylinderTara: '1,5' };
  const current = { ...submitted, serial: 'AB', owner: '' };
  expect(mergeJangadaSave(current, submitted, { serial: 'A', owner: 'Owner', cylinderTara: '1.5' }))
    .toEqual({ serial: 'AB', owner: '', cylinderTara: '1.5' });
});

it('uses canonical saved values when the user did not change them during the save', () => {
  const submitted = { cylinderTara: '1,5' };
  expect(mergeJangadaSave(submitted, submitted, { cylinderTara: '1.5' })).toEqual({ cylinderTara: '1.5' });
});

describe('lighting equipment in the ficha', () => {
  const [battery, inside, outside] = JANGADA_LIGHT_EQUIPMENT;

  it.each(JANGADA_LIGHT_EQUIPMENT)('loads $label reference, quantity and expiry from active articles', equipment => {
    const result = readJangadaLightEquipment({ artigos: [{ name: equipment.label, referencia: 'PN-1', quantidade: 2, validade: '2030-06-30' }] }, equipment);
    expect(result).toEqual({ [equipment.refKey]: 'PN-1', [equipment.qtyKey]: 2, [equipment.valKey]: '2030-06-30', [equipment.source]: 'YES' });
  });

  it('keeps all three expiry dates independent and accepts the pack exterior alias', () => {
    const data = { inspectionChecklistValues: { validade_bateria: '2030-01', validade_luz_interior: '2031-02', validade_luz_exterior: '2032-03' } };
    expect(readJangadaLightEquipment(data, battery)[battery.valKey]).toBe('2030-01');
    expect(readJangadaLightEquipment(data, inside)[inside.valKey]).toBe('2031-02');
    expect(readJangadaLightEquipment(data, outside)[outside.valKey]).toBe('2032-03');
  });

  it('loads rich wizard values from the newest inspection without mutating history', () => {
    const snapshot = { luz_interior_bateria: { referencia: 'RL5', validade: '06/2030', status: 'NA', lote: 'L1' } };
    const data = { inspecoes: [{ dataInspecao: '2025-01-01', checklistSnapshot: {} }, { dataInspecao: '2026-01-01', checklistSnapshot: snapshot }] };
    expect(readJangadaLightEquipment(data, inside)).toMatchObject({ ref_luz_interior: 'RL5', validade_luz_interior: '06/2030', luz_interior_bateria: 'NA' });
    expect(snapshot.luz_interior_bateria.lote).toBe('L1');
    expect(data.inspecoes[0].dataInspecao).toBe('2025-01-01');
  });

  it('preserves explicit clearing, zero and false over stale article and snapshot data', () => {
    const data = {
      inspectionChecklistValues: { ref_luz_interior: '', qtd_luz_interior: 0, validade_luz_interior: '', luz_interior_bateria: false },
      artigos: [{ name: 'Inside Light and Battery', referencia: 'OLD', quantidade: 1, validade: '2030-01-01' }],
      inspecoes: [{ dataInspecao: '2026-01-01', checklistSnapshot: { luz_interior_bateria: { validade: '01/2031', status: 'OK' } } }],
    };
    expect(readJangadaLightEquipment(data, inside)).toEqual(data.inspectionChecklistValues);
  });

  it('saves equipment edits without dropping other checklist fields', () => {
    const baseline = { inspectionChecklistValues: { ref_bateria_litio: 'OLD', cylinderSerial: 'CYL' } };
    const form = { inspectionChecklistValues: { ...baseline.inspectionChecklistValues, ref_bateria_litio: 'NEW', validade_luz_interior: '' } };
    const payload = changedJangadaFields(form, baseline);
    expect(payload).toEqual(form);
    expect(mergeJangadaSave(form, form, JSON.parse(JSON.stringify(payload)))).toEqual(form);
  });
});
import { rebaseJangadaDraft } from '../jangada-form';

describe('rebaseJangadaDraft', () => {
  it('preserves local edits while incorporating unrelated server changes', () => {
    const baseline = { updatedAt: 'old', testeWP: 'old', owner: 'A' };
    expect(rebaseJangadaDraft({ ...baseline, testeWP: 'new' }, baseline, { ...baseline, updatedAt: 'new', owner: 'B' })).toEqual({
      draft: { updatedAt: 'new', testeWP: 'new', owner: 'B' }, conflicts: [],
    });
  });
  it('reports overlapping edits instead of silently accepting them', () => {
    const baseline = { testeWP: 'old' };
    expect(rebaseJangadaDraft({ testeWP: 'local' }, baseline, { testeWP: 'server' }).conflicts).toEqual(['testeWP']);
  });
});
