import { getApplicableServiceBulletinsForRaft, technicalBulletins } from '@/modules/rafts/serviceBulletins';

const raft = { brand: 'RFD', model: 'SURVIVA MKIV TO' };
const matches = (value?: string) => getApplicableServiceBulletinsForRaft({ ...raft, cylinderCabecaDisparoRef: value }).some(item => item.id === 'rfd-leafield-gist-head-105-16');
it('requires an explicitly recorded covered head reference', () => {
  expect(matches('08211009')).toBe(true);
  expect(matches('08426009')).toBe(true);
  expect(matches()).toBe(false);
  expect(matches('08211009R')).toBe(false);
  expect(matches('OTHER')).toBe(false);
});
it('limits SB 08/13 to the listed RFD serials without guessing from the model', () => {
  const has = (serial: string) => getApplicableServiceBulletinsForRaft({ ...raft, serial }).some(item => item.id === 'rfd-pyrotechnics-08-13-serials');
  expect(has('5085710208558')).toBe(true);
  expect(has('5085710208559')).toBe(false);
  expect(has('')).toBe(false);
});
it('warns that SB 84/16 excludes side-mounted containers', () => {
  const bulletin = technicalBulletins.find(item => item.id === 'survitec-mk16-drain-holes-84-16');
  expect(bulletin?.description).toContain('não executar em contentores montados de lado');
  expect(bulletin?.rules[0].reasonSuffix).toContain('exclui montagem lateral');
});
