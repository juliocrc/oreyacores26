"use client";
import React, { useMemo } from 'react';
import { Box, PackageCheck, TriangleAlert, Plus, Check, Link2 } from 'lucide-react';
import type { GlobalStockItem, InspectionData } from './types';
import {
  buildClosureSuggestions,
  getClosureStock,
  type ClosureItemState,
} from './containerClosure';

const formatPrice = (value: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(value || 0);

const KIND_LABEL: Record<string, string> = {
  cinta: "Cinta de fecho",
  autocolante: "Autocolante / Selo",
  hru: "HRU (Disparador)",
};

export function ContainerClosureSection({
  inspectionData,
  globalStock,
  selected,
  onToggle,
  onUpdateQuantity,
}: {
  inspectionData: InspectionData;
  globalStock: GlobalStockItem[];
  selected: ClosureItemState[];
  onToggle: (item: ClosureItemState, checked: boolean) => void;
  onUpdateQuantity: (key: string, quantidade: number) => void;
}) {
  const suggestions = useMemo(
    () => buildClosureSuggestions(inspectionData),
    [inspectionData],
  );

  if (suggestions.length === 0) return null;

  const selectedByKey = new Map(selected.map((s) => [s.key, s]));

  return (
    <div className="bg-gradient-to-br from-emerald-50/60 to-teal-50/40 border border-emerald-200 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 bg-emerald-600/10 border-b border-emerald-200 px-6 py-4">
        <Box className="text-emerald-700" size={20} />
        <div>
          <h3 className="text-lg font-bold text-emerald-900">Equipamento de Fecho do Contentor</h3>
          <p className="text-xs text-emerald-700">
            Cintas, autocolantes/selos e HRU sugeridos para esta jangada. Marque os que serão faturados; a quantidade disponível é lida do stock.
          </p>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {suggestions.map((sugg) => {
          const stock = getClosureStock(globalStock, sugg);
          const isSelected = selectedByKey.has(sugg.key);
          const current = selectedByKey.get(sugg.key);
          const quantity = isSelected && current ? current.quantidade : sugg.quantidade;
          const outOfStock = stock.emStock && (stock.quantidadeDisponivel ?? 0) <= 0;

          return (
            <div
              key={sugg.key}
              className={`flex flex-wrap items-center gap-3 rounded-xl border bg-white px-3 py-2.5 transition-colors ${
                isSelected ? "border-emerald-400 ring-1 ring-emerald-200" : "border-slate-200"
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => onToggle(
                  {
                    key: sugg.key,
                    kind: sugg.kind,
                    referencia: sugg.referencia,
                    descricao: sugg.descricao,
                    quantidade: sugg.quantidade,
                    unitPrice: stock.precoVenda,
                    stockId: stock.stockId,
                    partNumber: sugg.partNumber,
                  },
                  e.target.checked,
                )}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4 shrink-0"
              />
              <div className="flex-1 min-w-[180px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-emerald-800">{sugg.referencia}</span>
                  <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                    {KIND_LABEL[sugg.kind]}
                  </span>
                  {sugg.partNumber && (
                    <span className="text-[10px] text-slate-400 font-mono">NP {sugg.partNumber}</span>
                  )}
                </div>
                <p className="text-xs text-slate-700 mt-0.5">{sugg.descricao}</p>
                {sugg.sourceCatalog && (
                  <p className="text-[10px] text-slate-400 italic">{sugg.sourceCatalog}</p>
                )}
                {sugg.certainty === "family" || sugg.certainty === "catalog" ? (
                  <p className="flex items-center gap-1 text-[10px] font-semibold text-amber-700 mt-0.5">
                    <TriangleAlert size={11} /> Correspondência a confirmar
                  </p>
                ) : sugg.certainty === "exact" ? (
                  <p className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 mt-0.5">
                    <PackageCheck size={11} /> Correspondência exata
                  </p>
                ) : null}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <label className="text-[11px] text-slate-500 font-semibold">Qtd</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  disabled={!isSelected}
                  value={isSelected ? quantity : sugg.quantidade}
                  onChange={(e) => onUpdateQuantity(sugg.key, Number(e.target.value))}
                  className="w-16 rounded-lg border border-slate-300 px-1.5 py-1 text-right text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100"
                />
              </div>

              <div className="text-right shrink-0">
                <div className="text-sm font-bold text-slate-800">{formatPrice(stock.precoVenda)}</div>
                {stock.emStock ? (
                  <div className={`text-[10px] font-semibold ${outOfStock ? "text-red-600" : "text-emerald-700"}`}>
                    Stock: {stock.quantidadeDisponivel}
                    {outOfStock && " · esgotado"}
                  </div>
                ) : (
                  <div className="text-[10px] text-amber-700 flex items-center gap-0.5">
                    <Link2 size={10} /> sem stock catalogado
                  </div>
                )}
              </div>

              {isSelected && (
                <button
                  type="button"
                  onClick={() => onToggle(
                    {
                      key: sugg.key,
                      kind: sugg.kind,
                      referencia: sugg.referencia,
                      descricao: sugg.descricao,
                      quantidade: quantity,
                      unitPrice: stock.precoVenda,
                      stockId: stock.stockId,
                      partNumber: sugg.partNumber,
                    },
                    false,
                  )}
                  className="rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200 px-2 py-1 shrink-0"
                  title="Remover"
                >
                  <Check size={14} className="text-emerald-600" />
                </button>
              )}
            </div>
          );
        })}

        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                suggestions.forEach((sugg) => {
                  if (selectedByKey.has(sugg.key)) return;
                  const stock = getClosureStock(globalStock, sugg);
                  onToggle(
                    {
                      key: sugg.key,
                      kind: sugg.kind,
                      referencia: sugg.referencia,
                      descricao: sugg.descricao,
                      quantidade: sugg.quantidade,
                      unitPrice: stock.precoVenda,
                      stockId: stock.stockId,
                      partNumber: sugg.partNumber,
                    },
                    true,
                  );
                });
              }}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-emerald-700"
            >
              <Plus size={14} />
              Adicionar todos ao orçamento
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
