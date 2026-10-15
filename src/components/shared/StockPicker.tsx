"use client";
import React, { useMemo, useState } from "react";
import { Search, Tag } from "lucide-react";
import {
  filterStockItems,
  formatStockOptionLabel,
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
  disabled = false,
  autoFocusSearch = false,
  className = "",
  searchClassName = "",
  selectClassName = "",
  id,
}: StockPickerSelectProps<T>) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => filterStockItems(items, query), [items, query]);

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
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

export default StockPickerSelect;
