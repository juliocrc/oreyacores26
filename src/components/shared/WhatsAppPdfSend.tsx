"use client";

import { useEffect, useRef, useState } from "react";
import { phoneIdentity } from "@/lib/communication-inbox";

export default function WhatsAppPdfSend({ recipient, ready, onComplete }: { recipient: string; ready: boolean; onComplete?: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const phone = phoneIdentity(recipient);
  useEffect(() => { setConfirmed(false); }, [recipient]);
  async function send() {
    if (lock.current || !file || !phone || !ready || !confirmed || uncertain) return;
    if (!window.confirm(`Enviar o PDF ${file.name} para ${phone}? O PDF e a mensagem de voz são envios separados.`)) return;
    lock.current = true; setBusy(true); setNotice("");
    try {
      const form = new FormData();
      form.set("pdf", file); form.set("destinatario", phone); form.set("confirmed", "true");
      const response = await fetch("/api/comunicacoes/whatsapp-documento", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) {
        if (result.uncertain === true || response.status >= 500 && result.status !== "falhou" && response.status !== 503) setUncertain(true);
        setNotice(result.error || "Não foi possível confirmar o envio.");
        return;
      }
      setNotice(typeof result.warning === "string" ? result.warning : "PDF aceite para envio. A entrega ao destinatário ainda não está confirmada.");
      setFile(null); setConfirmed(false); if (input.current) input.current.value = "";
    } catch {
      setUncertain(true);
      setNotice("Envio sem confirmação. Não repita; verifique o WhatsApp e o histórico.");
    } finally { lock.current = false; setBusy(false); onComplete?.(); }
  }
  return <section aria-label="Enviar PDF por WhatsApp" className="space-y-2 rounded-lg border border-slate-200 p-3 text-xs">
    <p className="font-semibold">Enviar fatura, certificado ou quadro em PDF</p>
    <p>O PDF é enviado separadamente da mensagem de voz. Limite: 3 MB. Confirme o ficheiro e o destinatário.</p>
    <input ref={input} aria-label="Selecionar PDF" type="file" accept=".pdf,application/pdf" disabled={busy || uncertain} onChange={event => { const selected = event.target.files?.[0] || null; setFile(selected); setConfirmed(false); setNotice(selected && (selected.size > 3 * 1024 * 1024 || !selected.name.toLowerCase().endsWith(".pdf")) ? "Selecione um PDF até 3 MB." : ""); }} />
    <label className="flex gap-2"><input type="checkbox" checked={confirmed} disabled={!file || busy || uncertain} onChange={event => setConfirmed(event.target.checked)} /><span>Confirmo o PDF {file?.name || "(não selecionado)"} e o destinatário {phone || "(inválido)"}.</span></label>
    <button type="button" disabled={!ready || !phone || !file || file.size > 3 * 1024 * 1024 || !file.name.toLowerCase().endsWith(".pdf") || !confirmed || busy || uncertain} onClick={() => void send()} className="rounded-lg bg-indigo-600 px-3 py-2 font-semibold text-white disabled:opacity-50">{busy ? "A enviar PDF…" : "Enviar PDF confirmado"}</button>
    {notice && <p role="status">{notice}</p>}
    {uncertain && <p role="alert">Não repita este envio enquanto não verificar o WhatsApp e o fornecedor.</p>}
  </section>;
}
