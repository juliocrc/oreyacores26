"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

type IntegridadeItem = {
  id: number;
  certificadoNumero: string | null;
  navioNome: string | null;
  jangadaSerial: string | null;
  dataInspecao: string | null;
  dataProxInspecao: string | null;
  status: string | null;
  stamped: boolean;
  valid: boolean | null;
  integrityHash: string | null;
  integrityTimestamp: string | null;
};

type IntegridadePayload = {
  total: number;
  valid: number;
  invalid: number;
  unstamped: number;
  items: IntegridadeItem[];
};

export default function IntegridadePage() {
  const [data, setData] = useState<IntegridadePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stampingIds, setStampingIds] = useState<Set<number>>(new Set());
  const [stampingAll, setStampingAll] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/integridade");
      if (!res.ok) throw new Error("Falha ao carregar integridade");
      const payload = (await res.json()) as IntegridadePayload;
      setData(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const stampOne = useCallback(
    async (id: number) => {
      setStampingIds((prev) => new Set(prev).add(id));
      try {
        const res = await fetch(`/api/inspecoes/${id}/integrity`, { method: "POST" });
        if (!res.ok) throw new Error("Falha ao carimbar");
      } finally {
        setStampingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        void fetchList();
      }
    },
    [fetchList]
  );

  const stampAll = useCallback(async () => {
    const pending = (data?.items || []).filter((i) => !i.stamped).map((i) => i.id);
    if (pending.length === 0) return;
    setStampingAll(true);
    for (const id of pending) {
      try {
        await fetch(`/api/inspecoes/${id}/integrity`, { method: "POST" });
      } catch {
        // continua com o próximo
      }
    }
    setStampingAll(false);
    void fetchList();
  }, [data, fetchList]);

  const resumo = useMemo(() => {
    const d = data;
    if (!d) return null;
    const pct = d.total ? Math.round((d.valid / d.total) * 100) : 0;
    return { ...d, pct };
  }, [data]);

  const badge = (i: IntegridadeItem) => {
    if (!i.stamped)
      return <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700">Sem carimbo</span>;
    if (i.valid)
      return <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">Válido</span>;
    return <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-700">Divergente</span>;
  };

  return (
    <div className="p-6">
      <div className="max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h1 className="text-2xl font-bold">Integridade dos Certificados</h1>
            <p className="text-sm text-slate-500">
              Verificação criptográfica (SHA-256) do conteúdo registado vs. conteúdo atual.
            </p>
          </div>
          <button
            className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-800"
            onClick={() => fetchList()}
          >
            Verificar novamente
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>
        )}

        {loading && !data ? (
          <div className="text-sm text-gray-500 animate-pulse">A verificar certificados...</div>
        ) : resumo ? (
          <div className="space-y-6">
            {/* Resumo */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-black uppercase tracking-wider text-slate-500">Certificados</p>
                <p className="mt-1 text-3xl font-black text-slate-900">{resumo.total}</p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
                <p className="text-xs font-black uppercase tracking-wider text-emerald-700">Válidos</p>
                <p className="mt-1 text-3xl font-black text-emerald-700">{resumo.valid}</p>
              </div>
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
                <p className="text-xs font-black uppercase tracking-wider text-red-700">Divergentes</p>
                <p className="mt-1 text-3xl font-black text-red-700">{resumo.invalid}</p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                <p className="text-xs font-black uppercase tracking-wider text-amber-700">Sem carimbo</p>
                <p className="mt-1 text-3xl font-black text-amber-700">{resumo.unstamped}</p>
              </div>
            </div>

            {/* Barra de conformidade */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-500">Conformidade</h2>
                <span className="text-xs font-bold text-slate-600">{resumo.pct}%</span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.max(resumo.pct, 2)}%`, background: resumo.pct >= 80 ? "#059669" : resumo.pct >= 40 ? "#f59e0b" : "#dc2626" }}
                />
              </div>
              {resumo.unstamped > 0 && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-slate-500">
                    {resumo.unstamped} certificado(s) sem carimbo temporal de integridade.
                  </p>
                  <button
                    className="rounded bg-slate-800 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-900 disabled:opacity-50"
                    onClick={() => stampAll()}
                    disabled={stampingAll}
                  >
                    {stampingAll ? "A carimbar..." : "Carimbar todos agora"}
                  </button>
                </div>
              )}
            </div>

            {/* Lista */}
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2">Certificado</th>
                    <th className="px-3 py-2">Jangada</th>
                    <th className="px-3 py-2">Navio</th>
                    <th className="px-3 py-2">Inspeção</th>
                    <th className="px-3 py-2">Próx. inspeção</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2">Hash</th>
                    <th className="px-3 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {resumo.items.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-xs text-slate-400">
                        Sem certificados para verificar.
                      </td>
                    </tr>
                  )}
                  {resumo.items.map((i) => (
                    <tr key={i.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="px-3 py-2 font-bold text-slate-800">{i.certificadoNumero || "—"}</td>
                      <td className="px-3 py-2 text-slate-600">{i.jangadaSerial || "—"}</td>
                      <td className="px-3 py-2 text-slate-600">{i.navioNome || "—"}</td>
                      <td className="px-3 py-2 text-slate-600">{i.dataInspecao ? new Date(i.dataInspecao).toLocaleDateString("pt-PT") : "—"}</td>
                      <td className="px-3 py-2 text-slate-600">{i.dataProxInspecao ? new Date(i.dataProxInspecao).toLocaleDateString("pt-PT") : "—"}</td>
                      <td className="px-3 py-2">{badge(i)}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-400">{i.integrityHash ? i.integrityHash.slice(0, 12) : "—"}</td>
                      <td className="px-3 py-2">
                        {!i.stamped && (
                          <button
                            className="rounded bg-slate-800 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-slate-900 disabled:opacity-50"
                            onClick={() => stampOne(i.id)}
                            disabled={stampingIds.has(i.id)}
                          >
                            {stampingIds.has(i.id) ? "..." : "Carimbar"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}