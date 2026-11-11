type Raft = { brand?: string | null; model?: string | null; capacity?: number | string | null; containerModel?: string | null; containerSize?: string | null };

/** DSB CONTAINERS.pdf: dimensions are drawing references, not measured raft data. */
export function containerDrawingReference(raft: Raft) {
  const brand = String(raft.brand || '').trim().toUpperCase();
  if (brand !== 'DSB' && brand !== 'RFD') return null;
  const model = String(raft.containerModel || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const size = String(raft.containerSize || '').trim();
  const drawings: Record<string, { drawing: string; dimensions: string; associations: string[]; note: string }> = {
    'MK10:4': { drawing: '15-03.134, página 5', dimensions: 'Contentor: comprimento 1260 mm, diâmetro 485 mm. Conjunto com berço 6/8 F: largura 674 mm e altura indicada 670 mm.', associations: ['LR 05 / LR 07 TO: 6 ou 8 pessoas com pack SOLAS A; 10 ou 12 pessoas com pack SOLAS B.', 'LR 07 L DL: 12 pessoas com pack SOLAS B.'], note: 'Confirme a configuração e o berço na tabela original.' },
    'MK14:14': { drawing: '15-03.135, página 6', dimensions: 'Contentor: comprimento 1156 mm, diâmetro 584 mm. Conjunto com berço 10/12 F: largura 713 mm e altura indicada 750 mm.', associations: ['LR 07 TO: 10 ou 12 pessoas com pack SOLAS A; 16 ou 20 pessoas com pack SOLAS B.', 'LR 07 L DL: 12 pessoas com pack SOLAS A; 16 pessoas com pack SOLAS B.'], note: 'Confirme a configuração e o berço na tabela original.' },
    'MK14:17': { drawing: '15-03.132 e 15-03.133, páginas 3–4', dimensions: 'Contentor: comprimento 1308 mm, diâmetro 685 mm. O berço varia: 25 F com largura 803 mm ou 16/20 F com largura 725 mm.', associations: ['Berço 25 F (pág. 3): LR 07 TO ou LR 07 L DL, 20 ou 25 pessoas com pack SOLAS A.', 'Berço 16/20 F (pág. 4): LR 07 TO, 16 pessoas com pack A ou 25 com pack B; LR 07 L DL, 16 pessoas com pack A ou 20 ou 25 com pack B.'], note: 'A escolha do berço depende da configuração e do pack. Confirme a tabela do desenho.' },
    'MK16:2': { drawing: '15-03.144, página 7', dimensions: 'Contentor: 1188 × 647 × 320 mm.', associations: [], note: 'O desenho não demonstra a correspondência com uma jangada ou pack específicos.' },
  };
  const result = drawings[`${model}:${size}`];
  if (!result) return null;
  const raftModel = String(raft.model || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const userAssociation = brand === 'RFD' && model === 'MK16' && size === '2' &&
    (raftModel === 'SEASAVAPLUS' || raftModel === 'RFDSEASAVAPLUS') && [10, 12].includes(Number(raft.capacity))
    ? 'SeaSava Plus de 10 e 12 pessoas: associação ao MK16 tamanho 2 indicada pelo utilizador; confirmar a configuração e a edição do manual.' : null;
  return { ...result, userAssociation, brandNote: brand === 'RFD' ? 'Desenho DSB: a utilização na jangada RFD não está comprovada pelo desenho; confirmar o contentor e o manual aplicável.' : 'Referência DSB: confirme a identificação e a revisão do desenho antes de utilizar as medidas.' };
}
