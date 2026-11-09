import { getLocalDateKey, parseFlexibleDate } from '@/lib/date-utils';

export type NotificacaoItem = {
  id: string;
  tipo: 'whatsapp' | 'alerta' | 'assistencia' | 'orcamento' | 'agendamento';
  titulo: string;
  descricao: string;
  data: string;
  link: string;
  status?: string;
};

export type NotificacoesPayload = { items: NotificacaoItem[]; errors: string[] };

export function notificationDateKey(value: string | Date | null) {
  const parsed = parseFlexibleDate(value);
  return parsed ? getLocalDateKey(parsed) : '';
}

export async function collectNotificationSources(sources: { label: string; load: () => Promise<NotificacaoItem[]> }[]): Promise<NotificacoesPayload> {
  const results = await Promise.allSettled(sources.map(source => Promise.resolve().then(source.load)));
  const items: NotificacaoItem[] = [];
  const errors: string[] = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') items.push(...result.value);
    else {
      console.error(`Erro nas notificações: ${sources[index].label}`, result.reason);
      errors.push(`Não foi possível carregar ${sources[index].label}.`);
    }
  });
  items.sort((a, b) => (parseFlexibleDate(b.data)?.getTime() ?? 0) - (parseFlexibleDate(a.data)?.getTime() ?? 0) || a.id.localeCompare(b.id));
  return { items, errors };
}
