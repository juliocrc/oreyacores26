"use client";

import { useState } from "react";
import { MAX_OFFICIAL_PDF_BYTES } from "@/lib/invoice-official";

type Invoice = { id: number; numeroFatura: string; numeroFaturaOficial?: string | null; pdfOficial?: { filename: string } | null; updatedAt?: string; cancelada?: boolean };

export default function OfficialInvoiceUpload({ invoice, onSaved }: { invoice: Invoice; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState(invoice.numeroFaturaOficial || "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!number.trim() || !file || !file.size || file.size > MAX_OFFICIAL_PDF_BYTES) {
      setError("Indique o número oficial e um PDF até 4 MB."); return;
    }
    const form = new FormData();
    form.set("numeroFaturaOficial", number.trim());
    form.set("pdf", file);
    if (invoice.updatedAt) form.set("expectedUpdatedAt", invoice.updatedAt);
    setBusy(true); setError("");
    try {
      let response: Response;
      try { response = await fetch(`/api/faturas/${invoice.id}/oficial`, { method: "PATCH", body: form }); }
      catch { throw new Error("Não foi possível confirmar se o PDF foi guardado. Atualize a lista antes de repetir."); }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível guardar o PDF.");
      setOpen(false); setFile(null);
      await onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao guardar o PDF."); }
    finally { setBusy(false); }
  }

  return <div className="mt-2 text-xs">
    {invoice.pdfOficial && <a className="mr-3 text-indigo-700 underline" href={`/api/faturas/${invoice.id}/oficial`}>Descarregar PDF oficial</a>}
    {!invoice.cancelada && <button type="button" className="text-indigo-700 underline" onClick={() => { setNumber(invoice.numeroFaturaOficial || ""); setError(""); setOpen(!open); }}>{invoice.pdfOficial ? "Substituir PDF oficial" : "Carregar fatura oficial"}</button>}
    {open && !invoice.cancelada && <form onSubmit={submit} className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-3">
      <label>Número oficial<input className="mt-1 block rounded border p-1" value={number} maxLength={120} required onChange={e => setNumber(e.target.value)} /></label>
      <label>PDF oficial (máx. 4 MB)<input className="mt-1 block" type="file" accept="application/pdf,.pdf" required onChange={e => setFile(e.target.files?.[0] || null)} /></label>
      <button disabled={busy} className="rounded bg-indigo-700 px-3 py-1.5 text-white disabled:opacity-50">{busy ? "A guardar…" : "Guardar"}</button>
      <p className="w-full text-slate-500">Associe o PDF à fatura correta. Esta operação não emite nem altera a fatura no Navision.</p>
      {error && <p role="alert" className="w-full text-rose-700">{error}</p>}
    </form>}
  </div>;
}
