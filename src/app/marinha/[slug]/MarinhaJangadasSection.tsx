"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { LifeBuoy, Plus, Trash2, Anchor, CheckCircle2, AlertTriangle } from "lucide-react";
import { isMarinhaAssociation, normalizeMarinhaIdentity, type MarinhaRaft } from "@/lib/marinha-associations";

export default function MarinhaJangadasSection({
  navioNumero,
  navioNome,
}: {
  navioNumero: string;
  navioNome: string;
}) {
  const [allJangadas, setAllJangadas] = useState<MarinhaRaft[]>([]);
  const [shipId, setShipId] = useState<number | null>(null);
  const [canAssociate, setCanAssociate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedJangadaId, setSelectedJangadaId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [associating, setAssociating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [stationId, setStationId] = useState<number | null>(null);

  const navio = { numero: navioNumero, nome: navioNome };

  const loadJangadas = async () => {
    try {
      setLoading(true);
      setError(null);
      // A distinct URL also avoids API responses cached by an older service worker.
      const res = await fetch(`/api/navios/marinha?fresh=${Date.now()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao carregar jangadas.");
      if (!Array.isArray(data.navios) || !Array.isArray(data.jangadas) || !Number.isInteger(data.stationId)) throw new Error("Resposta invalida ao carregar associacoes. Atualize a pagina e tente novamente.");
      const matches = data.navios.filter((n: { matricula: string }) => normalizeMarinhaIdentity(n.matricula) === normalizeMarinhaIdentity(navioNumero));
      if (matches.length > 1) throw new Error("Matricula duplicada. Corrija os registos de navios antes de associar.");
      setShipId(matches[0]?.id ?? null);
      setStationId(data.stationId);
      setCanAssociate(data.canAssociate === true);
      setAllJangadas(data.jangadas);
    } catch (err) {
      setCanAssociate(false);
      setError(err instanceof Error ? err.message : "Erro ao carregar jangadas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the active station's selector data on navigation.
    loadJangadas();
  }, [navioNumero]); // eslint-disable-line react-hooks/exhaustive-deps

  const associatedJangadas = allJangadas.filter(j => isMarinhaAssociation(j, navio, shipId));

  const availableJangadas = allJangadas.filter((j) => {
    const isAlreadyAssociated = isMarinhaAssociation(j, navio, shipId);
    // Legacy manual links remain selectable so an explicit association can persist shipId.
    if (isAlreadyAssociated && j.shipId !== null) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return (
      String(j.serial || "").toLowerCase().includes(q) ||
      String(j.brand || "").toLowerCase().includes(q) ||
      String(j.model || "").toLowerCase().includes(q)
    );
  });

  const handleAssociar = async () => {
    if (!selectedJangadaId) return;
    const selected = allJangadas.find(j => j.id === Number(selectedJangadaId));
    if (!selected) return;
    const moving = (selected.shipId !== null || Boolean(selected.shipNameManual?.trim())) && !isMarinhaAssociation(selected, navio, shipId);
    if (moving && !window.confirm(`Esta jangada esta associada a ${selected.shipId ? selected.linkedShipName : selected.shipNameManual}. Pretende transferi-la para ${navioNome}?`)) return;
    const transferringStation = selected.requiresStationTransfer === true;
    if (transferringStation && !window.confirm(`Esta jangada pertence ${selected.serviceStationId === null ? "a nenhum registo de estacao" : `a estacao #${selected.serviceStationId}`}. Confirma a transferencia para a estacao ativa #${stationId}?`)) return;
    try {
      setAssociating(true);
      setError(null);
      setSuccess(null);

      const res = await fetch("/api/navios/marinha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "associate", numero: navioNumero, jangadaId: selected.id,
          expectedShipId: selected.shipId, expectedShipNameManual: selected.shipNameManual,
          confirmReassign: moving,
          expectedActiveStationId: stationId, expectedServiceStationId: selected.serviceStationId,
          confirmStationTransfer: transferringStation,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao associar jangada.");
      }

      setSuccess("Jangada associada com sucesso ao navio da Marinha.");
      setSelectedJangadaId("");
      await loadJangadas();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao associar jangada.");
    } finally {
      setAssociating(false);
    }
  };

  const handleDesassociar = async (jangadaId: number) => {
    const selected = associatedJangadas.find(j => j.id === jangadaId);
    if (!selected) return;
    if (!window.confirm("Pretende desassociar esta jangada do navio da Marinha?")) return;
    try {
      setAssociating(true);
      setError(null);
      setSuccess(null);
      const res = await fetch("/api/navios/marinha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "disassociate", numero: navioNumero, jangadaId,
          expectedShipId: selected.shipId, expectedShipNameManual: selected.shipNameManual,
          expectedActiveStationId: stationId, expectedServiceStationId: selected.serviceStationId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao desassociar jangada.");
      }

      setSuccess("Jangada desassociada com sucesso.");
      await loadJangadas();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao desassociar jangada.");
    } finally {
      setAssociating(false);
    }
  };

  return (
    <section className="mt-8 rounded-3xl border border-sky-100 bg-gradient-to-br from-sky-50/50 via-white to-slate-50 p-6 sm:p-8 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-sky-100 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-600 text-white shadow-sm">
              <LifeBuoy className="h-5 w-5" />
            </span>
            <h2 className="text-xl font-black text-slate-900">Jangadas Associadas</h2>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Gerir jangadas salva-vidas a bordo de {navioNumero} · {navioNome}.
          </p>
        </div>
        <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-800">
          {associatedJangadas.length} {associatedJangadas.length === 1 ? "jangada" : "jangadas"}
        </span>
        <button type="button" disabled={loading || associating} className="text-xs font-bold text-sky-700 underline" onClick={() => { setSelectedJangadaId(""); void loadJangadas(); }}>Atualizar associacoes</button>
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-800 border border-red-200">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
          <span>{error}</span>
          <button type="button" className="underline" onClick={() => { setError(null); void loadJangadas(); }}>Tentar novamente</button>
        </div>
      )}

      {success && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{success}</span>
        </div>
      )}

      {/* Associar existente */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
          <Anchor className="h-4 w-4 text-sky-600" />
          Associar jangada existente ao navio
        </h3>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Pesquisar por serial, marca ou modelo..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setSelectedJangadaId(""); }}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-500"
            />
            <select
              disabled={loading || associating || !canAssociate}
              value={selectedJangadaId}
              onChange={(e) => setSelectedJangadaId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-sky-500 bg-white"
            >
              <option value="">-- Selecionar jangada disponível --</option>
              {availableJangadas.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.brand || "—"} {j.model || ""} · S/N: {j.serial || "S/N"} ({j.capacity} Lugares) {j.shipId ? `[Outro Navio: ${j.linkedShipName}]` : isMarinhaAssociation(j, navio, shipId) ? "[Confirmar associacao antiga]" : j.shipNameManual ? `[Outro Navio: ${j.shipNameManual}]` : "[Sem navio]"}
                  {j.requiresStationTransfer ? j.serviceStationId === null ? " [Sem estacao: requer confirmacao]" : ` [Estacao #${j.serviceStationId}: requer transferencia]` : ""}
                </option>
              ))}
            </select>
            {!loading && !error && <p role="status" className="text-xs text-slate-600">{availableJangadas.length === 0 ? "Nenhuma jangada disponivel corresponde a pesquisa. Pode ja estar associada abaixo ou fora das estacoes autorizadas." : `${availableJangadas.length} jangadas disponiveis nas estacoes autorizadas.`} Estacao ativa: #{stationId}.</p>}
            {!loading && !error && !canAssociate && <p className="text-xs text-slate-600">Sem permissao para editar associacoes de jangadas.</p>}
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleAssociar}
              disabled={!selectedJangadaId || associating || loading || !canAssociate}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {associating ? "A associar..." : "Associar"}
            </button>
          </div>
        </div>
      </div>

      {/* Lista de jangadas associadas */}
      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-slate-500 py-4 text-center">A carregar jangadas...</p>
        ) : error && allJangadas.length === 0 ? (
          <p className="text-sm text-slate-600 py-4 text-center">Nao foi possivel carregar as associacoes. Tente novamente.</p>
        ) : associatedJangadas.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {associatedJangadas.map((j) => (
              <div
                key={j.id}
                className="relative flex flex-col justify-between rounded-2xl border border-sky-200 bg-white p-5 shadow-sm transition hover:shadow-md"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[10px] font-black uppercase text-sky-800">
                        {j.capacity ? `${j.capacity} Pax` : "Jangada"}
                      </span>
                      <h4 className="mt-2 text-base font-black text-slate-900">
                        {j.brand || "—"} {j.model || ""}
                      </h4>
                    </div>
                    <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">
                      S/N: {j.serial || "—"}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-600 border-t border-slate-100 pt-3">
                    <div>
                      <span className="block text-[10px] uppercase font-bold text-slate-400">Fabricto</span>
                      <span className="font-semibold text-slate-700">{j.dataFabrico || "—"}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase font-bold text-slate-400">Próx. Inspeção</span>
                      <span className="font-semibold text-slate-700">{j.dataProxInspecao || "—"}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <Link
                    href={`/jangadas/${j.id}`}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-700 hover:text-sky-800"
                  >
                    Ver Ficha da Jangada &rarr;
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDesassociar(j.id)}
                    disabled={associating || loading || !canAssociate}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-700 transition hover:bg-red-100"
                    title="Desassociar jangada"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Desassociar
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <LifeBuoy className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-2 text-sm font-semibold text-slate-700">Nenhuma jangada associada a este navio.</p>
            <p className="mt-1 text-xs text-slate-500">Utilize o seletor acima para associar uma jangada salva-vidas.</p>
          </div>
        )}
      </div>
    </section>
  );
}
