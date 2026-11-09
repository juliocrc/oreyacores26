"use client";

import { useEffect, useMemo, useState } from "react";
import { Anchor, Check, Clock, Copy, FileCheck2, Ship } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/date-utils";
import DeclaracoesIvaPanel from "./DeclaracoesIvaPanel";
import { isSosDocumentRaft, SOS_DOCUMENT_NOTICE } from '@/lib/raft-document-rules';

type WorkflowStatus = {
  state: "SEM_ESTADO" | "RECEIONADA" | "EM_INSPECAO" | "FINALIZADA" | "OUTRO";
  label: string;
  dataHora?: string | null;
  queueStatus?: string | null;
};

type AndroidPdfBridge = {
  openPdf?: (dataUrl: string, fileName: string) => void;
};

function androidPdfBridge(): AndroidPdfBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as unknown as { OreyAndroid?: AndroidPdfBridge }).OreyAndroid;
  return bridge && typeof bridge.openPdf === "function" ? bridge : null;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Falha ao ler o PDF."));
    reader.readAsDataURL(blob);
  });
}

type Jangada = {
  id: number;
  serial: string;
  brand: string;
  model: string;
  capacity: number;
  owner?: string | null;
  navioId?: number | null;
  navioNome: string | null;
  tipoPesca?: string | null;
  dataInspecao: string | null;
  dataProxInspecao: string | null;
  status: { label: string; color: "green" | "yellow" | "orange" | "red" | "gray"; daysLeft: number | null };
  diasParaProxima: number | null;
  ultimoCertificadoNumero: string | null;
  certificadoPdfUrl: string | null;
  quadroPdfUrl?: string | null;
  quadroInspecaoId?: number | null;
  quadroInspecaoData?: string | null;
  certificadoPdfPublicUrl?: string | null;
  hruReferencia?: string | null;
  hruValidade?: string | null;
  workflowStatus?: WorkflowStatus;
};

type Navio = { id: number; nome: string; matricula?: string; ilha?: string; tipoPesca?: string };

function determineGlobalState(j: Jangada) {
  const wf = j.workflowStatus?.state;
  if (wf === "RECEIONADA") return { state: "RECEIONADA" as const, label: j.workflowStatus?.label || "Rececionada na estação", dataHora: j.workflowStatus?.dataHora };
  if (wf === "EM_INSPECAO") return { state: "EM_INSPECAO" as const, label: j.workflowStatus?.label || "Em inspeção", dataHora: j.workflowStatus?.dataHora };
  if (wf === "FINALIZADA") return { state: "FINALIZADA" as const, label: j.workflowStatus?.label || "Pronta para entrega", dataHora: j.workflowStatus?.dataHora };
  if (j.status.color === "red") return { state: "EXPIRADA" as const, label: "Expirada" };
  if (j.status.color === "orange" || j.status.color === "yellow") return { state: "VALIDA" as const, label: "A expirar" };
  if (j.status.color === "green") return { state: "VALIDA" as const, label: "Válida" };
  return { state: "SEM_ESTADO" as const, label: "Sem inspeção" };
}

const STATE_STYLE: Record<string, string> = {
  VALIDA: "border-emerald-200 bg-emerald-50 text-emerald-700",
  EXPIRADA: "border-rose-200 bg-rose-50 text-rose-700",
  RECEIONADA: "border-sky-200 bg-sky-50 text-sky-700",
  EM_INSPECAO: "border-indigo-200 bg-indigo-50 text-indigo-700",
  FINALIZADA: "border-teal-200 bg-teal-50 text-teal-700",
  SEM_ESTADO: "border-slate-200 bg-slate-50 text-slate-600",
};

export default function ClienteJangadasPanel({ navios, jangadas, previewClienteId }: { navios: Navio[]; jangadas: Jangada[]; previewClienteId?: string | null }) {
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [documentError, setDocumentError] = useState<{ id: number; message: string } | null>(null);
  const [loadingDocument, setLoadingDocument] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ url: string; label: string } | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  async function openQuadro(j: Jangada) {
    if (isSosDocumentRaft(j) || !j.quadroPdfUrl || loadingDocument !== null) return;
    setLoadingDocument(j.id);
    setDocumentError(null);
    setPreview(null);
    try {
      const response = await fetch(`${j.quadroPdfUrl}${previewClienteId ? `&previewClienteId=${encodeURIComponent(previewClienteId)}` : ''}`, { cache: 'no-store' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Nao e possivel gerar o quadro. Contacte a estacao para recuperar o arquivo desta inspecao.');
      }
      const id = response.headers.get('X-Inspection-Id') || new URL(j.quadroPdfUrl, window.location.origin).searchParams.get('inspecaoId');
      const date = response.headers.get('X-Inspection-Date');
      const blob = await response.blob();

      // Na app Android, abrir no leitor de PDF nativo em vez do iframe.
      const nativePdf = androidPdfBridge();
      if (nativePdf?.openPdf) {
        try {
          const dataUrl = await blobToDataUrl(blob);
          nativePdf.openPdf(dataUrl, `quadro-${j.serial}-${id || 'inspecao'}.pdf`);
          return;
        } catch {
          // Se a ponte falhar, mantém a pré-visualização web.
        }
      }

      setPreview({ url: URL.createObjectURL(blob), label: `Quadro | Inspecao #${id} | ${date ? formatDate(date) : 'Sem data'} | ${j.serial}` });
    } catch (error) {
      setDocumentError({ id: j.id, message: error instanceof Error ? error.message : 'Nao e possivel gerar o quadro.' });
    } finally {
      setLoadingDocument(null);
    }
  }

  const copyShareLink = async (j: Jangada) => {
    if (!j.certificadoPdfPublicUrl) return;
    const url = `${window.location.origin}${j.certificadoPdfPublicUrl}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(j.id);
      setTimeout(() => setCopiedId((current) => (current === j.id ? null : current)), 2500);
    } catch {
      window.prompt("Copie o link do certificado:", url);
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<number, { navio: Navio | null; items: Jangada[] }>();
    for (const n of navios) map.set(n.id, { navio: n, items: [] });
    map.set(-1, { navio: null, items: [] });
    for (const j of jangadas) {
      const key = j.navioId && map.has(j.navioId) ? j.navioId : -1;
      const g = map.get(key);
      if (g) g.items.push(j);
      else map.set(-1, { navio: null, items: [...(map.get(-1)?.items || []), j] });
    }
    return Array.from(map.values()).filter((g) => g.items.length > 0);
  }, [navios, jangadas]);

  return (
    <section className="rounded-3xl border border-slate-200/60 bg-white p-6 sm:p-8 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Módulos essenciais</p>
          <h2 className="mt-1 text-lg font-extrabold text-slate-800">Jangadas associadas aos seus navios</h2>
          <p className="mt-1 text-sm text-slate-500">Consulte o estado de cada jangada: válida, rececionada na estação, em inspeção, etc.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{jangadas.length}</span>
      </div>

      <div className="mt-6 space-y-6">
        {grouped.map((group, idx) => (
          <div key={idx} className="space-y-3">
            <div className="flex items-center gap-2">
              <Ship size={16} className="text-slate-400" />
              <h3 className="text-sm font-extrabold text-slate-800">
                {group.navio ? group.navio.nome : "Sem navio associado"}
                {group.navio?.matricula && <span className="ml-2 text-xs font-semibold text-slate-500">{group.navio.matricula}</span>}
              </h3>
              <span className="ml-auto rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700">{group.items.length}</span>
            </div>

            <div className="space-y-3">
              {group.navio && <DeclaracoesIvaPanel key={group.navio.id} navioId={group.navio.id} />}
              {group.items.map((j) => {
                const gs = determineGlobalState(j);
                const wfDataHora = gs.dataHora || j.workflowStatus?.dataHora ? formatDateTime(gs.dataHora || j.workflowStatus?.dataHora) : null;
                return (
                  <div key={j.id} className="rounded-2xl border border-slate-200 p-4 sm:p-5 transition hover:border-indigo-300 hover:bg-slate-50/40">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-extrabold text-slate-800">
                          {j.brand} {j.model} · <span className="font-mono text-slate-700">{j.serial}</span>
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Capacidade: {j.capacity} · {j.navioNome || "—"}
                          {!isSosDocumentRaft(j) && j.hruReferencia && <span className="ml-2">· HRU Ref: {j.hruReferencia} {j.hruValidade ? `(Val: ${formatDate(j.hruValidade)})` : ""}</span>}
                        </p>
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-xs font-bold ${STATE_STYLE[gs.state] || STATE_STYLE.SEM_ESTADO}`}>
                        {gs.label}
                        {wfDataHora && (gs.state === "RECEIONADA" || gs.state === "EM_INSPECAO" || gs.state === "FINALIZADA") && (
                          <span className="ml-1 text-[11px] font-semibold opacity-90">· {wfDataHora}</span>
                        )}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="flex items-center gap-1 text-xs font-bold text-slate-500">
                          <FileCheck2 size={12} /> Inspeção (última)
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">{formatDate(j.dataInspecao)}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="flex items-center gap-1 text-xs font-bold text-slate-500">
                          <Clock size={12} /> Próxima inspeção
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">{formatDate(j.dataProxInspecao)}</p>
                        {j.diasParaProxima !== null && j.diasParaProxima !== undefined && (
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {j.diasParaProxima < 0 ? `há ${Math.abs(j.diasParaProxima)} dias` : j.diasParaProxima === 0 ? "hoje" : `em ${j.diasParaProxima} dias`}
                          </p>
                        )}
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="flex items-center gap-1 text-xs font-bold text-slate-500">
                          <Anchor size={12} /> Validade (GI/Inspeção)
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-800 capitalize">{j.status.label}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">{j.status.color === "red" ? "Expirada" : j.status.color === "gray" ? "Sem dados" : "Em acompanhamento"}</p>
                      </div>
                    </div>

                    {j.certificadoPdfUrl && (
                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        <a href={j.certificadoPdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-white">
                          <FileCheck2 size={14} /> Ver certificado PDF
                        </a>
                        {!isSosDocumentRaft(j) && j.quadroPdfUrl && (
                          <a href={`${j.quadroPdfUrl}${previewClienteId ? `&previewClienteId=${encodeURIComponent(previewClienteId)}` : ""}`} onClick={event => { event.preventDefault(); void openQuadro(j); }} aria-disabled={loadingDocument !== null} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-white">
                            <FileCheck2 size={14} /> Ver quadro de inspeção PDF
                          </a>
                        )}
                        {j.certificadoPdfPublicUrl && (
                          <button
                            type="button"
                            onClick={() => copyShareLink(j)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50"
                          >
                            {copiedId === j.id ? <Check size={14} /> : <Copy size={14} />}
                            {copiedId === j.id ? "Link copiado" : "Copiar link para partilhar"}
                          </button>
                        )}
                      </div>
                    )}
                    {loadingDocument === j.id && <p role="status" className="mt-3 text-sm">A preparar quadro da inspecao guardada...</p>}
                    {isSosDocumentRaft(j) && <p className="mt-2 text-xs text-slate-500">{SOS_DOCUMENT_NOTICE}</p>}
                    {!isSosDocumentRaft(j) && j.quadroPdfUrl && j.quadroInspecaoId && <p className="mt-2 text-xs text-slate-500">Quadro da inspecao #{j.quadroInspecaoId} | {j.quadroInspecaoData ? formatDate(j.quadroInspecaoData) : 'Sem data'}. A data pode coincidir com outros registos; o documento usa este ID exato.</p>}
                    {documentError?.id === j.id && <p role="alert" className="mt-3 text-sm text-red-700">{documentError.message}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {preview && <div className="mt-4 rounded-xl border border-slate-200 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold">{preview.label}</p>
          <button type="button" onClick={() => setPreview(null)} className="text-sm font-bold">Fechar quadro</button>
        </div>
        <iframe title={preview.label} src={preview.url} className="h-[70vh] min-h-80 w-full border" />
      </div>}
    </section>
  );
}
