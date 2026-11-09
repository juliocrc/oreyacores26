import { getContainerClosureMatchBundle } from '@/modules/rafts/containerClosureStraps';
import { findRaftTechnicalModel } from '@/modules/rafts/raftModelData';

export function closureManualNotes(raft: { brand: string; model: string }) {
  const brand = raft.brand.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const model = raft.model.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (brand === 'DSB' && (model === 'LR97' || model === 'LR97L')) return [
    'DSB LR 97/L, capítulo 4 p. 67: colar o selo da retenida com Terokal 2444 antes do fecho; quantidade e preço por confirmar.',
    'Capítulo 4 p. 68–69: utilizar cintas novas originais; no sistema DL verificar também a alça de abertura aplicável. Tensionador e ferramenta de selagem são ferramentas, não consumíveis por inspeção.',
  ];
  if (model.includes('SURVIVAMKIII') || model.includes('SURVIVAMK3')) return [
    'Surviva MK III, capítulo 8 p. 838: cada cinta é fixada com um crimp; confirmar referência e quantidade conforme contentor e manual.',
    'Aplicar fita “DO NOT CUT” sobre as cintas em cada ranhura; comprimento e preço por confirmar. Fita PVC branca sobre os crimps é opcional.',
    'As duas cintas de catraca usadas para fechar o contentor são ferramentas temporárias, removidas depois do fecho, não cintas de substituição.',
  ];
  return [];
}

/** Only report a quantity when the matching catalogue entries agree. */
export function forecastClosureStraps(raft: { brand: string; model: string; containerModel?: string | null; containerSize?: string | null; capacity: number; packType: string; launchType?: string | null; maxStowageHeight?: string | null }) {
  // DSB LR 97 service manual, chapter 4, printed p. 68 / PDF p. 155.
  // The table identifies the container, not just the raft capacity; never infer
  // the container from the number of persons.
  const model = raft.model.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const brand = raft.brand.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (brand === 'DSB' && (model === 'LR97' || model === 'LR97L')) {
    const container = `${raft.containerModel || ''} ${raft.containerSize || ''}`.toUpperCase().replace(/\s+/g, '');
    const small = /(?:^|[^0-9])(?:4N|6\/8F)(?:$|[^A-Z0-9])/.test(container);
    const large = /(?:^|[^0-9])(?:10\/12F|16\/20F|25F)(?:$|[^A-Z0-9])/.test(container);
    const launch = String(raft.launchType || '').toUpperCase();
    const davit = launch === 'DL' || launch.includes('DAVIT');
    const throwover = launch === 'TO' || launch.includes('THROW');
    if ((small && throwover) || (large && (throwover || davit))) {
      const quantidade = small ? 6 : 8;
      return { quantidade, unitario: 6, total: quantidade * 6, sources: ['DSB LR 97 capítulo 4 p. 68 (PDF 155)'],
        referencias: [davit ? '0.03.03.16.0' : '0.03.03.17.0 / 0.03.03.18.0'], certeza: 'manual' };
    }
    return null;
  }
  // The present MK IV catalogue only distinguishes up to 18 m and 36 m.
  // Do not silently map a higher declared drop height to 36 m.
  const height = Number(raft.maxStowageHeight);
  if (Number.isFinite(height) && height > 36) return null;
  const technical = findRaftTechnicalModel(raft.brand, raft.model);
  const bundle = getContainerClosureMatchBundle({ ...raft, model: technical?.name || raft.model,
    containerModel: raft.containerModel || technical?.containerModel || null });
  const matches = bundle.exactMatches;
  const quantities = [...new Set(matches.map(entry => entry.strapQuantity))];
  if (quantities.length !== 1) return null;
  return { quantidade: quantities[0], unitario: 6, total: quantities[0] * 6,
    sources: [...new Set(matches.map(entry => entry.page).filter(Boolean))],
    referencias: [...new Set(matches.map(entry => entry.stockReference))],
    certeza: matches.every(entry => entry.certainty === 'exact') ? 'manual' : 'operacional' };
}
