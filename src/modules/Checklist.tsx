"use client";

import React, { useEffect, useState } from "react";
import { toDateKey } from '@/lib/date-utils';
import { ReplacementStockPicker } from '@/components/shared/ReplacementStockPicker';
import BarcodeScanner from '@/components/shared/BarcodeScanner';
import StockArticleThumbnail from '@/components/shared/StockArticleThumbnail';
import { findMatchingArticleForPackItem } from './rafts/mandatoryPack';
import { filterStockItems, getAvailableStock, type StockPickerItem } from '@/lib/stock-picker';
import ArticleExpiryResolution from './JangadaWizard/ArticleExpiryResolution';
import { getBooleanArticleExpiryErrors, resolveArticleNextInspection } from './JangadaWizard/articleExpiry';
import { isSosRaft } from '@/lib/raft-model-rules';
import { withoutSosEquipment } from './JangadaWizard/sosRules';
import {
  buildInspectionChecklistFromQuadro,
  type ChecklistRaftInput,
  buildChecklistInitialValues,
} from "./inspectionChecklist";

interface ChecklistProps {
  raft: ChecklistRaftInput;
  initialValues?: Record<string, any>;
  itemPhotos?: Record<string, string>;
  onSave: (values: Record<string, any>) => void;
  stockItems?: StockPickerItem[];
  onItemAction?: (fieldName: string, action: "replace" | "ok", packItem?: any, selectedStock?: StockPickerItem) => Promise<any>;
  onUploadPhoto?: (fieldName: string, file: File | string) => Promise<string | null>;
  onClose: () => void;
}

type ReplacementConfig = {
  fieldLabel: string;
  stockReferences: string[];
  articleTokens: string[];
  validityFieldName?: string;
  quantity: number;
};

export function getChecklistReplacementItems(items: StockPickerItem[], config: ReplacementConfig) {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const refs = config.stockReferences.map(ref => ref.trim().toUpperCase()).filter(Boolean);
  const tokens = (config.articleTokens.length ? config.articleTokens : [config.fieldLabel]).map(normalize).filter(Boolean);
  return items.filter(item => getAvailableStock(item) >= config.quantity && (refs.length
    ? [item.referencia, item.codigoFabricante].some(ref => refs.includes(String(ref || '').trim().toUpperCase()))
    : tokens.some(token => normalize(String(item.descricao || '')).includes(token))));
}

export function ChecklistReplacementPicker({ items, config, onSelect, onClose }: {
  items: StockPickerItem[]; config: ReplacementConfig; onSelect: (item: StockPickerItem) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [scanning, setScanning] = useState(false);
  const eligible = getChecklistReplacementItems(items, config);
  const filtered = filterStockItems(eligible, query);
  if (config.validityFieldName) return <div className="relative z-[200]"><ReplacementStockPicker items={eligible} articleLabel={config.fieldLabel} onSelect={onSelect} onClose={onClose} /></div>;
  return <div className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4" onClick={onClose} onKeyDown={event => { if (event.key === 'Escape' && !scanning) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-label={`Substituir: ${config.fieldLabel}`} className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-xl bg-white p-4 space-y-3" onClick={event => event.stopPropagation()}>
      <h3 className="font-bold">Substituir: {config.fieldLabel}</h3>
      <button type="button" onClick={() => setScanning(true)} className="rounded bg-indigo-600 px-3 py-2 text-white text-sm">Ler codigo de barras / camara</button>
      <label className="block text-sm">Pesquisar stock<input autoFocus value={query} onChange={event => setQuery(event.target.value)} className="mt-1 w-full rounded border px-3 py-2" /></label>
      {filtered.map(item => <button key={item.id} type="button" onClick={() => onSelect(item)} className="flex items-center gap-3 w-full rounded border p-3 text-left text-sm"><StockArticleThumbnail foto={item.foto} label={String(item.referencia || item.descricao || item.id)} /><span>{item.referencia} - {item.descricao} (Qtd: {getAvailableStock(item)})</span></button>)}
      {filtered.length === 0 && <p role="status">Sem stock disponivel para esta pesquisa.</p>}
      <button type="button" onClick={onClose} className="rounded border px-3 py-2 text-sm">Cancelar</button>
    </div>
    {scanning && <div onClick={event => event.stopPropagation()}><BarcodeScanner onScan={code => { setQuery(code.trim()); setScanning(false); }} onClose={() => setScanning(false)} /></div>}
  </div>;
}
export default function Checklist({ raft, initialValues, stockItems, onSave, onItemAction, onClose }: ChecklistProps) {
  const sections = buildInspectionChecklistFromQuadro(raft);
  const allFields = sections.flatMap((s) =>
    s.fields.map((f) => ({ ...f, sectionTitle: s.title }))
  );
  const total = allFields.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [values, setValues] = useState<Record<string, any>>(() => {
    const defaults = buildChecklistInitialValues(sections, raft);
    return withoutSosEquipment({ ...defaults, ...(initialValues || {}) }, isSosRaft(raft));
  });
  const [replacementFieldName, setReplacementFieldName] = useState<string | null>(null);
  const [replacementItems, setReplacementItems] = useState<StockPickerItem[]>([]);
  const [replacementLoading, setReplacementLoading] = useState(false);
  const [replacementError, setReplacementError] = useState('');
  const [expiryErrors, setExpiryErrors] = useState<string[]>([]);

  useEffect(() => {
    if (stockItems) return;
    let cancelled = false;
    fetch('/api/stock?take=5000&includeFoto=true')
      .then(response => response.ok ? response.json() : [])
      .then(items => { if (!cancelled && Array.isArray(items)) setReplacementItems(items); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [stockItems]);

  const current = allFields[currentIndex] ?? null;
  const answered = allFields.filter((f) => values[f.name] !== undefined && values[f.name] !== "").length;
  const nextInspection = resolveArticleNextInspection({ ...raft, dataInspecao: values.dataInspecao || raft.dataInspecao, dataProxInspecao: values.dataProxInspecao || raft.dataProxInspecao });

  const saveChecklist = () => {
    const errors = getBooleanArticleExpiryErrors(sections, values, nextInspection);
    setExpiryErrors(errors);
    if (!errors.length) onSave(withoutSosEquipment({ ...values, dataProxInspecao: nextInspection }, isSosRaft(raft)));
  };

  const handleFieldChange = (name: string, value: any) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const goNext = () => {
    if (currentIndex < total - 1) setCurrentIndex((i) => i + 1);
    else saveChecklist();
  };

  const goPrev = () => {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  };

  const openReplacementPicker = async (fieldName: string) => {
    setReplacementFieldName(fieldName);
    setReplacementError('');
    if (stockItems) { setReplacementItems(stockItems); return; }
    setReplacementItems([]);
    setReplacementLoading(true);
    try {
      const response = await fetch('/api/stock?take=5000&includeFoto=true');
      if (!response.ok) throw new Error('Falha ao carregar stock');
      const items = await response.json();
      setReplacementItems(Array.isArray(items) ? items : []);
    } catch {
      setReplacementError('Nao foi possivel carregar stock. Feche e tente novamente.');
    } finally { setReplacementLoading(false); }
  };

  const replacementField = allFields.find(field => field.name === replacementFieldName);
  const validityFieldBySource: Record<string, string> = {
    luz_exterior_bateria: 'validade_luzes_exteriores', luz_interior_bateria: 'validade_bateria', bateria_litio: 'validade_bateria',
    pilhas_lanterna: 'validade_pilhas_lanterna', saco_agua: 'validade_agua', racoes_alimentares: 'validade_racoes', ambulancia: 'validade_farmacia',
    comprimidos_enjoo: 'validade_comprimidos', foguetoes_paraquedas: 'validade_paraquedas', fachos_mao: 'validade_fachos_mao', potes_fumo: 'validade_potes_fumo',
  };
  const replacementConfig = replacementField ? {
    fieldLabel: replacementField.label,
    stockReferences: replacementField.packItem?.stockReferences || [],
    articleTokens: replacementField.packItem?.articleTokens || [],
    validityFieldName: replacementField.packItem?.validityFieldName || validityFieldBySource[replacementField.name],
    quantity: Math.max(1, Number(replacementField.packItem?.quantity || 1)),
  } : null;

  const confirmReplacement = async (item: StockPickerItem) => {
    if (!replacementField || !replacementConfig || !getChecklistReplacementItems(replacementItems, replacementConfig).some(row => row.id === item.id)) return;
    try {
      if (onItemAction) await onItemAction(replacementField.name, 'replace', replacementField.packItem, item);
      const validity = replacementConfig.validityFieldName;
      const expiry = validity && item.validade ? toDateKey(item.validade) : '';
      setValues(prev => ({ ...prev, [replacementField.name]: true,
        [`${replacementField.name}_stockId`]: item.id,
        ...(validity ? { [`${replacementField.name}_lote`]: item.lote || '', [validity]: expiry, [`${validity}_substituido`]: true } : {}),
      }));
      setReplacementFieldName(null);
    } catch { setReplacementError('Nao foi possivel confirmar a substituicao.'); }
  };

  if (!current) return <div className="p-8 text-center text-slate-400">Checklist sem itens.</div>;

  const currentValue = values[current.name];
  const isCheckbox = current.type === "checkbox";
  const isDate = current.type === "date";
  const matchedArticle = current.packItem ? findMatchingArticleForPackItem(current.packItem, raft.artigos || []) : undefined;
  const selectedStockId = values[`${current.packItem?.checklistName || current.name}_stockId`];
  const catalogArticle = (stockItems || replacementItems).find(item => selectedStockId
    ? String(item.id) === String(selectedStockId)
    : matchedArticle?.referencia ? item.referencia === matchedArticle.referencia : (current.packItem?.stockReferences || []).includes(item.referencia || ''));

  // Section context
  const currentSectionIdx = sections.findIndex((s) => s.fields.some((f) => f.name === current.name));
  const sectionFieldsBefore = sections.slice(0, currentSectionIdx).reduce((n, s) => n + s.fields.length, 0);
  const itemInSection = currentIndex - sectionFieldsBefore + 1;
  const sectionTotal = sections[currentSectionIdx]?.fields.length ?? 1;

  return (
    <div className="flex flex-col h-full bg-white select-none">

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-white shrink-0">
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 shrink-0"
          aria-label="Fechar"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-slate-900 truncate">{raft.brand} {raft.model} � {raft.serial}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">{answered}/{total} itens respondidos</p>
        </div>
        <button
          onClick={() => void openReplacementPicker(current.packItem?.checklistName || current.name)}
          disabled={!current.packItem}
          className="p-2 rounded-lg border border-slate-200 text-slate-500 disabled:opacity-30"
          title="Substituir do stock"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h2M4 10h2M4 14h2M8 4v16M16 4v16M20 6h-2M20 10h-2M20 14h-2" />
          </svg>
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-slate-100 shrink-0">
        <div
          className="h-full bg-sky-500 transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / total) * 100}%` }}
        />
      </div>

      {replacementField && replacementConfig && !replacementLoading && <ChecklistReplacementPicker items={replacementItems} config={replacementConfig} onSelect={item => void confirmReplacement(item)} onClose={() => setReplacementFieldName(null)} />}
      {replacementField && replacementLoading && <div role="status">A carregar stock... <button type="button" onClick={() => setReplacementFieldName(null)}>Cancelar</button></div>}
      {replacementError && <p role="alert" className="p-3 text-sm text-red-700">{replacementError}</p>}

      {/* Main card � one item at a time */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 overflow-y-auto">
        <div className="w-full max-w-sm space-y-5">

          {/* Section badge */}
          <div className="flex items-center justify-center">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 px-3 py-1 rounded-full">
              {(current as any).sectionTitle} � {itemInSection}/{sectionTotal}
            </span>
          </div>

          {/* Item name */}
          <div className="text-center space-y-1.5">
            {(isCheckbox || current.packItem) && <div className="flex justify-center mb-3"><StockArticleThumbnail foto={catalogArticle?.foto} label={current.label} className="w-16 h-16" /></div>}
            <h2 className="text-[1.6rem] font-black text-slate-900 leading-tight">{current.label}</h2>
            {current.englishLabel && (
              <p className="text-sm text-slate-400 italic font-serif">{current.englishLabel}</p>
            )}
            {current.packItem?.quantityLabel && (
              <span className="inline-block text-xs font-bold text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1 mt-1">
                Requisito: {current.packItem.quantityLabel}
              </span>
            )}
          </div>

          {/* Checkbox � OK / Falha */}
          {isCheckbox && currentValue !== true && currentValue !== false && (
            <p className="text-center text-sm font-bold text-amber-700">Por verificar</p>
          )}
          {isCheckbox && (
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { handleFieldChange(current.name, true); setTimeout(goNext, 220); }}
                className={`flex-1 py-6 rounded-2xl text-lg font-black uppercase tracking-wide transition-all active:scale-95 ${
                  currentValue === true
                    ? "bg-emerald-500 text-white shadow-xl shadow-emerald-500/25"
                    : "bg-emerald-50 text-emerald-700 border-2 border-emerald-200 hover:bg-emerald-100"
                }`}
              >
                ? OK
              </button>
              <button
                onClick={() => handleFieldChange(current.name, false)}
                className={`flex-1 py-6 rounded-2xl text-lg font-black uppercase tracking-wide transition-all active:scale-95 ${
                  currentValue === false
                    ? "bg-rose-500 text-white shadow-xl shadow-rose-500/25"
                    : "bg-rose-50 text-rose-700 border-2 border-rose-200 hover:bg-rose-100"
                }`}
              >
                ? Falha
              </button>
            </div>
          )}

          {isCheckbox && currentValue === false && (
            <div className="space-y-2">
              <label htmlFor="checklist-justificacao" className="text-sm font-bold text-rose-800">Justificação de não substituição</label>
              <textarea
                id="checklist-justificacao"
                value={String(values[`${current.name}_justificacaoNaoSubstituicao`] || '')}
                onChange={(e) => handleFieldChange(`${current.name}_justificacaoNaoSubstituicao`, e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-rose-300 px-3 py-2 text-sm"
              />
              <p className="text-xs text-rose-700">Obrigatória para concluir sem substituir. O item mantém a falha, sem declaração de conformidade.</p>
            </div>
          )}

          {isCheckbox && <button type="button" onClick={() => void openReplacementPicker(current.name)} className="w-full rounded-xl border border-sky-300 py-3 text-sm font-bold text-sky-700">Substituir do stock</button>}

          {/* Date field */}
          {isDate && (
            <div className="space-y-3">
              <input
                type="date"
                value={String(values[current.name] ?? "")}
                onChange={(e) => handleFieldChange(current.name, e.target.value)}
                className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-center text-base font-medium focus:border-sky-400 outline-none"
                autoFocus
              />
              <button
                onClick={goNext}
                disabled={!values[current.name]}
                className="w-full py-4 rounded-2xl bg-sky-600 text-white font-black uppercase tracking-wide text-sm disabled:opacity-30 active:scale-95 transition-all"
              >
                Confirmar ?
              </button>
            </div>
          )}

          {/* Text / number field */}
          {isDate && current.name.startsWith('validade_') && <ArticleExpiryResolution name={current.label} validade={String(currentValue || '')} nextInspection={nextInspection} replaced={values[`${current.name}_substituido`] === true} reason={String(values[`${current.name}_justificacaoNaoSubstituicao`] || '')} onReasonChange={value => handleFieldChange(`${current.name}_justificacaoNaoSubstituicao`, value)} />}
          {!isCheckbox && !isDate && (
            <div className="space-y-3">
              <input
                type={current.type === "number" ? "number" : "text"}
                value={String(values[current.name] ?? "")}
                onChange={(e) => handleFieldChange(current.name, e.target.value)}
                className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-base focus:border-sky-400 outline-none"
                autoFocus
              />
              <button
                onClick={goNext}
                className="w-full py-4 rounded-2xl bg-sky-600 text-white font-black uppercase tracking-wide text-sm active:scale-95 transition-all"
              >
                Confirmar ?
              </button>
            </div>
          )}

          {/* Skip */}
          <button
            onClick={goNext}
            className="w-full text-xs text-slate-300 hover:text-slate-500 py-1 transition-colors"
          >
            Saltar ?
          </button>

          {/* Dot navigation � sliding window */}
          <div className="flex items-center justify-center gap-1.5 pt-2">
            {allFields.slice(Math.max(0, currentIndex - 4), currentIndex + 6).map((f, dotIdx) => {
              const realIdx = Math.max(0, currentIndex - 4) + dotIdx;
              const isCurrent = realIdx === currentIndex;
              const val = values[f.name];
              return (
                <button
                  key={f.name}
                  onClick={() => setCurrentIndex(realIdx)}
                  className={`rounded-full transition-all ${
                    isCurrent ? "w-6 h-3 bg-sky-500" :
                    val === true ? "w-2.5 h-2.5 bg-emerald-400" :
                    val === false ? "w-2.5 h-2.5 bg-rose-400" :
                    val !== undefined && val !== "" ? "w-2.5 h-2.5 bg-slate-400" :
                    "w-2.5 h-2.5 bg-slate-200 hover:bg-slate-300"
                  }`}
                />
              );
            })}
          </div>
          <p className="text-center text-[10px] text-slate-400">{currentIndex + 1} / {total}</p>

        </div>
      </div>

      {/* Footer */}
      {expiryErrors.length > 0 && <div role="alert" className="px-4 py-3 text-xs text-red-800 bg-red-50">{expiryErrors.map(error => <p key={error}>{error}</p>)}</div>}
      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-white shrink-0">
        <button
          onClick={goPrev}
          disabled={currentIndex === 0}
          className="flex items-center gap-1 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100 disabled:opacity-20 transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Anterior
        </button>
        <button
          onClick={currentIndex >= total - 1 ? saveChecklist : goNext}
          className="flex items-center gap-1 px-6 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-black uppercase tracking-wide hover:bg-indigo-700 active:scale-95 transition-all"
        >
          {currentIndex >= total - 1 ? "Concluir" : "Pr�ximo"}
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

    </div>
  );
}
