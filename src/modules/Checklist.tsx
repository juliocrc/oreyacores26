"use client";

import React, { useState, useEffect, useRef } from "react";
import { normalizeMonthYearValue } from "@/lib/date-display";
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
  onItemAction?: (fieldName: string, action: "replace" | "ok", packItem?: any) => Promise<any>;
  onUploadPhoto?: (fieldName: string, file: File | string) => Promise<string | null>;
  onClose: () => void;
}

export default function Checklist({ raft, initialValues, onSave, onItemAction, onClose }: ChecklistProps) {
  const sections = buildInspectionChecklistFromQuadro(raft);
  const allFields = sections.flatMap((s) =>
    s.fields.map((f) => ({ ...f, sectionTitle: s.title }))
  );
  const total = allFields.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [values, setValues] = useState<Record<string, any>>(() => {
    const defaults = buildChecklistInitialValues(sections, raft);
    return { ...defaults, ...(initialValues || {}) };
  });
  const [showScanner, setShowScanner] = useState(false);
  const [useCamera, setUseCamera] = useState(false);
  const [scanQuery, setScanQuery] = useState("");
  const [scanMessage, setScanMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);
  const [pendingReplacementFieldName, setPendingReplacementFieldName] = useState<string | null>(null);
  const [suggestedReplacementFieldName, setSuggestedReplacementFieldName] = useState<string | null>(null);
  const scannerRef = useRef<any>(null);

  const current = allFields[currentIndex] ?? null;
  const answered = allFields.filter((f) => values[f.name] !== undefined && values[f.name] !== "").length;

  const handleFieldChange = (name: string, value: any) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const goNext = () => {
    if (currentIndex < total - 1) setCurrentIndex((i) => i + 1);
    else onSave(values);
  };

  const goPrev = () => {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  };

  const jumpToField = (fieldName: string) => {
    const idx = allFields.findIndex((f) => f.name === fieldName);
    if (idx >= 0) setCurrentIndex(idx);
  };

  // --- scanner helpers ---
  const findFieldByName = (fieldName: string) => allFields.find((f) => f.name === fieldName) ?? null;

  const getFieldQueryScore = (field: any, cleanQuery: string) => {
    const item = field?.packItem;
    if (!item) return 0;
    const refs = Array.isArray(item.stockReferences) ? item.stockReferences : [];
    const normalizedRefs = refs.map((r: string) => String(r || "").trim().toUpperCase()).filter(Boolean);
    const label = String(field?.label || "").toUpperCase();
    const name = String(field?.name || "").toUpperCase();
    let score = 0;
    if (normalizedRefs.includes(cleanQuery)) score += 100;
    if (normalizedRefs.some((ref: string) => ref.includes(cleanQuery) || cleanQuery.includes(ref))) score += 40;
    if (label.includes(cleanQuery) || cleanQuery.includes(label)) score += 20;
    if (name.includes(cleanQuery) || cleanQuery.includes(name)) score += 10;
    return score;
  };

  const findBestMatchingField = (cleanQuery: string, excludeFieldName?: string) => {
    let bestField: any = null;
    let bestScore = 0;
    for (const field of allFields) {
      if (excludeFieldName && field.name === excludeFieldName) continue;
      const score = getFieldQueryScore(field, cleanQuery);
      if (score > bestScore) { bestScore = score; bestField = field; }
    }
    return bestScore > 0 ? bestField : null;
  };

  const fieldMatchesQuery = (field: any, cleanQuery: string) => {
    const item = field?.packItem;
    if (!item) return false;
    const refs = Array.isArray(item.stockReferences) ? item.stockReferences : [];
    const normalizedRefs = refs.map((r: string) => String(r || "").trim().toUpperCase()).filter(Boolean);
    return (
      normalizedRefs.includes(cleanQuery) ||
      String(field?.label || "").toUpperCase().includes(cleanQuery) ||
      String(field?.name || "").toUpperCase().includes(cleanQuery)
    );
  };

  const closeScanner = () => {
    setShowScanner(false);
    setUseCamera(false);
    setPendingReplacementFieldName(null);
    setSuggestedReplacementFieldName(null);
  };

  const startReplacementScan = (fieldName: string) => {
    setPendingReplacementFieldName(fieldName);
    setSuggestedReplacementFieldName(null);
    setScanQuery("");
    setShowScanner(true);
    setUseCamera(true);
    setScanMessage({ text: "Aponte a c�mara ao c�digo do artigo de substitui��o.", type: "info" });
  };

  const applySuggestedReplacementTarget = () => {
    if (!suggestedReplacementFieldName) return;
    const f = findFieldByName(suggestedReplacementFieldName);
    if (!f) return;
    jumpToField(f.name);
    setPendingReplacementFieldName(f.name);
    setSuggestedReplacementFieldName(null);
    setScanMessage({ text: `Sugest�o aplicada: ${f.label}. Leia novamente.`, type: "info" });
  };

  useEffect(() => {
    if (useCamera) void startCamera();
    else stopCamera();
    return () => stopCamera();
  }, [useCamera]);

  const startCamera = async () => {
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const html5QrCode = new Html5Qrcode("reader");
      scannerRef.current = html5QrCode;
      await html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText: string) => { handleBarcodeScan(decodedText); setUseCamera(false); },
        () => {}
      );
    } catch {
      setScanMessage({ text: "N�o foi poss�vel aceder � c�mera.", type: "error" });
      setUseCamera(false);
    }
  };

  const stopCamera = () => {
    if (scannerRef.current) {
      try { scannerRef.current.stop().catch(() => {}); scannerRef.current = null; } catch {}
    }
  };

  const handleBarcodeScan = async (query: string) => {
    if (!query) return;
    const cleanQuery = query.trim().toUpperCase();

    if (pendingReplacementFieldName) {
      const targetField = findFieldByName(pendingReplacementFieldName);
      if (!targetField || !targetField.packItem) {
        setScanMessage({ text: "N�o foi poss�vel identificar o item.", type: "error" });
        setPendingReplacementFieldName(null);
        setSuggestedReplacementFieldName(null);
        return;
      }
      if (!fieldMatchesQuery(targetField, cleanQuery)) {
        const suggestedField = findBestMatchingField(cleanQuery, targetField.name);
        if (suggestedField) {
          setSuggestedReplacementFieldName(suggestedField.name);
          jumpToField(suggestedField.name);
          setScanMessage({ text: `C�digo n�o corresponde a "${targetField.label}". Sugest�o: "${suggestedField.label}".`, type: "info" });
          return;
        }
        setSuggestedReplacementFieldName(null);
        setScanMessage({ text: `C�digo n�o corresponde ao item: ${targetField.label}`, type: "error" });
        return;
      }
      setSuggestedReplacementFieldName(null);
      handleFieldChange(targetField.name, false);
      if (onItemAction) {
        const stockItem = await onItemAction(targetField.name, "replace", targetField.packItem);
        if (stockItem?.validade && targetField.packItem?.validityFieldName) {
          const ym = normalizeMonthYearValue(String(stockItem.validade));
          const valStr = ym ? `${ym}-01` : String(stockItem.validade);
          handleFieldChange(targetField.packItem.validityFieldName, valStr);
          setScanMessage({ text: `Substitu�do � validade ${valStr}`, type: "success" });
        } else {
          setScanMessage({ text: `Substitui��o registada: ${targetField.label}`, type: "success" });
        }
      }
      setPendingReplacementFieldName(null);
      setScanQuery("");
      setTimeout(() => { closeScanner(); setScanMessage(null); }, 1200);
      return;
    }

    const matchedField = allFields.find((f) => {
      const item = f.packItem;
      if (!item) return false;
      const refs = (item.stockReferences || []) as string[];
      return (
        refs.some((r) => String(r).toUpperCase() === cleanQuery) ||
        f.name.toUpperCase().includes(cleanQuery) ||
        f.label.toUpperCase().includes(cleanQuery)
      );
    });

    if (matchedField) {
      setSuggestedReplacementFieldName(null);
      handleFieldChange(matchedField.name, true);
      jumpToField(matchedField.name);
      setScanMessage({ text: `Identificado: ${matchedField.label}`, type: "success" });
      setTimeout(() => { setScanMessage(null); setScanQuery(""); }, 2000);
    } else {
      setScanMessage({ text: "Equipamento n�o identificado.", type: "error" });
      setTimeout(() => setScanMessage(null), 3000);
    }
  };

  if (!current) return <div className="p-8 text-center text-slate-400">Checklist sem itens.</div>;

  const currentValue = values[current.name];
  const isCheckbox = current.type === "checkbox";
  const isDate = current.type === "date";

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
          onClick={() => setShowScanner((s) => !s)}
          className={`p-2 rounded-lg border transition-all ${showScanner ? "bg-sky-600 border-sky-600 text-white" : "border-slate-200 text-slate-500 hover:border-sky-300"}`}
          title="Scanner"
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

      {/* Scanner panel */}
      {showScanner && (
        <div className="bg-sky-50 border-b border-sky-200 p-4 shrink-0 space-y-3">
          <div className="flex gap-2">
            <input
              autoFocus
              type="text"
              placeholder="Refer�ncia ou c�digo..."
              value={scanQuery}
              onKeyDown={(e) => e.key === "Enter" && handleBarcodeScan(scanQuery)}
              onChange={(e) => setScanQuery(e.target.value)}
              className="flex-1 bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-sky-500 font-mono text-sm"
            />
            <button
              onClick={() => setUseCamera((c) => !c)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${useCamera ? "bg-amber-500 text-white" : "bg-white text-slate-700 border border-slate-300 hover:bg-slate-100"}`}
            >
              {useCamera ? "Parar" : "C�mera"}
            </button>
          </div>
          {useCamera && (
            <div className="w-full max-w-sm mx-auto aspect-square bg-black rounded-2xl overflow-hidden border border-white/10 relative">
              <div id="reader" className="w-full h-full" />
              <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-0.5 bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.8)] animate-pulse" />
            </div>
          )}
          {scanMessage && (
            <div className={`px-4 py-2.5 rounded-xl text-xs font-bold text-center ${
              scanMessage.type === "success" ? "bg-emerald-500 text-white" :
              scanMessage.type === "error" ? "bg-rose-500 text-white" : "bg-sky-500 text-white"
            }`}>
              {scanMessage.text}
              {suggestedReplacementFieldName && pendingReplacementFieldName && (
                <button
                  onClick={applySuggestedReplacementTarget}
                  className="ml-3 rounded-lg bg-white/20 px-3 py-1 hover:bg-white/30"
                >
                  Usar sugest�o
                </button>
              )}
            </div>
          )}
        </div>
      )}

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
                onClick={() => { handleFieldChange(current.name, false); startReplacementScan(current.name); }}
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
          onClick={currentIndex >= total - 1 ? () => onSave(values) : goNext}
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
