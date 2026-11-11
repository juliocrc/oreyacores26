/** Structured input only; no service-life or replacement decision is inferred. */
export const LEAFIELD_COMPONENTS = ['cabeca', 'valvula', 'mangueiraSuperior', 'mangueiraInferior'] as const;
export type LeafieldComponentKey = typeof LEAFIELD_COMPONENTS[number];
export type LeafieldComponent = {
  referencia: string;
  numeroSerie: string;
  dataFabrico: string;
  dataInstalacao: string;
  foto: string;
  disparos: Array<{ data: string; observacoes: string }>;
};
export type LeafieldComponents = Partial<Record<LeafieldComponentKey, LeafieldComponent>>;

function validDate(value: string): boolean {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateLeafieldComponents(input: unknown): { data: LeafieldComponents | null; error: string | null } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { data: null, error: 'Dados de componentes inválidos.' };
  const data: LeafieldComponents = {};
  for (const [key, raw] of Object.entries(input)) {
    if (!LEAFIELD_COMPONENTS.includes(key as LeafieldComponentKey) || !raw || typeof raw !== 'object' || Array.isArray(raw)) return { data: null, error: 'Componente desconhecido ou inválido.' };
    const component = raw as Record<string, unknown>;
    const allowed = ['referencia', 'numeroSerie', 'dataFabrico', 'dataInstalacao', 'foto', 'disparos'];
    if (Object.keys(component).some(field => !allowed.includes(field))) return { data: null, error: 'Campo de componente desconhecido.' };
    const read = (field: string) => typeof component[field] === 'string' ? (component[field] as string).trim() : '';
    if (allowed.slice(0, 5).some(field => component[field] != null && typeof component[field] !== 'string')) return { data: null, error: 'Campo de componente inválido.' };
    const dataFabrico = read('dataFabrico');
    const dataInstalacao = read('dataInstalacao');
    if (!validDate(dataFabrico) || !validDate(dataInstalacao)) return { data: null, error: 'Data de componente inválida.' };
    const foto = read('foto');
    if (foto && (!foto.startsWith('/api/') || foto.startsWith('//') || foto.length > 2048)) return { data: null, error: 'A fotografia deve usar um endereço interno autorizado.' };
    if (component.disparos != null && !Array.isArray(component.disparos)) return { data: null, error: 'Histórico de disparos inválido.' };
    const entries = (component.disparos || []) as unknown[];
    if (entries.length > 100) return { data: null, error: 'Demasiados registos de disparo.' };
    const disparos: LeafieldComponent['disparos'] = [];
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return { data: null, error: 'Registo de disparo inválido.' };
      const row = entry as Record<string, unknown>;
      if (Object.keys(row).some(field => !['data', 'observacoes'].includes(field)) || typeof row.data !== 'string' || !row.data || !validDate(row.data) || (row.observacoes != null && typeof row.observacoes !== 'string')) return { data: null, error: 'Registo de disparo inválido.' };
      disparos.push({ data: row.data, observacoes: String(row.observacoes || '').trim() });
    }
    const referencia = read('referencia');
    const numeroSerie = read('numeroSerie');
    if (referencia.length > 200 || numeroSerie.length > 200 || disparos.some(row => row.observacoes.length > 2000)) return { data: null, error: 'Campo de componente demasiado longo.' };
    data[key as LeafieldComponentKey] = { referencia, numeroSerie, dataFabrico, dataInstalacao, foto, disparos };
  }
  return { data, error: null };
}
