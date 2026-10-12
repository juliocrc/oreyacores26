"use client";
import React, { useMemo, useState } from 'react';
import { Box, PackageCheck, TriangleAlert, Plus, Check, Link2, Search, Trash2 } from 'lucide-react';
import type { GlobalStockItem, InspectionData } from './types';
import {
  buildClosureSuggestions,
  closureStateFromStock,
  getClosureStock,
  type ClosureItemState,
} from './containerClosure';

const formatPrice = (value: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(value || 0);

const KIND_LABEL: Record<string, string> = {
  cinta: "Cinta de fecho",
  autocolante: "Acessório de Fecho",
  hru: "HRU (Disparador)",
  reparo: "Reparo do Contentor",
};

function normalizeText(value: string) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function isClosureStockItem(stock: GlobalStockItem): boolean {
  const hay = normalizeText(`${stock.referencia} ${stock.descricao}`);
  const cat = normalizeText(stock.categoria || "");
  if (
    cat &&
    ["contentor", "cinta", "cintas", "fecho", "acessorio", "diversos"].some((token) => cat.includes(token))
  ) {
    return true;
  }
  return [
    "cinta",
    "strap",
    "autocolante",
    "selo",
    "fita",
    "saco",
    "vacuo",
    "anilha",
    "etiqueta",
    "vedante",
    "protec",
    "fecho",
    "contentor",
    "cintagem",
    "correia",
  ].some((token) => hay.includes(token));
}

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

  const suggestionKeys = useMemo(() => new Set(suggestions.map((s) => s.key)), [suggestions]);
  const manualItems = useMemo(
    () => selected.filter((s) => !suggestionKeys.has(s.key)),
    [selected, suggestionKeys],
  );

  const [stockSearch, setStockSearch] = useState("");

  const closureStock = useMemo(() => globalStock.filter(isClosureStockItem), [globalStock]);
  const filteredStock = useMemo(() => {
    const query = normalizeText(stockSearch.trim());
    if (!query) return closureStock;
    return closureStock.filter((s) =>
      normalizeText(`${s.referencia} ${s.descricao}`).includes(query),
    );
  }, [closureStock, stockSearch]);

  const selectedByKey = new Map(selected.map((s) => [s.key, s]));

  const addFromStock = (stock: GlobalStockItem) => {
    onToggle(closureStateFromStock(stock), true);
    setStockSearch("");
  };

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

        {manualItems.map((item) => {
          const stockById = item.stockId ? globalStock.find((g) => g.id === item.stockId) : null;
          const price = stockById ? Number(stockById.precoVenda) || 0 : Number(item.unitPrice) || 0;
          const qtDisp = stockById ? Number(stockById.quantidade) || 0 : 0;
          return (
            <div
              key={item.key}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-400 ring-1 ring-emerald-200 bg-emerald-50/40 px-3 py-2.5"
            >
              <input
                type="checkbox"
                checked
                readOnly
                className="rounded border-slate-300 text-emerald-600 h-4 w-4 shrink-0"
              />
              <div className="flex-1 min-w-[180px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-emerald-800">{item.referencia}</span>
                  <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                    {KIND_LABEL[item.kind] || item.kind}
                  </span>
                  <span className="rounded-full bg-sky-100 text-sky-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                    Do stock
                  </span>
                </div>
                <p className="text-xs text-slate-700 mt-0.5">{item.descricao}</p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <label className="text-[11px] text-slate-500 font-semibold">Qtd</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={item.quantidade}
                  onChange={(e) => onUpdateQuantity(item.key, Number(e.target.value))}
                  className="w-16 rounded-lg border border-slate-300 px-1.5 py-1 text-right text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="text-right shrink-0">
                <div className="text-sm font-bold text-slate-800">{formatPrice(price)}</div>
                {stockById ? (
                  <div className={`text-[10px] font-semibold ${qtDisp <= 0 ? "text-red-600" : "text-emerald-700"}`}>
                    Stock: {qtDisp}
                    {qtDisp <= 0 && " · esgotado"}
                  </div>
                ) : (
                  <div className="text-[10px] text-amber-700">sem stock catalogado</div>
                )}
              </div>

              <button
                type="button"
                onClick={() => onToggle({ ...item, quantidade: item.quantidade }, false)}
                className="rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200 px-2 py-1 shrink-0"
                title="Remover"
              >
                <Trash2 size={14} />
              </button>
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

        <div className="rounded-xl border border-dashed border-emerald-300 bg-white p-3 pt-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700 mb-2">
            <Link2 size={13} /> Adicionar do Armazém (cintas, autocolantes, saco de vácuo, fita)
          </div>
          {closureStock.length === 0 ? (
            <p className="text-xs text-slate-400 italic">
              Nenhum artigo de fecho encontrado no stock. Adicione as cintas/autocolantes ao stock primeiro.
            </p>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search size={14} className="text-slate-400" />
                </div>
                <input
                  type="text"
                  value={stockSearch}
                  onChange={(e) => setStockSearch(e.target.value)}
                  placeholder="Filtrar por referência ou descrição..."
                  className="w-full border-slate-200 rounded-xl pl-9 pr-3 py-2 bg-slate-50 focus:bg-white text-sm"
                />
              </div>
              <select
                value=""
                onChange={(e) => {
                  const stockId = Number(e.target.value);
                  if (!stockId) return;
                  const stock = globalStock.find((g) => g.id === stockId);
                  if (stock) addFromStock(stock);
                }}
                className="w-full sm:w-80 rounded-xl border-slate-200 px-3 py-2 bg-slate-50 focus:bg-white text-sm"
              >
                <option value="">Escolher artigo do stock...</option>
                {filteredStock.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.referencia} — {s.descricao} {s.quantidade > 0 ? `(Qtd: ${s.quantidade})` : "(Sem Stock)"}
                  </option>
                ))}
              </select>
            </div>
          )}
          {closureStock.length > 0 && filteredStock.length === 0 && (
            <p className="mt-2 text-xs text-slate-400 italic">Nenhum artigo de fecho corresponde à pesquisa.</p>
          )}
          <p className="mt-2 text-[11px] text-slate-400">
            Pode adicionar vários autocolantes/selos: escolha novamente o artigo para criar mais uma linha.
          </p>
        </div>
      </div>
    </div>
  );
}
