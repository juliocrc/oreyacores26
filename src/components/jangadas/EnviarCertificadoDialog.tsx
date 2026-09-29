"use client";

import React, { useEffect, useRef, useState } from "react";
import { Mail, X, FileText, Send, Eye } from "lucide-react";
import { appToast } from "@/lib/app-toast";
import type { InspectionCertificateInput } from "@/lib/inspection-certificate";

interface EnviarCertificadoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  certificate: InspectionCertificateInput;
  defaultTo?: string;
  defaultSubject?: string;
  defaultMessage?: string;
  clienteId?: number;
  jangadaId?: number;
  refId?: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function buildDefaultSubject(cert: InspectionCertificateInput): string {
  const nr = cert.certNumber ? `n.º ${cert.certNumber}` : "";
  const ship = cert.shipName ? ` - ${cert.shipName}` : "";
  return `Certificado de Inspeção ${nr}${ship}`.trim();
}

function buildDefaultMessage(cert: InspectionCertificateInput): string {
  const lines = ["Exmo(a). Sr(a).,", ""];
  lines.push(
    `Segue em anexo o Certificado de Inspeção${cert.certNumber ? ` n.º ${cert.certNumber}` : ""} relativo à jangada salva-vidas ${cert.raftModel || ""}${
      cert.raftSerial ? ` (série ${cert.raftSerial})` : ""
    }${cert.shipName ? ` da embarcação "${cert.shipName}"` : ""}.`.replace(/\s+/g, " "),
  );
  lines.push("");
  lines.push("Qualquer dúvida, ficamos ao seu inteiro dispor.");
  lines.push("");
  lines.push("Com os melhores cumprimentos,");
  lines.push("Orey Açores — Gestor Naval");
  return lines.join("\n");
}

export default function EnviarCertificadoDialog({
  isOpen,
  onClose,
  certificate,
  defaultTo = "",
  defaultSubject,
  defaultMessage,
  clienteId,
  jangadaId,
  refId,
}: EnviarCertificadoDialogProps) {
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject ?? "");
  const [message, setMessage] = useState(defaultMessage ?? "");
  const [sending, setSending] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpen.current) {
      setTo(defaultTo);
      setSubject(defaultSubject ?? buildDefaultSubject(certificate));
      setMessage(defaultMessage ?? buildDefaultMessage(certificate));
    }
    wasOpen.current = isOpen;
  }, [isOpen, defaultTo, defaultSubject, defaultMessage, certificate]);

  if (!isOpen) return null;

  const valid = EMAIL_RE.test(to.trim()) && subject.trim().length > 0 && message.trim().length > 0;

  const handlePreview = async () => {
    try {
      setPreviewing(true);
      const res = await fetch("/api/certificados/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(certificate),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Não foi possível gerar a pré-visualização.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      appToast.error(err instanceof Error ? err.message : "Erro ao pré-visualizar o certificado.");
    } finally {
      setPreviewing(false);
    }
  };

  const handleSend = async () => {
    if (!valid) return;
    try {
      setSending(true);
      const res = await fetch("/api/certificados/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: to.trim(),
          subject: subject.trim(),
          message,
          certificate,
          clienteId,
          jangadaId,
          refId,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Não foi possível enviar o certificado.");
      appToast.success(`Certificado enviado para ${to.trim()}.`);
      onClose();
    } catch (err) {
      appToast.error(err instanceof Error ? err.message : "Erro ao enviar o certificado.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 p-6 space-y-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Mail size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Enviar Certificado por Email</h3>
              <p className="text-xs text-slate-500">
                Confirme os dados antes de enviar. O certificado segue em anexo (PDF).
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
              Email do destinatário
            </label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="cliente@exemplo.com"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-100 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
              Assunto
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-100 outline-none font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
              Mensagem
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={9}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100 outline-none leading-relaxed"
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <div className="flex items-center gap-2 text-xs text-slate-600 min-w-0">
              <FileText size={16} className="text-indigo-600 shrink-0" />
              <span className="truncate">
                Anexo: {certificate.certNumber || "SEM-NUMERO"} {certificate.shipName || "SEM NAVIO"}.pdf
              </span>
            </div>
            <button
              type="button"
              onClick={handlePreview}
              disabled={previewing}
              className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 hover:text-indigo-900 disabled:opacity-50 shrink-0 ml-2"
            >
              <Eye size={14} />
              {previewing ? "A gerar..." : "Pré-visualizar PDF"}
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-bold text-slate-700 transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!valid || sending}
            onClick={handleSend}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-md transition disabled:opacity-50"
          >
            <Send size={15} />
            {sending ? "A enviar..." : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  );
}
