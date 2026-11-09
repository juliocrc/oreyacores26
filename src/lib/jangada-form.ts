// Send only changed values, not stale metadata/checklists from a previous GET.
export function jangadaSaveFields(form: Record<string, unknown>) {
  const excluded = [
    'inspecoes', 'certificadoAtivo', 'certificadosExtraidos', 'artigos',
    'ownerDisplay', 'ownerClientId', 'shipDetails',
    'mandatoryPackItems', 'mandatoryPackSource', 'applicableServiceBulletins',
    'createdAt', 'updatedAt', 'serviceStationStatus', 'serviceStationWorkflowStatus',
    'readyForDelivery', 'deliveryMethod', 'delivered', 'deliveredAt', 'expectedDeliveryDate',
  ];
  return Object.fromEntries(Object.entries(form).filter(([key]) => !excluded.includes(key)));
}

export function jangadaSaveChanges(form: Record<string, unknown>, baseline: Record<string, unknown>) {
  return changedJangadaFields(jangadaSaveFields(form), jangadaSaveFields(baseline));
}

// Rebase only after the user has reviewed any fields changed on both sides.
export function rebaseJangadaDraft<T extends Record<string, unknown>>(draft: T, baseline: T, latest: T) {
  const local = jangadaSaveChanges(draft, baseline);
  const remote = jangadaSaveChanges(latest, baseline);
  const conflicts = Object.keys(local).filter(key => key in remote && JSON.stringify(local[key]) !== JSON.stringify(remote[key]));
  return { draft: { ...latest, ...local } as T, conflicts };
}

export function changedJangadaFields(form: Record<string, unknown>, baseline: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(form).filter(([key, value]) =>
    value !== undefined && JSON.stringify(value) !== JSON.stringify(baseline[key]),
  ));
}

// A save response must not discard typing that happened while it was in flight.
export function mergeJangadaSave<T extends Record<string, unknown>>(current: T, submitted: T, saved: Partial<T>): T {
  return { ...current, ...saved, ...changedJangadaFields(current, submitted) };
}

// Match catalogue identity only, never inspection evidence or a similar product.
export function resolveJangadaArticlePhoto(
  article: { stockId?: number | null; referencia?: string | null; codigoFabricante?: string | null; name?: string | null; foto?: string | null },
  stock: readonly { id?: number; referencia?: string | null; codigoFabricante?: string | null; descricao?: string | null; foto?: string | null }[],
): string | null {
  const normalize = (value?: string | null) => (value || '').trim().toLowerCase();
  if (article.foto?.trim()) return article.foto.trim();
  if (article.stockId != null) {
    const linked = stock.find(item => item.id === article.stockId);
    if (linked?.foto?.trim()) return linked.foto.trim();
  }
  const reference = normalize(article.referencia);
  const manufacturer = normalize(article.codigoFabricante);
  const name = normalize(article.name);
  for (const matches of [
    stock.filter(item => reference && normalize(item.referencia) === reference),
    stock.filter(item => manufacturer && normalize(item.codigoFabricante) === manufacturer),
    stock.filter(item => !reference && !manufacturer && name && normalize(item.descricao) === name),
  ]) {
    const photos = [...new Set(matches.map(item => item.foto?.trim()).filter((photo): photo is string => Boolean(photo)))];
    if (photos.length === 1) return photos[0];
    if (photos.length > 1) return null;
  }
  return null;
}

export const JANGADA_LIGHT_EQUIPMENT = [
  { label: 'Bateria de Lítio', source: 'bateria_litio', refKey: 'ref_bateria_litio', qtyKey: 'qtd_bateria_litio', valKey: 'validade_bateria', aliases: [], names: ['bateria de litio', 'bateria litio', 'lithium battery'] },
  { label: 'Luz Interior', source: 'luz_interior_bateria', refKey: 'ref_luz_interior', qtyKey: 'qtd_luz_interior', valKey: 'validade_luz_interior', aliases: [], names: ['luz interior', 'luz interna', 'inside light', 'internal light'] },
  { label: 'Luz Exterior', source: 'luz_exterior_bateria', refKey: 'ref_luz_exterior', qtyKey: 'qtd_luz_exterior', valKey: 'validade_luzes_exteriores', aliases: ['validade_luz_exterior'], names: ['luz exterior', 'luz externa', 'top light', 'outside light', 'external light'] },
] as const;

// Explicit blanks/zero/false in the ficha override older articles or snapshots.
export function readJangadaLightEquipment(
  data: {
    inspectionChecklistValues?: Record<string, unknown>;
    artigos?: Array<{ name: string; referencia?: string | null; quantidade?: number; validade?: string | null }>;
    inspecoes?: Array<{ dataInspecao: string; checklistSnapshot?: Record<string, unknown> | null }>;
  },
  equipment: typeof JANGADA_LIGHT_EQUIPMENT[number],
) {
  const values = data.inspectionChecklistValues || {};
  const snapshot = [...(data.inspecoes || [])].sort((a, b) => b.dataInspecao.localeCompare(a.dataInspecao))[0]?.checklistSnapshot || {};
  const raw = snapshot[equipment.source];
  const rich = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const article = data.artigos?.find(a => equipment.names.some(name => normalize(a.name).includes(name)));
  const resolve = (key: string, fallback: unknown, aliases: readonly string[] = []) => {
    for (const source of [values, snapshot]) {
      for (const candidate of [key, ...aliases]) {
        if (Object.prototype.hasOwnProperty.call(source, candidate) && typeof source[candidate] !== 'object') return source[candidate] ?? '';
      }
    }
    return fallback ?? '';
  };
  return {
    [equipment.refKey]: resolve(equipment.refKey, article?.referencia ?? rich.referencia),
    [equipment.qtyKey]: resolve(equipment.qtyKey, article?.quantidade ?? rich.quantidade),
    [equipment.valKey]: resolve(equipment.valKey, article?.validade ?? rich.validade, equipment.aliases),
    [equipment.source]: resolve(equipment.source, rich.status ?? (article ? 'YES' : '')),
  };
}
