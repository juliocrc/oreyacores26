"use client";

import { useEffect, useState } from 'react';
import type { AgendaAvailability as Availability, AgendaSuggestion } from '@/types/agenda-page';
import { agendaDateTime } from './agenda-ui-dates';

type Props = {
  stationId?: number | null;
  refreshKey?: number;
  date: string;
  durationMinutes?: number;
  responsavel?: string;
  raftSerial?: string;
  excludeId?: string | number;
  onSelect?: (suggestion: AgendaSuggestion) => void;
  onLoad?: (availability: Availability) => void;
};

const minutes = (value: number) => `${Math.floor(value / 60)}h${String(value % 60).padStart(2, '0')}`;

export default function AgendaAvailability({ stationId, refreshKey, date, durationMinutes = 180, responsavel, raftSerial, excludeId, onSelect, onLoad }: Props) {
  const query = new URLSearchParams({ date, durationMinutes: String(durationMinutes) });
  if (stationId != null) query.set('stationId', String(stationId));
  if (responsavel) query.set('responsavel', responsavel);
  if (raftSerial) query.set('raftSerial', raftSerial);
  if (excludeId !== undefined) query.set('excludeId', String(excludeId));
  const key = query.toString();
  const [state, setState] = useState<{ key: string; data?: Availability; error?: string }>({ key: '' });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (stationId === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    let active = true;
    let controller: AbortController | undefined;
    const load = async () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        const response = await fetch(`/api/agenda/disponibilidade?${key}`, { signal: request.signal, cache: 'no-store' });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error || `Não foi possível consultar disponibilidade (${response.status}).`);
        }
        const data: Availability = await response.json();
        if (active && !request.signal.aborted) { setState({ key, data }); onLoad?.(data); }
      } catch (error) {
        if (active && !request.signal.aborted) setState({ key, error: error instanceof Error ? error.message : 'Falha ao consultar disponibilidade.' });
      }
    };
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 60000);
    return () => { active = false; controller?.abort(); window.clearInterval(timer); };
  }, [key, retry, date, stationId, onLoad, refreshKey]);

  const current = stationId !== null && state.key === key ? state : undefined;
  return (
    <section className="rounded-xl border border-line bg-surface p-3 my-3" aria-label={onSelect ? 'Próximo horário livre' : 'Capacidade semanal'}>
      <h3 className="text-sm font-semibold text-ink">{onSelect ? 'Próximo horário livre' : 'Capacidade semanal'}</h3>
      <p className="text-xs text-ink-muted mt-1">Horário dos Açores (Atlantic/Azores). {onSelect ? `Estimado: ${durationMinutes} min de trabalho.` : 'Carga estimada, incluindo buffers; não representa duração real. Valores em horas e minutos.'}</p>
      {!current && <p role="status" className="text-sm mt-2">{stationId === null ? 'Selecione uma estação para consultar disponibilidade.' : /^\d{4}-\d{2}-\d{2}$/.test(date) ? 'A consultar disponibilidade...' : 'Escolha uma data para consultar disponibilidade.'}</p>}
      {current?.error && <div role="alert" className="text-sm text-red-700 mt-2">{current.error} <button type="button" className="underline" onClick={() => setRetry(value => value + 1)}>Tentar novamente</button></div>}
      {current?.data && <>
        {!onSelect && <>
          <p className="text-xs text-ink-muted my-2">Semana: {current.data.weekStart.slice(0, 10)} a {current.data.weekEnd.slice(0, 10)}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left whitespace-nowrap">
              <thead><tr><th className="p-2">Técnico / dia</th><th className="p-2">Capacidade</th><th className="p-2">Ocupado</th><th className="p-2">Livre</th><th className="p-2">Sobrecarga</th></tr></thead>
              <tbody>{current.data.technicians.map(tech => <tr key={tech.id} className="border-t border-line">
                <th className="p-2 align-top font-medium">{tech.nome}<details className="font-normal mt-1"><summary className="cursor-pointer">Por dia</summary>{tech.days.map(day => <p key={day.date} className="py-1">{day.date}: {minutes(day.freeMinutes)} livre / {minutes(day.occupiedMinutes)} ocupado / {minutes(day.availableMinutes)} capacidade{day.overbookedMinutes > 0 ? ` / ${minutes(day.overbookedMinutes)} sobrecarga` : ''}</p>)}</details></th>
                <td className="p-2 align-top">{minutes(tech.totals.availableMinutes)}</td><td className="p-2 align-top">{minutes(tech.totals.occupiedMinutes)}</td><td className="p-2 align-top">{minutes(tech.totals.freeMinutes)}</td><td className={`p-2 align-top ${tech.totals.overbookedMinutes > 0 ? 'text-red-700 font-semibold' : ''}`}>{minutes(tech.totals.overbookedMinutes)}</td>
              </tr>)}</tbody>
            </table>
          </div>
          {current.data.technicians.length === 0 && <p className="text-sm">Sem técnicos disponíveis nesta estação.</p>}
          <p className="text-xs mt-2">Sem responsável: {minutes(current.data.unassignedMinutes)}</p>
        </>}
        {onSelect && <div className="mt-2 space-y-2">
          {current.data.suggestions.length === 0 && <p className="text-sm">Sem horários livres para estes critérios.</p>}
          {current.data.suggestions.map((suggestion, index) => <button type="button" key={`${suggestion.start}-${suggestion.responsavel}-${index}`} onClick={() => onSelect(suggestion)} className="block w-full rounded-lg border border-indigo-200 px-3 py-2 text-left text-xs text-indigo-800 hover:bg-indigo-50">
            {agendaDateTime(suggestion.start).replace('T', ' ')} até {agendaDateTime(suggestion.end).replace('T', ' ')} · {suggestion.responsavel}
          </button>)}
        </div>}
        {current.data.warnings?.map((warning, index) => <p key={index} role="status" className="text-xs text-amber-800 mt-2">{warning}</p>)}
      </>}
      {onSelect && <p className="text-xs text-ink-muted mt-2">Escolher apenas preenche a data, hora e técnico. Esta pré-visualização não reserva o horário; o servidor volta a validar ao guardar conflitos do técnico, ausências e jangada. Não é uma reserva atómica: gravações simultâneas podem concorrer. As sugestões usam buffers de 15 min antes e depois.</p>}
    </section>
  );
}
