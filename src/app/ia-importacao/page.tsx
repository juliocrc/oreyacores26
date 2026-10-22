"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { appToast } from "@/lib/app-toast";
import {
  EMPTY_HEADER,
  type AnalyzeResult,
  type ExtractedArtigo,
  type HeaderFields,
} from "@/types/ia-importacao-page";

type ServiceStationOption = {
  id: number;
  codigo: string;
  nome: string;
  localizacao?: string | null;
};

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

type EditableField = {
  key: keyof HeaderFields;
  label: string;
  placeholder?: string;
};

const EDITABLE_FIELDS: EditableField[] = [
  { key: "certificadoNumero", label: "Certificado" },
  { key: "shipName", label: "Navio" },
  { key: "ownerName", label: "Armador" },
  { key: "raftSerial", label: "Nº de série" },
  { key: "brand", label: "Marca" },
  { key: "model", label: "Modelo" },
  { key: "capacity", label: "Lotação" },
  { key: "emergencyPackType", label: "Pack" },
  { key: "dataFabrico", label: "Data de fabrico", placeholder: "MM/AAAA" },
  { key: "fabricType", label: "Tipo de tela" },
  { key: "dataInspecao", label: "Data de inspeção", placeholder: "DD/MM/AAAA" },
  { key: "dataProxInspecao", label: "Próxima inspeção", placeholder: "DD/MM/AAAA" },
  { key: "cylinderSerial", label: "Cilindro - nº série" },
  { key: "cylinderCo2", label: "Cilindro - CO2" },
  { key: "cylinderN2", label: "Cilindro - N2" },
  { key: "cylinderTara", label: "Cilindro - tara" },
  { key: "cylinderPesoBruto", label: "Cilindro - peso bruto" },
  { key: "cylinderSistema", label: "Cilindro - sistema" },
];

type DraftArtigo = {
  name: string;
  quantidade: string;
  referencia: string;
  codigoFabricante: string;
  validade: string;
};

function toDraftHeader(header?: HeaderFields | null): HeaderFields {
  const source = { ...EMPTY_HEADER, ...(header ?? {}) };
  return {
    ...source,
    dataFabrico: fmtMonth(source.dataFabrico),
    dataInspecao: fmtDay(source.dataInspecao),
    dataProxInspecao: fmtDay(source.dataProxInspecao),
  };
}

function toDraftArtigos(artigos: ExtractedArtigo[]): DraftArtigo[] {
  return artigos.map((artigo) => ({
    name: artigo.name ?? "",
    quantidade: artigo.quantidade ? String(artigo.quantidade) : "1",
    referencia: artigo.referencia ?? "",
    codigoFabricante: artigo.codigoFabricante ?? "",
    validade: fmtMonth(artigo.validade),
  }));
}

function toImportArtigos(artigos: DraftArtigo[]) {
  return artigos
    .filter((artigo) => artigo.name.trim())
    .map((artigo) => ({
      name: artigo.name.trim(),
      quantidade: Number(artigo.quantidade) || 1,
      referencia: artigo.referencia.trim() || undefined,
      codigoFabricante: artigo.codigoFabricante.trim() || undefined,
      validade: artigo.validade.trim() || undefined,
    }));
}

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

export default function IaImportacaoPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState<AnalyzeResult[]>([]);
  const [stations, setStations] = useState<ServiceStationOption[]>([]);
  const [selectedStation, setSelectedStation] = useState<ServiceStationOption | null>(null);
  const [stationId, setStationId] = useState<number | null>(null);
  const [loadingStations, setLoadingStations] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/active-service-station", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json();
        const available = Array.isArray(json.availableStations) ? json.availableStations : [];
        setStations(available);
        const selected = available.find((st: ServiceStationOption) => st.id === Number(json.activeStationId)) ?? available[0] ?? null;
        setSelectedStation(selected);
        setStationId(selected?.id ?? null);
      })
      .catch(() => {})
      .finally(() => setLoadingStations(false));
  }, []);

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
            Carregue quadros ou certificados, confirme os dados extraídos, escolha a estação de serviço e importe para o sistema.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600">
          Estação de serviço de destino
        </label>
        {loadingStations ? (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 size={14} className="animate-spin" /> A carregar estações...
          </div>
        ) : (
          <select
            value={stationId ?? ""}
            onChange={(e) => setStationId(Number(e.target.value) || null)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-800 focus:border-violet-500 focus:outline-none"
          >
            {stations.length === 0 && <option value="">Sem estações disponíveis</option>}
            {stations.map((st) => (
              <option key={st.id} value={st.id}>
                {st.codigo} — {st.nome}
              </option>
            ))}
          </select>
        )}
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
        <ResultCard key={`${result.fileName}-${index}`} result={result} stationId={stationId} stationName={selectedStation?.nome ?? ""} />
      ))}
    </div>
  );
}

function ResultCard({ result, stationId, stationName }: { result: AnalyzeResult; stationId: number | null; stationName: string }) {
  const header = result.preview.extractedHeader;
  const artigos = result.preview.extractedArtigos ?? [];

  const [draftHeader, setDraftHeader] = useState<HeaderFields>(() => toDraftHeader(header));
  const [draftArtigos, setDraftArtigos] = useState<DraftArtigo[]>(() => toDraftArtigos(artigos));
  const [showRaw, setShowRaw] = useState(false);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);

  const serial = String(draftHeader.raftSerial ?? "").trim();
  const [lookupState, setLookupState] = useState<{
    key: string;
    status: "idle" | "loading" | "found" | "missing";
    target: JangadaResumo | null;
  }>({ key: "", status: "idle", target: null });

  useEffect(() => {
    setDraftHeader(toDraftHeader(header));
    setDraftArtigos(toDraftArtigos(artigos));
    setImported(false);
  }, [result]);

  useEffect(() => {
    if (!serial) {
      setLookupState({ key: "", status: "idle", target: null });
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      setLookupState((prev) => ({ ...prev, status: "loading" }));
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
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [serial]);

  const target = lookupState.target;
  const lookup = lookupState.status;

  const handleHeaderChange = (key: keyof HeaderFields, value: string) => {
    setDraftHeader((prev) => ({ ...prev, [key]: value }));
  };

  const handleArticleChange = (index: number, key: keyof DraftArtigo, value: string) => {
    setDraftArtigos((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  };

  const handleAddArticle = () => {
    setDraftArtigos((prev) => [...prev, { name: "", quantidade: "1", referencia: "", codigoFabricante: "", validade: "" }]);
  };

  const handleRemoveArticle = (index: number) => {
    setDraftArtigos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleImport = async () => {
    if (!stationId) {
      appToast.error("Selecione uma estação de serviço de destino.");
      return;
    }
    if (!serial) {
      appToast.error("O número de série é obrigatório.");
      return;
    }
    if (!draftHeader.brand.trim() || !draftHeader.model.trim()) {
      appToast.error("Marca e modelo são obrigatórios.");
      return;
    }

    try {
      setImporting(true);
      const res = await fetch("/api/ia-importacao/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stationId,
          fields: draftHeader,
          artigos: toImportArtigos(draftArtigos),
          fileName: result.fileName,
          fileType: result.fileType,
          documentKind: result.preview.analysis?.documentKind ?? "unknown",
          extracted: { header, artigos },
          corrected: { fields: draftHeader, artigos: toImportArtigos(draftArtigos) },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Erro ao importar dados.");
      setImported(true);
      appToast.success(json.created ? "Jangada criada e importada com sucesso!" : "Ficha da jangada atualizada com sucesso!");
      if (json.jangadaId) {
        setLookupState((prev) => ({
          ...prev,
          status: "found",
          target: { id: json.jangadaId, serial, brand: draftHeader.brand, model: draftHeader.model, shipNameManual: draftHeader.shipName },
        }));
      }
    } catch (err) {
      appToast.error(err instanceof Error ? err.message : "Erro ao importar.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {result.fileType === "pdf" ? <FileText size={16} className="shrink-0 text-red-500" /> : <FileSpreadsheet size={16} className="shrink-0 text-emerald-600" />}
          <span className="truncate text-sm font-bold text-slate-800">{result.fileName}</span>
          <span className="shrink-0 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-violet-600">
            {KIND_LABEL[result.preview.analysis?.documentKind ?? "unknown"] || "Documento"}
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

      <div className="grid gap-6 p-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div>
            <h3 className="text-sm font-bold text-slate-800">1. Editar dados de identificação</h3>
            <p className="text-xs text-slate-400">Pode ajustar qualquer campo extraído antes de confirmar a importação.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {EDITABLE_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{f.label}</label>
                <input
                  type="text"
                  value={String(draftHeader[f.key] ?? "")}
                  onChange={(e) => handleHeaderChange(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-violet-500 focus:outline-none"
                />
              </div>
            ))}
          </div>

          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-bold text-slate-800">2. Artigos e validadores ({draftArtigos.length})</h3>
                <p className="text-xs text-slate-400">Lista de itens extraídos e respetivas validades, referências e códigos.</p>
              </div>
              <button
                type="button"
                onClick={handleAddArticle}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200"
              >
                <Plus size={13} /> Adicionar artigo
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Artigo</th>
                    <th className="p-2.5 w-16">Qtd</th>
                    <th className="p-2.5 w-28">Ref.</th>
                    <th className="p-2.5 w-28">Cód. Fab.</th>
                    <th className="p-2.5 w-24">Validade</th>
                    <th className="p-2.5 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {draftArtigos.map((art, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="p-2">
                        <input
                          type="text"
                          value={art.name}
                          onChange={(e) => handleArticleChange(idx, "name", e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-800 focus:border-violet-500 focus:outline-none"
                          placeholder="Nome do artigo"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min="1"
                          value={art.quantidade}
                          onChange={(e) => handleArticleChange(idx, "quantidade", e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-800 focus:border-violet-500 focus:outline-none"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={art.referencia}
                          onChange={(e) => handleArticleChange(idx, "referencia", e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-800 focus:border-violet-500 focus:outline-none"
                          placeholder="Ref."
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={art.codigoFabricante}
                          onChange={(e) => handleArticleChange(idx, "codigoFabricante", e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-800 focus:border-violet-500 focus:outline-none"
                          placeholder="Cód. Fab."
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={art.validade}
                          onChange={(e) => handleArticleChange(idx, "validade", e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-800 focus:border-violet-500 focus:outline-none"
                          placeholder="MM/AAAA"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveArticle(idx)}
                          className="text-slate-400 hover:text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {draftArtigos.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-slate-400">
                        Nenhum artigo na lista. Clique em &quot;Adicionar artigo&quot;.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800">3. Confirmação e importação</h3>
            <p className="text-xs text-slate-400">Verifique o destino antes de importar.</p>
          </div>

          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Estação destino:</span>
              <span className="font-bold text-slate-800">{stationName || "Não selecionada"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Nº de série:</span>
              <span className="font-bold text-slate-800">{serial || "(vazio)"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Estado na BD:</span>
              <span className="font-bold">
                {lookup === "loading" ? (
                  <span className="inline-flex items-center gap-1 text-amber-600"><Loader2 size={11} className="animate-spin" /> A verificar...</span>
                ) : lookup === "found" ? (
                  <span className="text-emerald-600">Já existe (será atualizada)</span>
                ) : serial ? (
                  <span className="text-violet-600">Nova jangada</span>
                ) : (
                  <span className="text-slate-400">-</span>
                )}
              </span>
            </div>
          </div>

          {target?.id && (
            <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 border border-emerald-200">
              <span>{target.brand} {target.model} {target.shipNameManual ? `• ${target.shipNameManual}` : ""}</span>
              <Link href={`/jangadas/${target.id}`} className="inline-flex items-center gap-1 font-bold underline hover:text-emerald-900">
                <ExternalLink size={12} /> Abrir
              </Link>
            </div>
          )}

          <button
            type="button"
            onClick={handleImport}
            disabled={importing || !stationId || !serial}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 font-bold text-white shadow-sm transition-all hover:bg-violet-700 disabled:opacity-60"
          >
            {importing ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {importing ? "A importar..." : imported ? "Importado com sucesso" : lookup === "found" ? "Atualizar ficha existente" : "Importar nova jangada"}
          </button>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            Ao confirmar, os dados do cabeçalho e artigos serão gravados na base de dados para a estação selecionada.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 bg-white px-4 py-3">
        <button type="button" onClick={() => setShowRaw((v) => !v)} className="text-xs font-bold text-slate-500 hover:text-slate-700">
          {showRaw ? "Ocultar" : "Ver"} texto extraído original
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
