"use client";

import React, { useState } from "react";
import { Camera, PackageSearch, X } from "lucide-react";
import BarcodeScanner from "./BarcodeScanner";
import { formatStockOptionLabel, getAvailableStock, getReplacementStockItems, getStockSelectionError, sortStockCandidates, type StockPickerItem } from "@/lib/stock-picker";
import { toMonthYearString } from '@/lib/date-utils';
import StockArticleThumbnail from './StockArticleThumbnail';
import { isHammarH20RReference } from '@/lib/hammar-h20';

export interface ReplacementStockPickerProps<T extends StockPickerItem> {
  /** Already scoped to the station and eligible article/category. */
  items: T[];
  articleLabel: string;
  /** True for expiry-controlled articles, even when their expiry is unknown. */
  showValidade?: boolean;
  requiredQuantity?: number;
  nextInspection?: string | null;
  allowH20R?: boolean;
  allowDeficit?: boolean;
  onSelect: (item: T) => void;
  onClose: () => void;
}

/** Mount when opening; only an explicit row click confirms a replacement. */
export function ReplacementStockPicker<T extends StockPickerItem>({ items, articleLabel, showValidade = true, requiredQuantity = 1, nextInspection, allowH20R = false, allowDeficit = false, onSelect, onClose }: ReplacementStockPickerProps<T>) {
  const [query, setQuery] = useState("");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [h20Confirmed, setH20Confirmed] = useState(false);
  const options = { showValidade, requiredQuantity, nextInspection, allowDeficit };
  const itemError = (item: T) => getStockSelectionError(item, allowH20R && isHammarH20RReference(item.referencia) && !item.validade ? { ...options, showValidade: false } : options);
  const candidates = sortStockCandidates(getReplacementStockItems(items, query, allowDeficit), options);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} onKeyDown={event => { event.stopPropagation(); if (event.key === "Escape" && !scanning) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={`Substituir: ${articleLabel}`} className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg max-h-[90dvh] overflow-y-auto" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div><h3 className="text-lg font-bold text-slate-800">Substituir do Stock</h3><p className="text-xs text-slate-500">{articleLabel}</p></div>
          <button type="button" aria-label="Fechar seletor" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="p-4 space-y-3">
          <button type="button" onClick={() => setScanning(true)} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold"><Camera size={16} /> Ler codigo de barras / camara</button>
          <label className="block text-sm font-semibold text-slate-700">Pesquisar stock manualmente
            <input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder={showValidade ? "Referencia, descricao, codigo de barras ou lote" : "Referencia, descricao ou codigo de barras"} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </label>
          <p className="text-xs text-slate-500">{showValidade ? 'Escolha explicitamente a linha de stock e confirme o lote e a validade apresentados.' : 'Escolha explicitamente o artigo de stock.'} {allowDeficit ? 'Linhas sem stock também podem ser selecionadas com confirmação.' : 'Apenas sao mostradas as linhas disponibilizadas pelo armazem.'}</p>
          <p className="text-xs text-slate-600">Quantidade necessaria: {requiredQuantity}.{showValidade && nextInspection ? ` Proxima inspecao: ${toMonthYearString(nextInspection)}. A validade deve cobrir ate a proxima inspecao, inclusive.` : ''}</p>
          {allowH20R && <label className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"><input type="checkbox" checked={h20Confirmed} onChange={event => setH20Confirmed(event.target.checked)} /><span>Confirmei na unidade/embalagem que é Hammar H20 R de 24 meses e que a data de fabrico e as condições de armazenamento cumprem o prazo do fabricante (máximo de 5 anos). Marcarei a validade na unidade.</span></label>}
          <div className="space-y-2 max-h-[45vh] overflow-y-auto">
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            {candidates.length === 0 ? <p role="status" className="py-6 text-center text-sm text-slate-500"><PackageSearch className="mx-auto mb-2" size={24} />Sem stock disponivel para esta pesquisa.</p> : candidates.map(item => (
              <button type="button" key={item.id} onClick={() => { const reason = itemError(item); if (reason) { setError(reason); return; } if (allowH20R && isHammarH20RReference(item.referencia) && !h20Confirmed) { setError('Confirme o modelo e as condições de armazenamento antes de selecionar o H20 R.'); return; } if (allowDeficit && getAvailableStock(item) < requiredQuantity && !window.confirm(`Stock disponível: ${getAvailableStock(item)}; quantidade necessária: ${requiredQuantity}. A gravação pode deixar esta linha com saldo negativo. Confirma que pretende selecionar esta linha?`)) return; onSelect(item); }} className="w-full text-left flow-root p-3 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-sm text-slate-800">
                 <StockArticleThumbnail foto={item.foto} label={String(item.referencia || item.descricao || item.id)} className="w-10 h-10 float-left mr-3" />
                 {formatStockOptionLabel(item, { showValidade })}
                 {allowDeficit && getAvailableStock(item) < requiredQuantity && <span className="block mt-1 text-xs font-semibold text-amber-800">Stock insuficiente: disponível {getAvailableStock(item)}, necessário {requiredQuantity}. A gravação pode originar saldo negativo.</span>}
                 {itemError(item) && <span className="block mt-1 text-xs font-semibold text-red-700">{itemError(item)}</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="px-6 py-3 border-t border-slate-100 flex justify-end"><button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl">Cancelar</button></div>
      </div>
      {scanning && <div onClick={event => event.stopPropagation()}><BarcodeScanner onScan={code => { setQuery(code.trim()); setScanning(false); }} onClose={() => setScanning(false)} /></div>}
    </div>
  );
}

/** Inline trigger for wizard fields; opening and cancelling never call onSelect. */
export function ReplacementStockSelect<T extends StockPickerItem>({ items, value, onSelect, placeholder = "Substituir do Stock", emptyMessage, disabled, showValidade = false, showQuantity = true, requiredQuantity = 1, nextInspection, allowH20R = false, allowDeficit = false, className = "" }: {
  items: T[];
  value?: number | string | null;
  onSelect: (item: T) => void;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  showValidade?: boolean;
  showQuantity?: boolean;
  requiredQuantity?: number;
  nextInspection?: string | null;
  allowH20R?: boolean;
  allowDeficit?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = items.find(item => String(item.id) === String(value));
  return <div className={className}>
    <button type="button" disabled={disabled} onClick={() => setOpen(true)} className="w-full text-left flow-root border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 hover:bg-indigo-50 text-sm">{selected && <StockArticleThumbnail foto={selected.foto} label={String(selected.referencia || selected.descricao || selected.id)} className="w-10 h-10 float-left mr-3" />}{selected ? formatStockOptionLabel(selected, { showValidade, showQuantity }) : placeholder}</button>
    {getReplacementStockItems(items, '', allowDeficit).length === 0 && emptyMessage && <p className="text-xs text-slate-500 mt-1">{emptyMessage}</p>}
    {selected && getStockSelectionError(selected, { requiredQuantity, allowDeficit, showValidade: allowH20R && isHammarH20RReference(selected.referencia) && !selected.validade ? false : showValidade, nextInspection }) && <p role="alert" className="mt-1 text-xs text-red-700">{getStockSelectionError(selected, { requiredQuantity, allowDeficit, showValidade: allowH20R && isHammarH20RReference(selected.referencia) && !selected.validade ? false : showValidade, nextInspection })}</p>}
    {selected && allowDeficit && getAvailableStock(selected) < requiredQuantity && <p role="status" className="mt-1 text-xs text-amber-800">Stock insuficiente nesta linha; a gravação pode originar saldo negativo.</p>}
    {open && <ReplacementStockPicker items={items} articleLabel={placeholder} showValidade={showValidade} requiredQuantity={requiredQuantity} nextInspection={nextInspection} allowH20R={allowH20R} allowDeficit={allowDeficit} onClose={() => setOpen(false)} onSelect={item => { onSelect(item); setOpen(false); }} />}
  </div>;
}
