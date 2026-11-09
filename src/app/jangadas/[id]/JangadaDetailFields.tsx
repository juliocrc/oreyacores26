"use client";

import React, { useEffect, useState } from 'react';
import { filterStockItems, formatStockOptionLabel, type StockPickerItem } from '@/lib/stock-picker';
import type { InspecaoForCertificate } from '@/lib/certificate-input-from-jangada';

export function inspectionResponsibleName(inspection?: InspecaoForCertificate & {
  ordensServico?: Array<{ tecnicoResponsavel?: string | null; tecnico?: { nome?: string | null } | null }>;
}): string {
  const snapshot = inspection?.checklistSnapshot;
  const values = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot as Record<string, unknown> : {};
  const saved = inspection?.responsavel?.trim()
    || (typeof values.responsavel === 'string' ? values.responsavel.trim() : '')
    || inspection?.tecnico?.nome?.trim();
  if (saved) return saved;
  const names = [...new Set((inspection?.ordensServico || []).map(order =>
    order.tecnicoResponsavel?.trim() || order.tecnico?.nome?.trim() || '').filter(Boolean))];
  return names.length === 1 ? names[0] : '';
}

// These fields identify installed equipment, not a request to consume a stock lot.
export function EquipmentReferenceSelect({ items, value, label, onChange }: {
  items: StockPickerItem[]; value: string; label: string; onChange: (reference: string) => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = filterStockItems(items, query);
  return <div className="space-y-1.5">
    <input aria-label={`Pesquisar ${label}`} placeholder="Procurar por nome ou referencia..." value={query}
      onChange={event => setQuery(event.target.value)} className="w-full border-slate-200 rounded-xl px-4 py-2 bg-slate-50 text-sm" />
    <select aria-label={label} value={value} onChange={event => { onChange(event.target.value); setQuery(''); }}
      className="w-full border-slate-200 rounded-xl px-4 py-2 bg-slate-50 text-sm">
      <option value="">Selecionar...</option>
      {value && !filtered.some(item => item.referencia === value) && <option value={value}>{value}</option>}
      {filtered.map(item => <option key={item.id} value={item.referencia || ''}>{formatStockOptionLabel(item)}</option>)}
    </select>
    {filtered.length === 0 && <p className="text-xs text-amber-700">Nenhum artigo corresponde a pesquisa.</p>}
  </div>;
}

export type InspectionResponsibleSelection = { inspecaoId: number; tecnicoId: number; expectedUpdatedAt: string | null; nome: string };

export function InspectionResponsibleField({ editing, inspection, stationId, selection, onChange }: {
  editing: boolean;
  inspection?: { id: number; updatedAt?: string; responsavel?: string; checklistSnapshot?: unknown; ordensServico?: Array<{ tecnicoResponsavel?: string | null; tecnico?: { nome?: string | null } | null }> };
  stationId?: number;
  selection?: InspectionResponsibleSelection;
  onChange: (selection: InspectionResponsibleSelection) => void;
}) {
  const [technicians, setTechnicians] = useState<Array<{ id: number; nome: string }>>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!editing || !stationId) return;
    let active = true;
    setError(false);
    setTechnicians([]);
    fetch(`/api/tecnicos${stationId ? `?serviceStationId=${stationId}` : ''}`, { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error();
      const body = await response.json();
      const rows = (body.stations || []).filter((station: { id: number }) => !stationId || station.id === stationId)
        .flatMap((station: { tecnicos: Array<{ id: number; nome: string; ativo?: boolean }> }) => station.tecnicos)
        .filter((tech: { id: number; ativo?: boolean }) => tech.id > 0 && tech.ativo !== false);
      if (active) setTechnicians(rows);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [editing, stationId]);
  const name = selection?.nome ?? inspectionResponsibleName(inspection);
  return <div className="space-y-1 md:col-span-2">
    <label htmlFor="test-responsible" className="text-xs font-bold uppercase tracking-wider text-slate-400">Técnico responsável pela inspeção</label>
    {editing ? <>
      <select id="test-responsible" value={selection ? String(selection.tecnicoId) : ''} disabled={!inspection || !stationId || error}
        className="w-full border-slate-200 rounded-xl px-4 py-2 bg-white text-sm"
        onChange={event => {
          const technician = technicians.find(tech => String(tech.id) === event.target.value);
          if (inspection && technician) onChange({ inspecaoId: inspection.id, tecnicoId: technician.id, nome: technician.nome, expectedUpdatedAt: inspection.updatedAt ?? null });
        }}>
        <option value="">{name || 'Selecionar tecnico...'}</option>
        {technicians.map(tech => <option key={tech.id} value={tech.id}>{tech.nome}</option>)}
      </select>
      {!inspection && <p className="text-xs text-slate-500">Registe uma inspecao antes de atribuir o responsavel.</p>}
      {error && <p role="alert" className="text-xs text-red-700">Nao foi possivel carregar os tecnicos.</p>}
    </> : <p className="font-semibold text-slate-800">{name || '—'}</p>}
  </div>;
}
