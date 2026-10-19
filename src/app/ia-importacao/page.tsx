"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Loader2,
  Plus,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { appToast } from "@/lib/app-toast";
import type { AnalyzeResult, ExtractedArtigo, HeaderFields } from "@/types/ia-importacao-page";

type JangadaResumo = {
  id: number;
  serial?: string | null;
  brand?: string | null;
  model?: string | null;
  capacity?: number | null;
  shipNameManual?: string | null;
  packType?: string | null;
  dataInspecao?: string | null;
  dataProxInspecao?: string | null;
  artigos?: Array<{ name?: string | null; validade?: string | null }>;
};

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

const KIND_LABEL: Record<string, string> = {
  "generated-certificate": "Certificado (gerado)",
  "generated-quadro": "Quadro de inspeção",
  "external-certificate": "Certificado externo",
  unknown: "Documento",
};

function fmtMonth(value?: string | null): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})-(\d{2})/);
  if (iso) return `${iso[2]}/${iso[1]}`;
  const my = raw.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (my) return `${my[1].padStart(2, "0")}/${my[2]}`;
  return raw;
}

function fmtDay(value?: string | null): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return raw;
}

function displayValue(field: ApplyField, value?: string | null): string {
  if (!value) return "";
  return field.kind === "date" ? fmtDay(value) : field.kind === "month" ? fmtMonth(value) : String(value);
}

function isBlank(value: unknown): boolean {
  return value == null || String(value).trim() === "";
}

export default function IaImportacaoPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState<AnalyzeResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list).filter((f) => /\.(pdf|xlsx|xlsm|xls)$/i.test(f.name));
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...incoming.filter((f) => !names.has(f.name))];
    });
  };

  const handleAnalyze = async () => {
    if (!files.length) return;
    try {
      setAnalyzing(true);
      const formData = new FormData();
      files.forEach((file) => formData.append("file", file));
      const res = await fetch("/api/ia-importacao/analisar", { method: "POST", body: formData });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Não foi possível analisar os documentos.");
      setResults(Array.isArray(json.results) ? json.results : []);
      const errors = Array.isArray(json.errors) ? json.errors : [];
      if (errors.length) {
        appToast.error(
          errors
            .map(
              (e: { fileName: string; error: string; detail?: string }) =>
                `${e.fileName}: ${e.error}${e.detail ? ` (${e.detail})` : ""}`,
            )
            .join(" • "),
        );
      }
    } catch (err) {
      appToast.error(err instanceof Error ? err.message : "Erro ao analisar.");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
          <Sparkles size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Análise e Importação por IA</h1>
          <p className="text-sm text-slate-500">
            Carregue quadros ou certificados, confirme os dados extraídos e aplique-os à ficha da jangada correspondente.
          </p>
        </div>
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles(e.dataTransfer.files);
        }}
        className="cursor-pointer rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center transition-colors hover:border-violet-300"
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="mx-auto text-violet-500" size={30} />
        <p className="mt-2 text-sm font-bold text-slate-700">Arraste os ficheiros para aqui ou clique para escolher</p>
        <p className="text-xs text-slate-400">PDF, XLSX, XLSM, XLS — até 8 ficheiros por análise</p>
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
            <span key={file.name} className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
              {/\.pdf$/i.test(file.name) ? <FileText size={14} className="text-red-500" /> : <FileSpreadsheet size={14} className="text-emerald-600" />}
              {file.name}
              <button type="button" onClick={() => setFiles((prev) => prev.filter((f) => f.name !== file.name))} className="text-slate-400 hover:text-red-500">
                <X size={13} />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={analyzing}
            className="ml-auto flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 font-bold text-white shadow-sm transition-all hover:bg-violet-700 disabled:opacity-60"
          >
            {analyzing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {analyzing ? "A analisar..." : "Analisar documentos"}
          </button>
        </div>
      )}

      {results.length === 0 && !analyzing && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          Ainda não há documentos analisados. Depois de analisar, pode abrir a ficha existente, aplicar apenas os campos
          vazios ou adicionar uma jangada/colete quando o número de série não existe no sistema.
        </div>
      )}

      {results.map((result, index) => (
        <ResultCard key={`${result.fileName}-${index}`} result={result} />
      ))}
    </div>
  );
}

function ResultCard({ result }: { result: AnalyzeResult }) {
  const header = result.preview.extractedHeader;
  const artigos = result.preview.extractedArtigos ?? [];
  const serial = String(header?.raftSerial ?? "").trim();
  const [lookupState, setLookupState] = useState<{
    key: string;
    status: "idle" | "loading" | "found" | "missing";
    target: JangadaResumo | null;
  }>({ key: "", status: "idle", target: null });
  const activeLookup =
    lookupState.key === serial
      ? lookupState
      : { key: serial, status: serial ? ("loading" as const) : ("idle" as const), target: null };
  const target = activeLookup.target;
  const lookup = activeLookup.status;
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    if (!serial) return;
    let active = true;
    fetch(`/api/jangadas/serial/${encodeURIComponent(serial)}`, { cache: "no-store" })
      .then(async (res) => {
        if (!active) return;
        if (!res.ok) {
          setLookupState({ key: serial, status: "missing", target: null });
          return;
        }
        const json = (await res.json()) as JangadaResumo;
        if (!active) return;
        setLookupState({ key: serial, status: json?.id ? "found" : "missing", target: json?.id ? json : null });
      })
      .catch(() => {
        if (!active) return;
        setLookupState({ key: serial, status: "missing", target: null });
      });
    return () => {
      active = false;
    };
  }, [serial]);

  const emptiness = useCallback(
    (field: ApplyField) => {
      if (!target) return true;
      return isBlank((target as unknown as Record<string, unknown>)[field.applyKey]);
    },
    [target],
  );

  const pendingFields = APPLY_FIELDS.filter((f) => String(header?.[f.key] ?? "").trim() && emptiness(f));
  const canApplyArtigos = (target?.artigos?.length ?? 0) === 0 && artigos.length > 0;

  const handleApply = async () => {
    if (!target?.id) return;
    try {
      setApplying(true);
      const payload: Record<string, unknown> = {};
      for (const f of pendingFields) {
        payload[f.applyKey] = String(header?.[f.key] ?? "").trim();
      }
      if (canApplyArtigos) {
        payload.artigos = artigos
          .filter((a: ExtractedArtigo) => a.name?.trim())
          .map((a) => ({
            name: a.name.trim(),
            validade: a.validade ? fmtMonth(a.validade) : undefined,
            quantidade: a.quantidade,
            referencia: a.referencia,
          }));
        payload.substituirArtigos = false;
      }
      if (Object.keys(payload).length === 0) {
        appToast.info("Não há campos vazios a preencher; usa a ficha para substituir valores.");
        return;
      }
      payload.fileName = result.fileName;
      payload.fileType = result.fileType;
      payload.documentKind = result.preview.analysis?.documentKind ?? "unknown";
      payload.extracted = { header, artigos };
      const correctedFields = { ...payload };
      payload.corrected = { fields: correctedFields, artigos: payload.artigos ?? [] };

      const res = await fetch(`/api/jangadas/${target.id}/importar-documento`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Não foi possível aplicar os dados.");
      setApplied(true);
      if (target.artigos && payload.artigos) {
        // refletir artigos aplicados localmente
        setLookupState((prev) => ({
          ...prev,
          target: { ...target, artigos: artigos.map((a) => ({ name: a.name, validade: a.validade ?? null })) },
        }));
      }
      appToast.success(
        `Ficha ${target.serial || target.id} atualizada${json.appliedFields?.length ? ` (${json.appliedFields.length} campo(s))` : ""}.`,
      );
    } catch (err) {
      appToast.error(err instanceof Error ? err.message : "Erro ao aplicar.");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {result.fileType === "pdf" ? <FileText size={16} className="shrink-0 text-red-500" /> : <FileSpreadsheet size={16} className="shrink-0 text-emerald-600" />}
          <span className="truncate text-sm font-bold text-slate-800">{result.fileName}</span>
          <span className="shrink-0 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-violet-600">
            {KIND_LABEL[result.preview.analysis?.documentKind ?? "unknown"]}
          </span>
        </div>
        <span className="shrink-0 text-[11px] text-slate-400">
          {result.summary.sheetCount ? `${result.summary.sheetCount} aba(s) ` : ""}
          {result.summary.lines ? `${result.summary.lines} linha(s)` : ""}
        </span>
      </div>

      {result.warning && (
        <div className="flex items-start gap-2 border-b border-amber-100 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>{result.warning}</span>
        </div>
      )}

      <div className="grid gap-5 p-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {header?.certificadoNumero && (
              <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] text-slate-600">
                <span className="font-bold">Certificado:</span> {header.certificadoNumero}
              </span>
            )}
            {header?.raftSerial && (
              <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] text-slate-600">
                <span className="font-bold">Série:</span> {header.raftSerial}
              </span>
            )}
          </div>

          <div className="space-y-1.5">
            {APPLY_FIELDS.map((f) => {
              const value = displayValue(f, header?.[f.key]);
              if (!value) return null;
              return (
                <div key={f.key} className="flex items-baseline gap-2 text-xs">
                  <span className="w-32 shrink-0 font-semibold text-slate-600">{f.label}</span>
                  <span className="text-slate-800">{value}</span>
                </div>
              );
            })}
            {APPLY_FIELDS.every((f) => !String(header?.[f.key] ?? "").trim()) && (
              <p className="text-xs text-slate-400">Nenhum campo de identificação reconhecido.</p>
            )}
          </div>

          <div className="border-t border-slate-100 pt-3 text-xs">
            <p className="mb-1 font-semibold text-slate-600">Artigos ({artigos.length})</p>
            {artigos.length === 0 && <p className="text-slate-400">Nenhum artigo reconhecido.</p>}
            <ul className="max-h-40 space-y-0.5 overflow-y-auto text-slate-700">
              {artigos.slice(0, 40).map((a, i) => (
                <li key={`${a.name}-${i}`} className="flex justify-between gap-3">
                  <span className="truncate">{a.name}</span>
                  <span className="shrink-0 text-slate-400">{fmtMonth(a.validade) || "sem validade"}</span>
                </li>
              ))}
            </ul>
            {artigos.length > 40 && <p className="mt-1 text-slate-400">… +{artigos.length - 40}</p>}
          </div>
        </div>

        <div className="space-y-3">
          {!serial && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              O documento não tem número de série reconhecido. Use a ficha da jangada para aplicar os dados manualmente.
            </div>
          )}

          {serial && lookup === "loading" && (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <Loader2 size={16} className="animate-spin" /> A procurar a série {serial}…
            </div>
          )}

          {serial && lookup === "found" && target && (
            <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-900">Série encontrada no sistema</p>
              <p className="text-xs text-emerald-800">
                {[target.brand, target.model, target.capacity ? `${target.capacity}P` : null].filter(Boolean).join(" · ") || "Jangada"}
                {target.shipNameManual ? ` — ${target.shipNameManual}` : ""}
              </p>
              <p className="text-xs text-emerald-700">
                {pendingFields.length > 0
                  ? `${pendingFields.length} campo(s) vazio(s) podem ser preenchidos.`
                  : "A ficha já tem estes campos preenchidos."}
                {canApplyArtigos ? ` ${artigos.length} artigo(s) serão adicionados.` : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/jangadas/${target.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                >
                  <ExternalLink size={13} /> Abrir ficha
                </Link>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={applying || applied}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {applying ? <Loader2 size={13} className="animate-spin" /> : applied ? <Check size={13} /> : <Check size={13} />}
                  {applied ? "Aplicado" : applying ? "A aplicar..." : "Aplicar campos vazios"}
                </button>
              </div>
            </div>
          )}

          {serial && lookup === "missing" && (
            <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">Série não encontrada: {serial}</p>
              <p className="text-xs text-amber-800">Pretende adicioná-la como jangada ou como colete?</p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/jangadas?novoSerial=${encodeURIComponent(serial)}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700"
                >
                  <Plus size={13} /> Adicionar jangada
                </Link>
                <Link
                  href={`/equipamentos?novoSerial=${encodeURIComponent(serial)}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-bold text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100"
                >
                  <Plus size={13} /> Adicionar colete
                </Link>
                <Link
                  href={`/jangadas?pesquisa=${encodeURIComponent(serial)}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                >
                  Pesquisar
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
        <button type="button" onClick={() => setShowRaw((v) => !v)} className="text-xs font-bold text-slate-500 hover:text-slate-700">
          {showRaw ? "Ocultar" : "Ver"} texto extraído
        </button>
      </div>

      {showRaw && (
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap bg-slate-900 p-4 text-[11px] leading-relaxed text-slate-100">
          {result.preview.rawTextFull || "(sem texto)"}
        </pre>
      )}
    </div>
  );
}
