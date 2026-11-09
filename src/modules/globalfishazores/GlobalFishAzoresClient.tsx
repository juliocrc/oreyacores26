"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { FleetVessel, VesselHistory } from "./history";

const HistoryMap = dynamic(() => import("./HistoryMap"), {
  ssr: false,
  loading: () => <p role="status" className="p-6">A carregar mapa...</p>,
});

export default function GlobalFishAzoresClient() {
  const [fleet, setFleet] = useState<FleetVessel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [history, setHistory] = useState<VesselHistory | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [querying, setQuerying] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/navios", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Nao foi possivel carregar a lista de embarcacoes.");
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error("Formato da lista de embarcacoes inesperado.");
        if (!controller.signal.aborted) setFleet(data);
      })
      .catch((err: Error) => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);

  // Abort a pending history query when the selection changes or the screen unmounts.
  const [requestId, setRequestId] = useState(0);
  useEffect(() => {
    if (!requestId || !selectedId) return;
    const controller = new AbortController();
    fetch(`/api/globalfishazores/history?vesselId=${selectedId}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Erro ao consultar historico.");
        if (!controller.signal.aborted) setHistory(data);
      })
      .catch((err: Error) => { if (!controller.signal.aborted) setHistoryError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setQuerying(false); });
    return () => controller.abort();
  }, [requestId, selectedId]);

  const filtered = fleet.filter((vessel) => [vessel.nome, vessel.matricula, vessel.mmsi, vessel.imo, vessel.ilha]
    .some((value) => String(value ?? "").toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())));
  const selected = fleet.find((vessel) => String(vessel.id) === selectedId);

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:py-8">
      <header className="rounded-3xl bg-slate-950 p-6 text-white sm:p-8">
        <p className="text-sm font-bold text-sky-300">GlobalFish Azores</p>
        <h1 className="mt-2 text-2xl font-black sm:text-4xl">Localizacoes da frota: ultimas 48 horas</h1>
        <p className="mt-3 max-w-3xl text-sm text-slate-300">Historico AIS disponivel das embarcacoes da lista da aplicacao. Posicoes e trajetos AIS nao comprovam atividade de pesca.</p>
      </header>

      <section className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50 p-5 text-sm text-slate-800" aria-label="Fontes e limitacoes">
        <h2 className="font-bold">Fonte e limites de cobertura</h2>
        <p>Lista: /api/navios, respeitando a estacao atual. Historico: OpenWaters AIS, consultado apenas quando solicitado. Correspondencia por MMSI da ficha; IMO apresentado para verificacao, nunca convertido num MMSI.</p>
        <p>A base local guarda apenas uma posicao, nao um historico; a data de gravacao nao prova a hora da observacao AIS. Essas coordenadas nao sao usadas neste mapa. Sem pontos com hora valida nas ultimas 48h, o mapa fica sem marcadores.</p>
        <p>A consulta anonima pode nao ter cobertura ou exigir autorizacao. Nao existe integracao de eventos de pesca GFW/Skylight neste ecra. Nao sao utilizadas credenciais nem fornecedores pagos.</p>
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Embarcacoes da aplicacao ({fleet.length})</h2>
          <button type="button" disabled={loading} onClick={() => {
            setLoading(true); setError(""); setFleet([]); setSelectedId(""); setHistory(null);
            setHistoryError(""); setQuerying(false); setRequestId(0); setRefresh((value) => value + 1);
          }} className="rounded-xl border px-4 py-2 disabled:opacity-50">Atualizar lista</button>
        </div>
        {loading && <p role="status">A carregar embarcacoes...</p>}
        {error && <p role="alert" className="text-red-700">{error}</p>}
        {!loading && !error && !fleet.length && <p role="status">Nenhuma embarcacao na lista atual.</p>}
        <label className="block text-sm font-semibold">Pesquisar nome, matricula, ilha, MMSI ou IMO
          <input value={search} onChange={(event) => setSearch(event.target.value)} className="mt-2 block w-full rounded-xl border p-3" />
        </label>
        <label className="block text-sm font-semibold">Embarcacao ({filtered.length} resultados)
          <select value={selectedId} onChange={(event) => {
            setSelectedId(event.target.value); setRequestId(0); setHistory(null); setHistoryError(""); setQuerying(false);
          }} className="mt-2 block w-full min-w-0 rounded-xl border p-3">
            <option value="">Selecionar embarcacao</option>
            {selected && !filtered.some((vessel) => vessel.id === selected.id) && <option value={selected.id}>{selected.nome}</option>}
            {filtered.map((vessel) => <option key={vessel.id} value={vessel.id}>{vessel.nome} | MMSI {vessel.mmsi || "em falta"} | IMO {vessel.imo || "em falta"}</option>)}
          </select>
        </label>
        {!loading && fleet.length > 0 && !filtered.length && <p role="status">Nenhuma embarcacao corresponde a pesquisa.</p>}
        {selected && <p className="break-words text-sm">{selected.nome} | MMSI: {selected.mmsi || "em falta"} | IMO: {selected.imo || "em falta"}. A fonte suporta consulta por MMSI, nao por IMO isolado.</p>}
        <button type="button" disabled={!selected || querying || loading} onClick={() => {
          setQuerying(true); setHistory(null); setHistoryError(""); setRequestId((value) => value + 1);
        }} className="rounded-xl bg-sky-700 px-5 py-3 font-bold text-white disabled:opacity-50">Consultar historico de 48h</button>
      </section>

      <section className="space-y-3" aria-label="Mapa de historico AIS" aria-busy={querying}>
        {querying && <p role="status">A consultar historico AIS das ultimas 48 horas...</p>}
        {historyError && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{historyError} Pode tentar novamente.</p>}
        {!history && !querying && !historyError && <p role="status">Selecione uma embarcacao e consulte o historico. Nao ha posicoes carregadas.</p>}
        {history && <div className="break-words text-sm">
          <p>Fonte: {history.source}. Janela UTC: {history.from} a {history.to}.</p>
          <p>{history.points.length} posicoes validas; {history.discarded} registos fora da janela, sem hora ou invalidos excluidos.</p>
          {!history.points.length && <p role="status" className="mt-2 rounded-xl bg-amber-50 p-4">Sem dados validos nas ultimas 48h. Isto nao prova ausencia de pesca nem AIS desligado.</p>}
          {history.points.length > 0 && <p>Marcadores: observacoes AIS. Linha: liga observacoes por ordem temporal, nao reconstitui o percurso entre elas.</p>}
        </div>}
        <div className="relative z-0 overflow-hidden rounded-2xl border border-slate-200">
          <HistoryMap key={history ? `${history.vesselId}:${history.to}` : "empty"} history={history} name={selected?.nome || ""} />
        </div>
      </section>
    </main>
  );
}
