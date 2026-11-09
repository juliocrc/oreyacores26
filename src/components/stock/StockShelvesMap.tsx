"use client";

import React, { useState } from "react";
import Link from "next/link";
import StockArticleThumbnail from '@/components/shared/StockArticleThumbnail';
import { MapPin, Search } from "lucide-react";
import { STOCK_SHELVES } from "@/lib/stock-shelves";
import { availableShelfQuantity, buildShelfView, formatShelfAvailability, type ShelfStockItem } from "@/lib/stock-shelf-view";

export type { ShelfStockItem } from "@/lib/stock-shelf-view";

type StockShelvesMapProps = {
  items: ShelfStockItem[];
  mode?: "view" | "select";
  selectedLocation?: string;
  onSelectLocation?: (loc: string) => void;
  onFilterCatalog?: (shelfCode: string) => void;
  className?: string;
};

export default function StockShelvesMap(props: StockShelvesMapProps) {
  return <ShelfLocations key={props.selectedLocation || ""} {...props} />;
}

function ShelfLocations({ items, mode = "view", selectedLocation = "", onSelectLocation, onFilterCatalog, className = "" }: StockShelvesMapProps) {
  const [selectedCell, setSelectedCell] = useState<string | null>(selectedLocation.trim() || null);
  const [query, setQuery] = useState("");

  const groups = buildShelfView(items, query);
  const visibleGroups = selectedCell === null ? groups : groups.filter(group => group.location === selectedCell);
  // Keep the existing explicit selection options, without presenting empty shelves as recorded locations.
  const selectionOptions = [...new Set([...STOCK_SHELVES.map(shelf => shelf.code), ...buildShelfView(items).map(group => group.location).filter(Boolean), ...(selectedLocation.trim() ? [selectedLocation.trim()] : [])])]
    .sort(new Intl.Collator("pt", { numeric: true }).compare);

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-3 text-slate-400" />
        <input
          aria-label="Pesquisar stock nas prateleiras"
          value={query}
          onChange={event => { setQuery(event.target.value); setSelectedCell(null); }}
          placeholder="Referência, descrição, lote ou localização..."
          style={{ paddingLeft: 36 }}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-400"
        />
      </div>
      <p className="text-xs text-slate-500">
        {query.trim() ? "Resultados da pesquisa" : "Stock carregado"} · {groups.filter(group => group.location).length} localizações · {groups.reduce((sum, group) => sum + group.items.length, 0)} registos.
        {" "}Disponível = quantidade menos reservas, por unidade. Saldos negativos aparecem como 0 disponível.
      </p>

      {mode === "select" && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3">
          <label className="block text-xs font-bold text-indigo-900">
            Escolher localização
            <select aria-label="Escolher localização" value={selectedCell || ""} onChange={event => setSelectedCell(event.target.value || null)} className="mt-2 block w-full rounded-lg border border-indigo-200 bg-white p-2 text-sm">
              <option value="">Selecionar...</option>
              {selectionOptions.map(location => <option key={location} value={location}>{location}</option>)}
            </select>
          </label>
          <button type="button" disabled={!selectedCell} onClick={() => { if (selectedCell) onSelectLocation?.(selectedCell); }} className="mt-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">
            Confirmar localização
          </button>
        </div>
      )}

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3">
        <nav aria-label="Localizações do stock" className="max-h-80 space-y-2 overflow-y-auto lg:max-h-[65vh]">
          <button type="button" aria-pressed={selectedCell === null} onClick={() => setSelectedCell(null)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-left text-xs font-bold text-slate-700">Todas as localizações</button>
          {groups.map(group => (
            <button key={group.location} type="button" aria-pressed={selectedCell === group.location} onClick={() => setSelectedCell(group.location)} className={`w-full rounded-xl border p-3 text-left transition ${selectedCell === group.location ? "border-indigo-400 bg-indigo-50" : group.location ? "border-slate-200 bg-white hover:bg-slate-50" : "border-amber-200 bg-amber-50"}`}>
              <span className="flex items-center gap-2 break-all text-sm font-bold text-slate-800"><MapPin size={14} className="shrink-0" />{group.label}</span>
              <span className="mt-1 block text-xs text-slate-500">{group.productCount} produtos · {group.items.length} registos</span>
              <span className="mt-1 block break-words text-xs font-semibold text-indigo-700">Disponível: {formatShelfAvailability(group.availability)}</span>
            </button>
          ))}
        </nav>

        <div className="min-w-0 space-y-4 lg:col-span-2" aria-live="polite">
          {visibleGroups.length === 0 && <p className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">{query.trim() ? "Sem resultados para esta pesquisa." : selectedCell !== null ? "Sem stock registado nesta localização." : "Sem stock para apresentar."}</p>}
          {visibleGroups.map(group => (
            <section key={group.location} aria-label={group.label} className="overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-4">
                <h4 className="break-all text-sm font-black text-slate-800">{group.label}</h4>
                {mode === "view" && onFilterCatalog && STOCK_SHELVES.some(shelf => shelf.code === group.location) && <button type="button" onClick={() => onFilterCatalog(group.location)} className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-700">Ver no catálogo</button>}
              </div>
              <div className="space-y-2 p-3">
                {group.items.map(item => (
                  <Link key={item.id} href={`/stock/${item.id}`} className="block rounded-xl border border-slate-100 bg-white p-3 text-xs text-slate-700 shadow-sm hover:border-indigo-200">
                    <StockArticleThumbnail foto={item.foto} label={item.referencia || item.nome || item.descricao || 'artigo'} className="w-10 h-10 float-left mr-3 mb-2" />
                    <p className="break-words font-bold text-slate-900">{item.nome || item.descricao || "Sem nome"}</p>
                    {item.descricao && item.nome && item.descricao !== item.nome && <p className="mt-1 break-words text-slate-500">{item.descricao}</p>}
                    <div className="mt-2 flex flex-wrap justify-between gap-2">
                      <span className="break-all">Ref: {item.referencia || "—"}{item.lote ? ` · Lote: ${item.lote}` : ""}</span>
                      <span className="font-bold text-indigo-700">Disponível: {formatShelfAvailability([{ unit: item.unit?.trim() || "unidade não indicada", quantity: availableShelfQuantity(item) }])}</span>
                    </div>
                    <p className="mt-1 break-words text-slate-500">Quantidade: {item.quantidade ?? 0} · Reservada: {item.quantidadeReservada ?? 0} · Localização: {group.label}</p>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
