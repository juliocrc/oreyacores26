import { normalizeJulinhoText, parseJulinhoIntent } from './julinho-intents';

// Entity search terms stay in component memory only and are retained only after
// the server confirms that the lookup had a single result.
export type ConversationTopic = 'inspections' | { kind: 'jangada' | 'stock-item'; term: string } | null;

export function resolveJulinhoFollowUp(text: string, topic: ConversationTopic): { query: string; topic: ConversationTopic } {
  const normalized = normalizeJulinhoText(text);
  if (topic && typeof topic === 'object') {
    const raftFollowUp = /^(?:e\s+)?(?:qual e |qual a |quando e |quando |diz me |mostra me )?(?:a |o |as |os )?(?:proxima inspecao|ultima inspecao|inspecao|vistoria|certificado|modelo|marca|lotacao|capacidade|pack|embarcacao|navio|proprietario|armador)(?: dela| dessa jangada| da jangada)?$/.test(normalized);
    const stockFollowUp = /^(?:e\s+)?(?:qual e |qual a |quanto |quantas |quantos |diz me |mostra me )?(?:a |o |as |os )?(?:validade|localizacao|quantidade|stock|existencias|unidades|referencia)(?: dele| desse artigo| do artigo)?$/.test(normalized);
    if ((topic.kind === 'jangada' && raftFollowUp) || (topic.kind === 'stock-item' && stockFollowUp)) {
      return { query: `${topic.kind === 'jangada' ? 'jangada' : 'artigo'} ${topic.term}`, topic };
    }
  }
  if (topic === 'inspections' && /^(?:e\s+)?(?:esta|essa|nesta|nessa) semana$/.test(normalized)) {
    return { query: 'que inspeções de jangadas vencem esta semana', topic: 'inspections' };
  }
  if (topic === 'inspections' && /^(?:e\s+)?(?:a\s+)?proxima semana$/.test(normalized)) {
    return { query: 'que inspeções de jangadas vencem na próxima semana', topic: 'inspections' };
  }
  if (topic === 'inspections' && /^(?:e\s+)?(?:para\s+)?(hoje|amanha)$/.test(normalized)) {
    return { query: `que inspeções de jangadas vencem ${normalized.endsWith('hoje') ? 'hoje' : 'amanhã'}`, topic: 'inspections' };
  }
  if (topic === 'inspections' && /^(?:e\s+)?(?:as\s+)?(?:vencidas|em atraso)$/.test(normalized)) {
    return { query: 'que inspeções de jangadas estão vencidas', topic: 'inspections' };
  }
  const intent = parseJulinhoIntent(text);
  const next = intent.kind === 'query' && (intent.topic === 'inspections' || intent.topic === 'inspections-week' || intent.topic === 'inspections-period') ? 'inspections' : null;
  return { query: text, topic: next };
}
