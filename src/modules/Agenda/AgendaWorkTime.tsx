'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

type WorkTime = {
  eventId: number;
  ordemId: number | null;
  estimatedMinutes: number;
  actualMinutes?: number;
  entries?: unknown[];
  source?: string;
  activeEntry?: { startedAt?: string } | null;
  measuredAt?: string;
  status?: string;
  updatedAt?: string;
  canEdit: boolean;
};

/** ordemId is an explicit suggestion only: associating it always requires confirmation. */
export default function AgendaWorkTime({ eventId, ordemId, onChange }: {
  eventId: number;
  ordemId?: number | null;
  onChange?: () => void;
}) {
  const [result, setResult] = useState<{ eventId: number; data?: WorkTime; error?: string } | null>(null);
  const [selectedOrder, setSelectedOrder] = useState('');
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const pending = useRef(false);
  const generation = useRef(0);
  const data = result?.eventId === eventId ? result.data : undefined;
  const error = result?.eventId === eventId ? result.error : undefined;

  useEffect(() => {
    const controller = new AbortController();
    const current = ++generation.current;
    fetch(`/api/agenda/${eventId}/time`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Erro ao consultar tempos.');
        if (current === generation.current && !controller.signal.aborted) setResult({ eventId, data: body });
      })
      .catch(reason => { if (!controller.signal.aborted && current === generation.current) setResult({ eventId, error: reason.message }); });
    return () => { controller.abort(); generation.current++; };
  }, [eventId, reload]);

  useEffect(() => {
    if (!data?.activeEntry) return;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [data?.activeEntry]);

  async function act(action: string) {
    if (pending.current || !data) return;
    pending.current = true;
    setBusy(true);
    const current = generation.current;
    try {
      const response = await fetch(`/api/agenda/${eventId}/time`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, updatedAt: data.updatedAt, ...(action === 'link' ? { ordemId: Number(selectedOrder || ordemId) } : {}) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Erro ao registar tempo.');
      if (current === generation.current) { setResult({ eventId, data: body }); onChange?.(); }
    } catch (reason) {
      if (current === generation.current) {
        setResult({ eventId, data, error: reason instanceof Error ? reason.message : 'Erro ao registar tempo.' });
        // A failed response may follow a committed write. Re-read, never retry a mutation automatically.
        setReload(value => value + 1);
      }
    } finally { pending.current = false; setBusy(false); }
  }

  const closed = data?.status === 'concluida' || data?.status === 'cancelada';
  const elapsed = data?.activeEntry && data.measuredAt ? Math.max(0, (clock - Date.parse(data.measuredAt)) / 60000) : 0;
  const actual = (data?.actualMinutes || 0) + elapsed;
  const delta = actual - (data?.estimatedMinutes || 0);
  const hasActual = data?.source === 'metadados.timeEntries' && Boolean(data.entries?.length) && typeof data.actualMinutes === 'number';
  const button = 'min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50';
  return <section aria-label="Tempo de execucao" aria-busy={busy} className="space-y-3 rounded-lg border border-slate-200 p-4">
    <h3 className="font-semibold">Tempo de execucao</h3>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {!data ? <button type="button" className={button} onClick={() => setReload(value => value + 1)}>{error ? 'Tentar novamente' : 'A carregar tempos...'}</button> : <>
      <p className="text-sm">Estimado: {data.estimatedMinutes} min{hasActual ? <> | Real: {actual.toFixed(1)} min | Desvio: {delta >= 0 ? '+' : ''}{delta.toFixed(1)} min</> : ' | Real: indisponivel (sem tempos registados)'}</p>
      {data.ordemId == null ? <>
        <p className="text-sm text-slate-600">Sem OT associada. Selecione uma OT existente; nao e criada nenhuma automaticamente.</p>
        {data.canEdit && <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); void act('link'); }}>
          <label className="text-sm">ID da OT existente
            <input aria-label="ID da OT existente" className="ml-2 min-h-11 w-28 rounded border border-slate-300 px-2" type="number" min="1" step="1" required value={selectedOrder || ordemId || ''} onChange={event => setSelectedOrder(event.target.value)} />
          </label>
          <button className={button} disabled={busy} type="submit">Associar OT</button>
          <Link href="/ordens-servico" className={button}>Consultar OTs</Link>
        </form>}
      </> : <>
        <p className="text-sm"><Link className="text-blue-700 underline" href={`/ordens-servico/${data.ordemId}`}>Abrir OT #{data.ordemId}</Link> | {closed ? 'Fechada' : data.activeEntry ? 'Em execucao' : data.status === 'pausada' ? 'Pausada' : 'Por iniciar'}</p>
        {data.canEdit && !closed && <div className="flex flex-wrap gap-2">
          <button type="button" className={button} disabled={busy || Boolean(data.activeEntry)} onClick={() => void act('start')}>{data.status === 'pausada' ? 'Retomar' : 'Iniciar'}</button>
          <button type="button" className={button} disabled={busy || !data.activeEntry} onClick={() => void act('pause')}>Pausar</button>
          <button type="button" className={button} disabled={busy} onClick={() => void act('complete')}>Concluir</button>
        </div>}
        <p className="text-xs text-slate-500">Fonte do real: metadados.timeEntries da OT explicitamente associada, acumulado dos intervalos sem pausas. A estimativa e os buffers da agenda nao sao alterados.</p>
      </>}
    </>}
  </section>;
}
