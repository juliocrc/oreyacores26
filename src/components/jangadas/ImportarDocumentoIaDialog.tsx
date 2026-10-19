"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  FileSpreadsheet,
  FileText,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { appToast } from "@/lib/app-toast";
import type { AnalyzeResult, ExtractedArtigo, HeaderFields } from "@/types/ia-importacao-page";

type CurrentValues = Partial<Record<string, string | number | null>>;

type ArtigoEdicao = { name: string; validade?: string; quantidade?: number; referencia?: string };

type ArtigoEntrada = { name?: string; validade?: string | null; quantidade?: number | null; referencia?: string | null };

interface NavioOption {
  id: number;
  nome: string;
  matricula?: string | null;
  ilha?: string | null;
}

interface ClienteOption {
  id: number;
  nome: string;
  navios: NavioOption[];
}

interface ImportarDocumentoIaDialogProps {
  isOpen: boolean;
  onClose: () => void;
  jangadaId: number;
  current?: CurrentValues;
  currentArtigos?: ArtigoEntrada[];
  currentShipId?: number | null;
  onApplied?: () => void;
}

type ApplyField = { key: keyof HeaderFields; applyKey: string; label: string; kind?: "month" | "date" };

const APPLY_FIELDS: ApplyField[] = [
  { key: "brand", applyKey: "brand", label: "Marca" },
  { key: "model", applyKey: "model", label: "Modelo" },
  { key: "capacity", applyKey: "capacity", label: "Lotação" },
  { key: "dataFabrico", applyKey: "dataFabrico", label: "Data Fabrico", kind: "month" },
  { key: "fabricType", applyKey: "fabricType", label: "Tipo de Tela" },
  { key: "emergencyPackType", applyKey: "packType", label: "Pack" },
  { key: "ownerName", applyKey: "owner", label: "Armador" },
  { key: "shipName", applyKey: "shipNameManual", label: "Navio (texto)" },
  { key: "dataInspecao", applyKey: "dataInspecao", label: "Data Inspeção", kind: "date" },
  { key: "dataProxInspecao", applyKey: "dataProxInspecao", label: "Próx. Inspeção", kind: "date" },
  { key: "cylinderSerial", applyKey: "cylinderSerial", label: "Cilindro (série)" },
  { key: "cylinderCo2", applyKey: "cylinderCo2", label: "CO₂" },
  { key: "cylinderN2", applyKey: "cylinderN2", label: "N₂" },
  { key: "cylinderTara", applyKey: "cylinderTara", label: "Tara" },
  { key: "cylinderPesoBruto", applyKey: "cylinderPesoBruto", label: "Peso Bruto" },
  { key: "cylinderSistema", applyKey: "cylinderSistema", label: "Sistema Insuflação" },
];

const IDENT_FIELDS: Array<{ key: keyof HeaderFields; label: string }> = [
  { key: "certificadoNumero", label: "Certificado" },
  { key: "raftSerial", label: "Nº Série" },
];

const KIND_LABEL: Record<string, string> = {
  "generated-certificate": "Certificado (gerado)",
  "generated-quadro": "Quadro de inspeção",
  "external-certificate": "Certificado externo",
  unknown: "Documento",
};

function normKey(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toMonthInput(value?: string): string {
  if (!value) return "";
  const iso = value.match(/^(\d{4})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const mmYyyy = value.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (mmYyyy) return `${mmYyyy[2]}-${mmYyyy[1].padStart(2, "0")}`;
  return "";
}

function fromMonthInput(value: string): string {
  if (!value) return "";
  const m = value.match(/^(\d{4})-(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-01` : value;
}

/** Valor para <input type="date"> no formato AAAA-MM-DD (mostra DD/MM/AAAA). */
function toDateInput(value?: string): string {
  if (!value) return "";
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = value.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const mmYyyy = value.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (mmYyyy) return `${mmYyyy[2]}-${mmYyyy[1].padStart(2, "0")}-01`;
  return "";
}

function fieldInputValue(field: ApplyField, value?: string): string {
  return field.kind === "date" ? toDateInput(value) : toMonthInput(value);
}

function mergeArtigos(currentList: ArtigoEntrada[] | undefined, extractedList: ExtractedArtigo[] | undefined): ArtigoEdicao[] {
  const map = new Map<string, ArtigoEdicao>();
  for (const a of currentList ?? []) {
    if (!a.name) continue;
    map.set(normKey(a.name), {
      name: a.name,
      quantidade: a.quantidade ?? undefined,
      validade: a.validade ?? undefined,
      referencia: a.referencia ?? undefined,
    });
  }
  for (const a of extractedList ?? []) {
    if (!a.name) continue;
    const key = normKey(a.name);
    const existing = map.get(key);
    map.set(key, {
      name: a.name,
      quantidade: a.quantidade ?? existing?.quantidade,
      validade: a.validade || existing?.validade,
      referencia: a.referencia ?? existing?.referencia,
    });
  }
  return [...map.values()];
}

export default function ImportarDocumentoIaDialog({
  isOpen,
  onClose,
  jangadaId,
  current,
  currentArtigos,
  currentShipId,
  onApplied,
}: ImportarDocumentoIaDialogProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState<AnalyzeResult[]>([]);
  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen || clientes.length > 0) return;
    let active = true;
    fetch("/api/clientes", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((json) => {
        if (active && Array.isArray(json)) setClientes(json);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isOpen, clientes.length]);

  if (!isOpen) return null;

  const reset = () => {
    setFiles([]);
    setResults([]);
    setAnalyzing(false);
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list).filter((f) => /\.(pdf|xlsx|xlsm|xls)$/i.test(f.name));
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...incoming.filter((f) => !names.has(f.name))];
    });
  };

  const handleAnalyze = async () => {
    if (files.length === 0) return;
    try {
      setAnalyzing(true);
      const formData = new FormData();
      files.forEach((file) => formData.append("file", file));
      const res = await fetch("/api/ia-importacao/analisar", { method: "POST", body: formData });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Não foi possível analisar os documentos.");
      setResults(Array.isArray(json.results) ? json.results : []);
      const errors = Array.isArray(json.errors) ? json.errors : [];
      if (errors.length)         appToast.error(
          errors
            .map(
              (e: { fileName: string; error: string; detail?: string }) =>
                `${e.fileName}: ${e.error}${e.detail ? ` (${e.detail})` : ""}`,
            )
            .join(" • "),
        );
    } catch (err) {
      appToast.error(err instanceof Error ? err.message : "Erro ao analisar.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApplied = () => {
    reset();
    onApplied?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full p-6 space-y-5 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
              <Sparkles size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Importar Documento (IA)</h3>
              <p className="text-xs text-slate-500">
                Carregue o quadro e/ou o certificado. Reveja e edite os campos, artigos e associações e submeta — as suas correções ficam guardadas como treino.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X size={20} />
          </button>
        </div>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }}
          className="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center hover:border-violet-300 transition-colors cursor-pointer"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="mx-auto text-violet-500" size={28} />
          <p className="mt-2 text-sm font-bold text-slate-700">Arraste os ficheiros para aqui ou clique para escolher</p>
          <p className="text-xs text-slate-400">PDF, XLSX, XLSM, XLS</p>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.xlsx,.xlsm,.xls"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {files.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {files.map((file) => (
              <span key={file.name} className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700">
                {/\.pdf$/i.test(file.name) ? <FileText size={14} className="text-red-500" /> : <FileSpreadsheet size={14} className="text-emerald-600" />}
                {file.name}
                <button onClick={() => setFiles((prev) => prev.filter((f) => f.name !== file.name))} className="text-slate-400 hover:text-red-500">
                  <X size={13} />
                </button>
              </span>
            ))}
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-white bg-violet-600 hover:bg-violet-700 transition-all shadow-sm disabled:opacity-60 ml-auto"
            >
              {analyzing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {analyzing ? "A analisar..." : "Analisar documentos"}
            </button>
          </div>
        )}

        {results.map((result, index) => (
          <ResultCard
            key={`${result.fileName}-${index}`}
            result={result}
            jangadaId={jangadaId}
            current={current}
            currentArtigos={currentArtigos}
            currentShipId={currentShipId}
            clientes={clientes}
            onApplied={handleApplied}
          />
        ))}
      </div>
    </div>
  );
}

function ResultCard({
  result,
  jangadaId,
  current,
  currentArtigos,
  currentShipId,
  clientes,
  onApplied,
}: {
  result: AnalyzeResult;
  jangadaId: number;
  current?: CurrentValues;
  currentArtigos?: ArtigoEntrada[];
  currentShipId?: number | null;
  clientes: ClienteOption[];
  onApplied: () => void;
}) {
  const header = result.preview.extractedHeader;
  const [edited, setEdited] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const f of APPLY_FIELDS) {
      const value = header?.[f.key] ?? "";
      if (value) initial[f.key] = String(value);
    }
    return initial;
  });
  const [selected, setSelected] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const f of APPLY_FIELDS) {
      const value = header?.[f.key];
      if (!value) continue;
      const currentValue = String(current?.[f.applyKey] ?? "").trim();
      const nextValue = String(value).trim();
      initial[f.key] = currentValue === "" || fieldInputValue(f, currentValue) !== fieldInputValue(f, nextValue);
    }
    return initial;
  });
  const [artigos, setArtigos] = useState<ArtigoEdicao[]>(() => mergeArtigos(currentArtigos, result.preview.extractedArtigos));
  const [substituir, setSubstituir] = useState(true);
  const [showRaw, setShowRaw] = useState(false);
  const [saving, setSaving] = useState(false);

  const defaultCliente = useMemo(
    () => clientes.find((c) => c.navios.some((n) => n.id === currentShipId))?.id ?? "",
    [clientes, currentShipId],
  );
  const [clienteId, setClienteId] = useState<number | "">(defaultCliente);
  const [shipId, setShipId] = useState<number | "">(currentShipId ?? "");

  const navioOptions = useMemo(() => clientes.find((c) => c.id === clienteId)?.navios ?? [], [clientes, clienteId]);

  const selectedCount = useMemo(
    () => APPLY_FIELDS.filter((f) => selected[f.key] && String(edited[f.key] ?? "").trim()).length,
    [selected, edited],
  );

  const handleApply = async () => {
    try {
      setSaving(true);
      const appliedFields: Record<string, string> = {};
      const payload: Record<string, unknown> = {};
      for (const f of APPLY_FIELDS) {
        if (!selected[f.key]) continue;
        const value = String(edited[f.key] ?? "").trim();
        if (!value) continue;
        payload[f.applyKey] = value;
        appliedFields[f.applyKey] = value;
      }

      const finalArtigos = artigos
        .filter((a) => a.name.trim())
        .map((a) => ({
          name: a.name.trim(),
          validade: a.validade ? fromMonthInput(toMonthInput(a.validade)).trim() : undefined,
          quantidade: a.quantidade,
          referencia: a.referencia,
        }));

      payload.artigos = finalArtigos;
      payload.substituirArtigos = substituir;
      if (shipId !== "") payload.shipId = shipId;

      payload.fileName = result.fileName;
      payload.fileType = result.fileType;
      payload.documentKind = result.preview.analysis?.documentKind ?? "unknown";
      payload.extracted = {
        header: result.preview.extractedHeader,
        artigos: result.preview.extractedArtigos ?? [],
      };
      payload.corrected = {
        fields: appliedFields,
        artigos: finalArtigos,
        shipId: shipId === "" ? null : shipId,
        substituirArtigos: substituir,
      };

      const res = await fetch(`/api/jangadas/${jangadaId}/importar-documento`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Não foi possível aplicar os dados.");

      const parts: string[] = [];
      if (json.appliedFields?.length) parts.push(`${json.appliedFields.length} campo(s)`);
      if (json.artigosAplicados) parts.push(`${json.artigosAplicados} artigo(s)`);
      appToast.success(parts.length ? `Ficha atualizada: ${parts.join(" e ")}.` : "Nada a aplicar.");
      onApplied();
    } catch (err) {
      appToast.error(err instanceof Error ? err.message : "Erro ao aplicar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 bg-slate-50 px-4 py-3 border-b border-slate-200">
        <div className="flex items-center gap-2 min-w-0">
          {result.fileType === "pdf" ? <FileText size={16} className="text-red-500 shrink-0" /> : <FileSpreadsheet size={16} className="text-emerald-600 shrink-0" />}
          <span className="font-bold text-sm text-slate-800 truncate">{result.fileName}</span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full shrink-0">
            {KIND_LABEL[result.preview.analysis?.documentKind ?? "unknown"]}
          </span>
        </div>
        <span className="text-[11px] text-slate-400 shrink-0">
          {result.summary.sheetCount ? `${result.summary.sheetCount} aba(s) ` : ""}
          {result.summary.lines ? `${result.summary.lines} linha(s)` : ""}
        </span>
      </div>

      {result.warning && (
        <div className="flex items-start gap-2 bg-amber-50 border-b border-amber-100 px-4 py-2.5 text-xs text-amber-800">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          <span>{result.warning}</span>
        </div>
      )}

      <div className="p-4 grid gap-5 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Campos da ficha</p>
          {(header?.certificadoNumero || header?.raftSerial) && (
            <div className="flex flex-wrap gap-2 mb-1">
              {IDENT_FIELDS.map((f) =>
                header?.[f.key] ? (
                  <span key={f.key} className="text-[11px] bg-slate-100 text-slate-600 rounded-lg px-2 py-1">
                    <span className="font-bold">{f.label}:</span> {String(header[f.key])}
                  </span>
                ) : null,
              )}
            </div>
          )}

          {/* Associação cliente / navio */}
          <div className="grid grid-cols-2 gap-2 pb-2 border-b border-slate-100">
            <label className="text-[11px] font-semibold text-slate-600">
              Cliente
              <select
                value={clienteId}
                onChange={(e) => {
                  const value = e.target.value ? Number(e.target.value) : "";
                  setClienteId(value);
                  setShipId("");
                }}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1 text-xs font-normal"
              >
                <option value="">— selecionar —</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] font-semibold text-slate-600">
              Navio
              <select
                value={shipId}
                onChange={(e) => setShipId(e.target.value ? Number(e.target.value) : "")}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1 text-xs font-normal"
                disabled={navioOptions.length === 0}
              >
                <option value="">— sem navio —</option>
                {navioOptions.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.nome}
                    {n.matricula ? ` (${n.matricula})` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="space-y-1.5">
            {APPLY_FIELDS.map((f) => {
              const value = edited[f.key] ?? "";
              if (!value && !selected[f.key]) return null;
              const currentValue = String(current?.[f.applyKey] ?? "").trim();
              return (
                <label key={f.key} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={Boolean(selected[f.key])}
                    onChange={(e) => setSelected((prev) => ({ ...prev, [f.key]: e.target.checked }))}
                    className="accent-violet-600"
                  />
                  <span className="w-28 shrink-0 font-semibold text-slate-600">{f.label}</span>
                  {f.kind === "month" || f.kind === "date" ? (
                    <input
                      type={f.kind}
                      value={fieldInputValue(f, value)}
                      onChange={(e) => setEdited((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      className="flex-1 rounded-lg border border-slate-200 px-2 py-1"
                    />
                  ) : (
                    <input
                      type="text"
                      value={value}
                      onChange={(e) => setEdited((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      className="flex-1 rounded-lg border border-slate-200 px-2 py-1"
                    />
                  )}
                  {currentValue && fieldInputValue(f, currentValue) !== fieldInputValue(f, value) && (
                    <span className="text-[10px] text-amber-600 shrink-0" title={`Atual: ${currentValue}`}>
                      atual: {currentValue}
                    </span>
                  )}
                </label>
              );
            })}
            {APPLY_FIELDS.every((f) => !edited[f.key]) && (
              <p className="text-xs text-slate-400">Nenhum campo de identificação reconhecido.</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Artigos da jangada ({artigos.length})</p>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} className="accent-violet-600" />
              Substituir artigos da ficha
            </label>
          </div>
          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {artigos.map((artigo, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="text"
                  value={artigo.name}
                  onChange={(e) => setArtigos((prev) => prev.map((a, i) => (i === index ? { ...a, name: e.target.value } : a)))}
                  className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                />
                <input
                  type="month"
                  value={toMonthInput(artigo.validade)}
                  onChange={(e) => setArtigos((prev) => prev.map((a, i) => (i === index ? { ...a, validade: fromMonthInput(e.target.value) } : a)))}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs w-32"
                />
                <button onClick={() => setArtigos((prev) => prev.filter((_, i) => i !== index))} className="text-slate-300 hover:text-red-500">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button
              onClick={() => setArtigos((prev) => [...prev, { name: "", validade: undefined }])}
              className="flex items-center gap-1 text-xs font-bold text-violet-600 hover:text-violet-800"
            >
              <Plus size={13} /> Adicionar artigo
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
        <button onClick={() => setShowRaw((v) => !v)} className="text-xs font-bold text-slate-500 hover:text-slate-700">
          {showRaw ? "Ocultar" : "Ver"} texto extraído
        </button>
        <button
          onClick={handleApply}
          disabled={saving || (selectedCount === 0 && artigos.length === 0 && shipId === "")}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all shadow-sm disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          {saving ? "A submeter..." : "Submeter à ficha"}
        </button>
      </div>

      {showRaw && (
        <pre className="max-h-72 overflow-auto bg-slate-900 text-slate-100 text-[11px] leading-relaxed p-4 whitespace-pre-wrap">
          {result.preview.rawTextFull || "(sem texto)"}
        </pre>
      )}
    </div>
  );
}
