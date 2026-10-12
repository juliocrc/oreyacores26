"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCcw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { sampleLegislacao, type LegislacaoItem } from "../../modules/Legislacao";

type StoredFile = {
  name: string;
  relativePath?: string;
  size: number;
  modified: string | Date;
  url?: string;
};

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-PT");
}

export default function LegislacaoPage() {
  const [query, setQuery] = useState("");
  const [openContent, setOpenContent] = useState<string | null>(null);
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const referencias: LegislacaoItem[] = useMemo(() => sampleLegislacao(), []);

  const loadFiles = useCallback(async () => {
    setLoadingFiles(true);
    try {
      const res = await fetch("/api/upload-documento?folder=legislacao", { cache: "no-store" });
      if (!res.ok) throw new Error("Não foi possível listar a legislação carregada.");
      const data = await res.json();
      setFiles(Array.isArray(data?.files) ? data.files : []);
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Erro ao listar legislação.");
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  const termo = query.trim().toLowerCase();

  const referenciasFiltradas = useMemo(
    () =>
      referencias.filter(
        (i) =>
          !termo ||
          i.titulo.toLowerCase().includes(termo) ||
          (i.referencia || "").toLowerCase().includes(termo) ||
          (i.descricao || "").toLowerCase().includes(termo),
      ),
    [referencias, termo],
  );

  const ficheirosFiltrados = useMemo(
    () => files.filter((f) => !termo || f.name.toLowerCase().includes(termo)),
    [files, termo],
  );

  const handleUpload = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setMessage(null);
    setIsError(false);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "legislacao");
      const res = await fetch("/api/upload-documento", { method: "POST", body: formData });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result?.error || "Falha ao carregar o ficheiro.");
      setMessage(`"${result.originalName || file.name}" carregado com sucesso.`);
      await loadFiles();
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Erro ao carregar ficheiro.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (file: StoredFile) => {
    const alvo = file.relativePath || file.name;
    if (!window.confirm(`Eliminar "${file.name}"? Esta ação é irreversível.`)) return;
    setDeletingName(alvo);
    setMessage(null);
    setIsError(false);
    try {
      const res = await fetch(`/api/legislacao/${encodeURIComponent(alvo)}`, { method: "DELETE" });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result?.error || "Falha ao eliminar o ficheiro.");
      setMessage(`"${file.name}" eliminado.`);
      await loadFiles();
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Erro ao eliminar ficheiro.");
    } finally {
      setDeletingName(null);
    }
  };

  const fileHref = (file: StoredFile) =>
    file.url || `/api/legislacao/${encodeURIComponent(file.relativePath || file.name)}`;

  return (
    <div className="p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Legislação</h1>
            <p className="text-sm text-slate-500">
              Diplomas de referência e documentação legal carregada para consulta da estação de serviço.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png"
              onChange={(e) => void handleUpload(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-60"
            >
              {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              Carregar diploma
            </button>
          </div>
        </div>

        <div className="mb-4 flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Procurar por título, referência ou ficheiro"
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <button
            type="button"
            onClick={() => setQuery("")}
            className="rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
          >
            Limpar
          </button>
        </div>

        {message && (
          <p
            className={`mb-4 rounded-xl p-3 text-sm font-semibold ${
              isError ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {message}
          </p>
        )}

        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-500">
              Documentos carregados
            </h2>
            <button
              type="button"
              onClick={() => void loadFiles()}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700"
            >
              <RefreshCcw size={13} className={loadingFiles ? "animate-spin" : ""} />
              Atualizar
            </button>
          </div>

          {loadingFiles && files.length === 0 ? (
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin" /> A carregar...
            </div>
          ) : ficheirosFiltrados.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
              Sem documentos carregados. Use "Carregar diploma" para adicionar.
            </div>
          ) : (
            <ul className="space-y-2">
              {ficheirosFiltrados.map((file) => {
                const alvo = file.relativePath || file.name;
                return (
                  <li
                    key={alvo}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
                        <FileText size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-800">{file.name}</p>
                        <p className="text-xs text-slate-500">
                          {formatBytes(file.size)} · {formatDate(file.modified)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={fileHref(file)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                      >
                        <Download size={13} /> Abrir
                      </a>
                      <button
                        type="button"
                        onClick={() => void handleDelete(file)}
                        disabled={deletingName === alvo}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                      >
                        {deletingName === alvo ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        Eliminar
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-xs font-black uppercase tracking-wider text-slate-500">
            Diplomas de referência
          </h2>
          <ul className="space-y-2">
            {referenciasFiltradas.map((i) => (
              <li key={i.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-800">{i.titulo}</div>
                    <div className="text-sm text-slate-500">
                      {i.referencia}
                      {i.data ? ` · ${i.data}` : ""}
                    </div>
                    {i.descricao && (
                      <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{i.descricao}</p>
                    )}
                    {i.url && (
                      <a
                        href={i.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline"
                      >
                        <ExternalLink size={14} /> Abrir no Diário da República
                      </a>
                    )}
                    {i.relacionados && i.relacionados.length > 0 && (
                      <div className="mt-2 text-xs text-slate-600">
                        <span className="font-semibold">Diploma relacionado: </span>
                        {i.relacionados.map((rel, idx) => (
                          <React.Fragment key={`${i.id}-${idx}`}>
                            {idx > 0 ? " · " : null}
                            <a
                              href={rel.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-700 hover:underline"
                            >
                              {rel.titulo}
                            </a>
                          </React.Fragment>
                        ))}
                      </div>
                    )}
                  </div>
                  {i.detalhe && (
                    <button
                      type="button"
                      onClick={() => setOpenContent(i.detalhe || i.descricao || null)}
                      className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200"
                    >
                      Ver conteúdo
                    </button>
                  )}
                </div>
              </li>
            ))}
            {referenciasFiltradas.length === 0 && (
              <li className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
                Nenhum diploma corresponde à pesquisa.
              </li>
            )}
          </ul>
        </section>
      </div>

      {openContent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[80vh] w-full max-w-3xl overflow-auto rounded-xl bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-start justify-between">
              <h3 className="text-lg font-bold text-slate-800">Conteúdo</h3>
              <button
                type="button"
                className="rounded bg-slate-200 px-2.5 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-300"
                onClick={() => setOpenContent(null)}
              >
                Fechar
              </button>
            </div>
            <pre className="whitespace-pre-wrap text-sm text-slate-700">{openContent}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
