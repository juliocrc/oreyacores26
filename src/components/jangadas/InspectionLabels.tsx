"use client";

import React, { useEffect, useState } from 'react';
import ContainerLabels from './ContainerLabels';

type Raft = { brand: string; model: string; launchType?: string | null; containerModel?: string | null; containerSize?: string | null; serviceStationId?: number | null };
type Stock = { id: number; codigoFabricante?: string | null; referencia?: string | null; quantidade?: number; foto?: string | null; serviceStationId?: number | null };

export default function InspectionLabels({ jangadaId }: { jangadaId: number | null }) {
  const [result, setResult] = useState<{ raft: Raft; stock: Stock[]; stockStatus: 'ready' | 'error' } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!jangadaId) return;
    const controller = new AbortController();
    async function load() {
      try {
        const raftResponse = await fetch(`/api/jangadas/${jangadaId}`, { signal: controller.signal, cache: 'no-store' });
        if (!raftResponse.ok) throw new Error('Jangada indisponível');
        const raft: Raft = await raftResponse.json();
        let stock: Stock[] = [];
        let stockStatus: 'ready' | 'error' = 'error';
        try {
          const response = await fetch('/api/stock?includeFoto=true', { signal: controller.signal, cache: 'no-store' });
          if (!response.ok) throw new Error('Stock indisponível');
          const rows = await response.json();
          if (!Array.isArray(rows)) throw new Error('Resposta de stock inválida');
          stock = rows.filter((item: Stock) => item.serviceStationId == null || (raft.serviceStationId != null && item.serviceStationId === raft.serviceStationId));
          stockStatus = 'ready';
        } catch {
          if (controller.signal.aborted) return;
        }
        setResult({ raft, stock, stockStatus });
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    }
    void load();
    return () => controller.abort();
  }, [jangadaId]);

  if (!jangadaId || error) return <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Não foi possível consultar os autocolantes da jangada.</p>;
  if (!result) return <p role="status" className="text-sm text-slate-500">A consultar autocolantes e stock…</p>;
  return <div className="space-y-2"><ContainerLabels raft={result.raft} stock={result.stock} stockStatus={result.stockStatus} /><p className="text-xs text-slate-500">Consulta de apoio visual: o estado da inspeção é registado nos itens da checklist.</p></div>;
}
