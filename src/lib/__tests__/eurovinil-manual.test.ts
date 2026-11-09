import { getRaftManualApplicability } from '../raft-manual-applicability';
import { findRaftTechnicalModel } from '@/modules/rafts/raftModelData';

it.each(['Syntesy 9650-1', 'Leisure Syntesy INTL', 'Compact-Dry', 'EUROVINIL SYNTESY 9650-1 >24H', 'EUROVINIL COMPACT-DRY'])('identifies %s as a candidate', model => {
  expect(getRaftManualApplicability({ brand: 'Eurovinil', model }).manual).toContain('2021');
});
it.each(['ISO Type 1', 'ISO Type 2', 'Mariner', 'Outro'])('does not guess the generation for %s', model => {
  expect(getRaftManualApplicability({ brand: 'Eurovinil', model }).manual).toBeNull();
});
it('does not associate another brand by model alone', () => {
  expect(getRaftManualApplicability({ brand: 'Outra', model: 'Syntesy 9650-1' }).manual).toBeNull();
});
it('identifies explicit M14 and Crewsaver MK2 only as candidates', () => {
  expect(getRaftManualApplicability({ brand: 'Eurovinil', model: 'M14 ISO 9650-1 >24H' }).manual).toContain('2017');
  expect(getRaftManualApplicability({ brand: 'Crewsaver', model: 'Mariner MK2' }).manual).toContain('2021');
  expect(getRaftManualApplicability({ brand: 'Crewsaver', model: 'Mariner' }).manual).toBeNull();
});
it('distinguishes the M14 less-than and greater-than 24h models', () => {
  expect(findRaftTechnicalModel('Eurovinil', 'M14 ISO9650-1 >24H')?.name).toBe('ISO 9650-1 >24H');
  expect(findRaftTechnicalModel('Eurovinil', 'M14 ISO9650-1 <24H')?.name).toBe('ISO 9650-1 <24H');
});
it.each(['M14 ISO 9650-1 >24H USA', 'M14 ISO 9650-1 <24H USA', 'M14 ISO 9650-1 ITA G/B', 'M14 BALSA CRUCERO 9650'])('catalogues %s without inventing gas specifications', model => {
  const entry = findRaftTechnicalModel('Eurovinil', model);
  expect(entry?.name).toBe(model);
  expect(entry?.specifications).toEqual([]);
});
it.each(['SYNTESY 9650-1 >24H USA', 'SYNTESY 9650-1 <24H USA', 'SYNTESY-INTL', 'SYNTESY-E USA', 'SYNTESY GREEK'])('catalogues Syntesy variant %s conservatively', model => {
  expect(findRaftTechnicalModel('Eurovinil', model)?.name).toBe(model);
  expect(findRaftTechnicalModel('Eurovinil', model)?.specifications).toEqual([]);
});
it('separates the 2017 Crewsaver catalogue from MK2', () => {
  expect(findRaftTechnicalModel('Crewsaver', 'MARINER (EV 2017)')?.specifications).toEqual([]);
  expect(findRaftTechnicalModel('Crewsaver', 'MARINER MK2')?.specifications).toEqual([]);
  expect(getRaftManualApplicability({ brand: 'Crewsaver', model: 'MARINER (EV 2017)' }).manual).toContain('2017');
});
