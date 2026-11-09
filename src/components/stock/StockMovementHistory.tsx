"use client";

import { useEffect, useRef, useState } from "react";

type Movement = {
  id: number; tipo: string; quantidadeAntes: number; quantidadeDepois: number;
  usuario: string | null; motivo: string | null; createdAt: string;
  reversaoDeId: number | null; estorno: { id: number } | null; canReverse: boolean;
};

export default function StockMovementHistory({ stockId, revision = 0, onReversed, onBusyChange }: {
  stockId: number; revision?: number; onReversed: () => void | Promise<void>; onBusyChange?: (busy: boolean) => void;
}) {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const busyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setMovements([]);
    setSelected(null);
    setError("");
    fetch(`/api/stock/${stockId}/movimentos`, { cache: "no-store" })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Erro ao consultar historico.");
        if (!cancelled) setMovements(data.movements);
      }).catch(error => { if (!cancelled) setError(error.message); });
    return () => { cancelled = true; };
  }, [stockId, revision, refresh]);

  async function reverse() {
    if (!selected || !reason.trim() || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      const response = await fetch(`/api/stock/${stockId}/movimentos/${selected}/estornar`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ motivo: reason.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao estornar.");
      setSelected(null);
      setReason("");
      setRefresh(value => value + 1);
      await onReversed();
    } catch (error) { setError(error instanceof Error ? error.message : "Erro ao estornar."); }
    finally { busyRef.current = false; setBusy(false); onBusyChange?.(false); }
  }

  return <section className="mt-6 space-y-3 border-t border-slate-200 pt-6">
    <h2 className="text-lg font-bold text-slate-900">Historico de movimentos</h2>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {!movements.length && !error && <p className="text-sm text-slate-500">Sem movimentos.</p>}
    {movements.map(movement => <article id={`movimento-${movement.id}`} key={movement.id} className="rounded-xl border border-slate-200 p-4 text-sm space-y-2">
      <p className="font-semibold">#{movement.id} {movement.tipo}: {movement.quantidadeAntes} {"->"} {movement.quantidadeDepois}</p>
      <p className="text-slate-600">{new Date(movement.createdAt).toLocaleString("pt-PT")} | {movement.usuario || "Autor nao registado"}</p>
      <p>{movement.motivo || "Motivo nao registado"}</p>
      {movement.reversaoDeId && <a className="text-indigo-700 underline" href={`#movimento-${movement.reversaoDeId}`}>Original #{movement.reversaoDeId}</a>}
      {movement.estorno && <a className="text-indigo-700 underline" href={`#movimento-${movement.estorno.id}`}>Estornado por #{movement.estorno.id}</a>}
      {movement.canReverse && <button type="button" disabled={busy} onClick={() => { setSelected(movement.id); setReason(""); }} className="block font-semibold text-indigo-700">Estornar movimento #{movement.id}</button>}
      {selected === movement.id && <div className="space-y-2">
        <p>O original sera mantido. O delta inverso sera aplicado ao saldo atual.</p>
        <label className="block">Motivo do estorno
          <textarea required maxLength={300} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} className="block w-full rounded border border-slate-300 p-2" />
        </label>
        <button type="button" disabled={busy || !reason.trim()} onClick={() => void reverse()} className="rounded bg-indigo-600 px-3 py-2 text-white disabled:opacity-50">Confirmar estorno</button>
        <button type="button" disabled={busy} onClick={() => setSelected(null)} className="ml-3">Cancelar</button>
      </div>}
    </article>)}
  </section>;
}
