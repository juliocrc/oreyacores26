"use client";

import { useEffect, useRef, useState } from "react";

const endpoint = "/api/portal/declaracao-isencao-pdf";
const signedEndpoint = "/api/portal/declaracao-isencao-assinada";
type Entry = { id: number; numeroCompleto: string; dataEmissao: string;
  pdfAssinado?: { filename: string; size: number; uploadedAt: string; sha256: string } | null };

export default function DeclaracoesIvaPanel({ navioId, codigoIsencaoIva = "M05", origem = "cliente", format = "pdf" }: {
  navioId: number; codigoIsencaoIva?: string; origem?: "cliente" | "relatorios"; format?: "pdf" | "docx";
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState<number | null>(null);
  const pending = useRef<{ identity: string; key: string } | null>(null);
  const inFlight = useRef(false);
  const uploadInFlight = useRef(false);
  useEffect(() => {
    let active = true;
    fetch(`${endpoint}?navioId=${navioId}&historico=1`, { cache: "no-store" })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Erro ao carregar historico."); if (active) setEntries(data); })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [navioId]);

  const emit = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    const identity = `${navioId}:${codigoIsencaoIva}:${origem}`;
    try {
      if (pending.current?.identity !== identity) pending.current = { identity, key: crypto.randomUUID() };
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ navioId, codigoIsencaoIva, origem, format, idempotencyKey: pending.current.key }) });
      if (!response.ok) throw new Error((await response.json()).error || "Erro ao emitir declaracao.");
      const blob = await response.blob();
      const id = Number(response.headers.get("X-Declaration-Id"));
      const numeroCompleto = response.headers.get("X-Declaration-Number") || "";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = response.headers.get("Content-Disposition")?.match(/filename="?([^";]+)/)?.[1] || `declaracao-iva.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (id) setEntries(current => [{ id, numeroCompleto, dataEmissao: response.headers.get("X-Declaration-Date") || new Date().toISOString() }, ...current.filter(entry => entry.id !== id)]);
      pending.current = null;
    } catch (err) {
      // Keep the request token after an ambiguous failure: retry must not allocate again.
      setError(err instanceof Error ? err.message : "Erro ao emitir declaracao.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const upload = async (entry: Entry, file: File) => {
    if (uploadInFlight.current) return;
    setError("");
    if (!/\.pdf$/i.test(file.name) || !file.size || file.size > 4 * 1024 * 1024) {
      setError("Selecione um PDF com tamanho maximo de 4 MB.");
      return;
    }
    uploadInFlight.current = true;
    setUploading(entry.id);
    try {
      const form = new FormData();
      form.set("pdf", file);
      form.set("expectedSha256", entry.pdfAssinado?.sha256 ?? "");
      const response = await fetch(`${signedEndpoint}?declaracaoId=${entry.id}`, { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao anexar PDF assinado.");
      setEntries(current => current.map(item => item.id === entry.id ? { ...item, pdfAssinado: data.pdfAssinado } : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao anexar PDF assinado.");
    } finally { uploadInFlight.current = false; setUploading(null); }
  };

  return <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-sm">
    <p className="font-semibold text-slate-800">Declaracoes de IVA</p>
    <button type="button" disabled={busy} onClick={() => void emit()} className="rounded border border-emerald-300 px-3 py-2 text-emerald-800 disabled:opacity-50">
      {busy ? "A emitir..." : `Emitir nova declaracao (${format === "docx" ? "Word" : "PDF"})`}
    </button>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <ul className="space-y-1">
      {entries.map(entry => <li key={entry.id} className="flex flex-wrap gap-3">
        <span>{entry.numeroCompleto} · {new Date(entry.dataEmissao).toLocaleDateString("pt-PT")}</span>
        <a className="underline" href={`${endpoint}?declaracaoId=${entry.id}`} target="_blank" rel="noopener noreferrer">Reimprimir PDF</a>
        <a className="underline" href={`${endpoint}?declaracaoId=${entry.id}&format=docx`}>Word</a>
        {entry.pdfAssinado && <a className="underline" href={`${signedEndpoint}?declaracaoId=${entry.id}`}>
          PDF assinado: {entry.pdfAssinado.filename}
        </a>}
        <label className="w-full text-xs text-slate-600">
          {uploading === entry.id ? "A enviar PDF..." : entry.pdfAssinado ? "Substituir PDF assinado (max. 4 MB)" : "Anexar PDF assinado (max. 4 MB)"}
          <input type="file" accept=".pdf,application/pdf" disabled={uploading !== null}
            aria-label={`PDF assinado da declaracao ${entry.numeroCompleto}`}
            className="mt-1 block max-w-full" onChange={event => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void upload(entry, file);
            }} />
        </label>
      </li>)}
    </ul>
    <p className="text-xs text-slate-500">Reimprimir conserva o numero e os dados originais. Anexe um ficheiro assinado externamente pelo armador ou representante legal. A aplicacao nao assina nem valida juridicamente a assinatura. O original e o anexo assinado permanecem separados.</p>
  </div>;
}
