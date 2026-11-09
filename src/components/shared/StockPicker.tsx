"use client";
import React, { useMemo, useState } from "react";
import { Search, Tag } from "lucide-react";
import StockArticleThumbnail from './StockArticleThumbnail';
import {
  filterStockItems,
  formatStockOptionLabel,
  getStockSelectionError,
  sortStockCandidates,
  getAvailableStock,
  type StockPickerItem,
} from "@/lib/stock-picker";

export type { StockPickerItem };

export interface StockPickerSelectProps<T extends StockPickerItem> {
  items: T[];
  value?: number | string | null;
  onSelect: (item: T) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  showValidade?: boolean;
  showQuantity?: boolean;
  requiredQuantity?: number;
  nextInspection?: string | null;
  allowDeficit?: boolean;
  disabled?: boolean;
  autoFocusSearch?: boolean;
  className?: string;
  searchClassName?: string;
  selectClassName?: string;
  id?: string;
}

const DEFAULT_SEARCH_PLACEHOLDER = "Procurar por referência, descrição ou stock...";
const DEFAULT_EMPTY_MESSAGE = "Nenhum artigo de stock disponível";

/**
 * Seletor pesquisável de artigos do stock. Consolida o padrão que estava
 * duplicado nos vários passos do wizard e na ficha da jangada:
 * caixa de pesquisa + lista de opções + estados "sem artigos"/"sem resultados".
 */
export function StockPickerSelect<T extends StockPickerItem>({
  items,
  value,
  onSelect,
  placeholder = "Selecionar artigo do armazém...",
  searchPlaceholder = DEFAULT_SEARCH_PLACEHOLDER,
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
  showValidade = false,
  showQuantity = true,
  requiredQuantity = 1,
  nextInspection,
  allowDeficit = false,
  disabled = false,
  autoFocusSearch = false,
  className = "",
  searchClassName = "",
  selectClassName = "",
  id,
}: StockPickerSelectProps<T>) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const filtered = useMemo(() => sortStockCandidates(filterStockItems(items, query), { showValidade, requiredQuantity, nextInspection, allowDeficit }), [items, query, showValidade, requiredQuantity, nextInspection, allowDeficit]);
  const selected = items.find(item => String(item.id) === String(value));
  const selectedError = selected ? getStockSelectionError(selected, { showValidade, requiredQuantity, nextInspection, allowDeficit }) : null;

  if (items.length === 0) {
    return (
      <div
        className={`w-full border border-dashed border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 text-xs text-slate-400 italic ${className}`}
      >
        {emptyMessage}
      </div>
    );
  }

  const selectedValue = value == null ? "" : String(value);

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search size={14} className="text-slate-400" />
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          autoFocus={autoFocusSearch}
          className={`w-full border-slate-200 rounded-xl pl-9 pr-3 py-2.5 bg-slate-50 focus:bg-white text-sm transition-colors ${searchClassName}`}
        />
      </div>
      {filtered.length === 0 ? (
        <div className="w-full border border-amber-200 bg-amber-50 rounded-xl px-3 py-2.5 text-xs text-amber-800">
          Nenhum artigo corresponde à pesquisa &quot;{query}&quot;.
          <button
            type="button"
            onClick={() => setQuery("")}
            className="ml-1 font-semibold underline"
          >
            Limpar pesquisa
          </button>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Tag size={14} className="text-slate-400" />
          </div>
          <select
            id={id}
            value={selectedValue}
            disabled={disabled}
            onChange={(e) => {
              const item = items.find((candidate) => String(candidate.id) === e.target.value);
              if (item) {
                const reason = getStockSelectionError(item, { showValidade, requiredQuantity, nextInspection, allowDeficit });
                if (reason) { setError(reason); return; }
                if (allowDeficit && getAvailableStock(item) < requiredQuantity && !window.confirm(`Stock disponível: ${getAvailableStock(item)}; quantidade necessária: ${requiredQuantity}. A gravação pode deixar esta linha com saldo negativo. Confirma que pretende selecionar esta linha?`)) return;
                setError(null);
                onSelect(item);
                setQuery("");
              }
            }}
            className={`w-full border-slate-200 rounded-xl pl-9 pr-3 py-2.5 bg-slate-50 focus:bg-white text-sm transition-colors ${selectClassName}`}
          >
            <option value="">{placeholder}</option>
            {filtered.map((item) => (
              <option key={item.id} value={String(item.id)}>
                 {formatStockOptionLabel(item, { showValidade, showQuantity })}
                  {getStockSelectionError(item, { showValidade, requiredQuantity, nextInspection, allowDeficit }) ? ' - ATENCAO: indisponivel para este pedido' : allowDeficit && getAvailableStock(item) < requiredQuantity ? ' - stock insuficiente; requer confirmação' : ''}
              </option>
            ))}
          </select>
        </div>
      )}
      {selected && <div className="flex items-center gap-3 text-xs text-slate-600">
        <StockArticleThumbnail foto={selected.foto} label={String(selected.referencia || selected.descricao || selected.id)} />
        <span>{formatStockOptionLabel(selected, { showValidade, showQuantity })}</span>
      </div>}
      {filtered.length > 0 && <details className="text-xs text-slate-600">
        <summary className="cursor-pointer py-1">Ver artigos com fotos</summary>
        <div className="max-h-56 overflow-y-auto space-y-1 mt-1">
          {filtered.map(item => <button key={item.id} type="button" disabled={disabled} onClick={() => {
            const reason = getStockSelectionError(item, { showValidade, requiredQuantity, nextInspection });
            if (reason) { setError(reason); return; }
            setError(null);
            onSelect(item);
            setQuery("");
          }} className="w-full flex items-center gap-3 rounded-lg border border-slate-200 p-2 text-left hover:bg-slate-50 disabled:opacity-50">
            <StockArticleThumbnail foto={item.foto} label={String(item.referencia || item.descricao || item.id)} />
            <span className="min-w-0 break-words">{formatStockOptionLabel(item, { showValidade, showQuantity })}</span>
          </button>)}
        </div>
      </details>}
      {(error || selectedError) && <p role="alert" className="text-xs font-semibold text-red-700">{error || selectedError}</p>}
    </div>
  );
}

export default StockPickerSelect;
