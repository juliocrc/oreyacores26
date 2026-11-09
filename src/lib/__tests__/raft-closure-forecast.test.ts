import { closureManualNotes, forecastClosureStraps } from '../raft-closure-forecast';

const base = { brand: 'RFD', model: 'SURVIVA MKIV TO', containerModel: 'MK10', launchType: 'TO', maxStowageHeight: '18' };

it.each([
  [4, 'SOLAS A', 4],
  [10, 'SOLAS A', 6],
  [16, 'SOLAS A', 8],
  [20, 'SOLAS A', 10],
])('uses the catalogue count for %s persons and %s', (capacity, packType, quantity) => {
  expect(forecastClosureStraps({ ...base, capacity, packType })).toMatchObject({ quantidade: quantity, unitario: 6, total: quantity * 6, sources: ['1120'] });
});

it('does not invent a quantity for an unknown model or capacity', () => {
  expect(forecastClosureStraps({ ...base, model: 'Unknown', capacity: 4, packType: 'SOLAS A' })).toBeNull();
  expect(forecastClosureStraps({ ...base, capacity: 99, packType: 'SOLAS A' })).toBeNull();
});

it.each([
  ['6/8 F', 'TO', 6], ['10/12 F', 'TO', 8], ['16/20 F', 'DL', 8], ['25 F', 'DL', 8],
])('uses the DSB manual for container %s, launch %s', (containerSize, launchType, quantidade) => {
  expect(forecastClosureStraps({ brand: 'DSB', model: 'LR 97', containerSize, launchType, capacity: 12, packType: 'SOLAS A' }))
    .toMatchObject({ quantidade, total: quantidade * 6, certeza: 'manual' });
});

it('does not infer DSB container size from capacity or assume davit small containers', () => {
  const raft = { brand: 'DSB', model: 'LR 97 L', capacity: 12, packType: 'SOLAS A', launchType: 'DL' };
  expect(forecastClosureStraps(raft)).toBeNull();
  expect(forecastClosureStraps({ ...raft, containerSize: '6/8 F' })).toBeNull();
});

it('does not apply the 36 m catalogue to a higher stowage height', () => {
  expect(forecastClosureStraps({ ...base, capacity: 10, packType: 'SOLAS A', maxStowageHeight: '40' })).toBeNull();
});

it('separates MK III crimps and tape from temporary tools', () => {
  const notes = closureManualNotes({ brand: 'RFD', model: 'SURVIVA MKIII TO' }).join(' ');
  expect(notes).toContain('crimp');
  expect(notes).toContain('DO NOT CUT');
  expect(notes).toContain('ferramentas temporárias');
  expect(closureManualNotes({ brand: 'DSB', model: 'LR 97' }).join(' ')).toContain('Terokal 2444');
});
