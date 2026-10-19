"use client";

import React, { useEffect, useRef, useState } from "react";
import { Mail, MessageCircle, X, FileText, Send, Eye, Paperclip, Check } from "lucide-react";
import { appToast } from "@/lib/app-toast";
import type { InspectionCertificateInput } from "@/lib/inspection-certificate";
import type { QuadroTemplateInput } from "@/lib/quadro-template";

type Channel = "email" | "whatsapp";

/** Payload do quadro pode trazer o checklist com tipos heterogéneos. */
export type QuadroPayload = Omit<QuadroTemplateInput, "checklist"> & {
  checklist?: Record<string, unknown>;
};

interface EnviarCertificadoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  certificate: InspectionCertificateInput;
  /** Payload do quadro de inspeção, usado para anexar/pré-visualizar o PDF. */
  quadro?: QuadroPayload | null;
  defaultTo?: string;
  defaultPhone?: string;
  defaultSubject?: string;
  defaultMessage?: string;
  clienteId?: number;
  jangadaId?: number;
  refId?: number;
  /** Registo da fila "por enviar" que deve passar a "enviado" ao concluir. */
  pendingId?: number;
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
  quadro,
  defaultTo = "",
  defaultPhone = "",
  defaultSubject,
  defaultMessage,
  clienteId,
  jangadaId,
  refId,
  pendingId,
}: EnviarCertificadoDialogProps) {
  const [channel, setChannel] = useState<Channel>("email");
  const [to, setTo] = useState(defaultTo);
  const [phone, setPhone] = useState(defaultPhone);
  const [subject, setSubject] = useState(defaultSubject ?? "");
  const [message, setMessage] = useState(defaultMessage ?? "");
  const [includeCertificate, setIncludeCertificate] = useState(true);
  const [includeQuadro, setIncludeQuadro] = useState(Boolean(quadro));
  const [showPreview, setShowPreview] = useState(true);
  const [sending, setSending] = useState(false);
  const [previewing, setPreviewing] = useState<null | "certificado" | "quadro">(null);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpen.current) {
      setChannel("email");
      setTo(defaultTo);
      setPhone(defaultPhone);
      setSubject(defaultSubject ?? buildDefaultSubject(certificate));
      setMessage(defaultMessage ?? buildDefaultMessage(certificate));
      setIncludeCertificate(true);
      setIncludeQuadro(Boolean(quadro));
      setShowPreview(true);
    }
    wasOpen.current = isOpen;
  }, [isOpen, defaultTo, defaultPhone, defaultSubject, defaultMessage, certificate, quadro]);

  if (!isOpen) return null;

  const hasAnyAttachment = includeCertificate || includeQuadro;
  const valid =
    message.trim().length > 0 &&
    hasAnyAttachment &&
    (channel === "email"
      ? EMAIL_RE.test(to.trim()) && subject.trim().length > 0
      : phone.trim().length >= 6);

  const certFileName = `${certificate.certNumber || "SEM-NUMERO"} ${certificate.shipName || "SEM NAVIO"}.pdf`;

  const handlePreviewPdf = async (which: "certificado" | "quadro") => {
    try {
      setPreviewing(which);
      const url = which === "certificado" ? "/api/certificados/pdf" : "/api/exportar-raft-pdf";
      const payload = which === "certificado" ? { ...certificate, jangadaId } : quadro;
      if (which === "quadro" && !payload) {
        throw new Error("Quadro indisponível para pré-visualização.");
      }
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Não foi possível gerar a pré-visualização.");
      }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      window.open(objUrl, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(objUrl), 60000);
    } catch (err) {
      appToast.error(err instanceof Error ? err.message : "Erro ao pré-visualizar o PDF.");
    } finally {
      setPreviewing(null);
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
          channel,
          to: to.trim(),
          phone: phone.trim(),
          subject: subject.trim(),
          message,
          certificate,
          quadro: includeQuadro ? quadro : undefined,
          includeCertificate,
          includeQuadro,
          clienteId,
          jangadaId,
          refId,
          pendingId,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.whatsappUrl) window.open(json.whatsappUrl, "_blank", "noopener,noreferrer");
        throw new Error(json.error || "Não foi possível enviar.");
      }
      if (json.status === "pendente" && json.whatsappUrl) {
        appToast.success("Abra o link do WhatsApp para concluir o envio (API não configurada).");
        window.open(json.whatsappUrl, "_blank", "noopener,noreferrer");
      } else if (json.status === "parcial") {
        appToast.success("Mensagem enviada, mas houve um problema com um dos anexos.");
      } else {
        appToast.success(
          channel === "email" ? `Enviado para ${to.trim()}.` : `WhatsApp enviado para ${phone.trim()}.`,
        );
      }
      onClose();
    } catch (err) {
      appToast.error(err instanceof Error ? err.message : "Erro ao enviar.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full p-6 space-y-5 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Send size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Enviar ao Armador</h3>
              <p className="text-xs text-slate-500">
                Pré-visualize o email ou a mensagem WhatsApp antes de enviar. Os PDFs seguem em anexo.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X size={20} />
          </button>
        </div>

        {/* Canal */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setChannel("email")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition ${
              channel === "email"
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            <Mail size={15} /> Email
          </button>
          <button
            type="button"
            onClick={() => setChannel("whatsapp")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition ${
              channel === "whatsapp"
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            <MessageCircle size={15} /> WhatsApp
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          {/* Formulário */}
          <div className="space-y-4">
            {channel === "email" ? (
              <>
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
              </>
            ) : (
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Telemóvel do destinatário
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+351 9xx xxx xxx"
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-100 outline-none"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Os PDFs seguem como documentos (requer WhatsApp Cloud API). Sem API, abre o link wa.me.
                </p>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                Mensagem
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={channel === "email" ? 9 : 6}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100 outline-none leading-relaxed"
              />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Documentos anexados</p>
              <label className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer">
                <span className="flex items-center gap-2 text-xs text-slate-600 min-w-0">
                  <input
                    type="checkbox"
                    checked={includeCertificate}
                    onChange={(e) => setIncludeCertificate(e.target.checked)}
                    className="accent-indigo-600"
                  />
                  <FileText size={16} className="text-indigo-600 shrink-0" />
                  <span className="truncate">{certFileName}</span>
                </span>
                <button
                  type="button"
                  onClick={() => handlePreviewPdf("certificado")}
                  disabled={previewing === "certificado"}
                  className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 hover:text-indigo-900 disabled:opacity-50 shrink-0 ml-2"
                >
                  <Eye size={14} />
                  {previewing === "certificado" ? "A gerar..." : "Ver PDF"}
                </button>
              </label>

              <label
                className={`flex items-center justify-between p-3 border rounded-xl ${
                  quadro ? "bg-slate-50 border-slate-200 cursor-pointer" : "bg-slate-100 border-slate-200 opacity-60"
                }`}
              >
                <span className="flex items-center gap-2 text-xs text-slate-600 min-w-0">
                  <input
                    type="checkbox"
                    checked={includeQuadro}
                    disabled={!quadro}
                    onChange={(e) => setIncludeQuadro(e.target.checked)}
                    className="accent-indigo-600"
                  />
                  <Paperclip size={16} className="text-emerald-600 shrink-0" />
                  <span className="truncate">
                    Quadro de inspeção{quadro?.raftSerial ? ` — ${quadro.raftSerial}` : ""}.pdf
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => handlePreviewPdf("quadro")}
                  disabled={!quadro || previewing === "quadro"}
                  className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 hover:text-indigo-900 disabled:opacity-50 shrink-0 ml-2"
                >
                  <Eye size={14} />
                  {previewing === "quadro" ? "A gerar..." : "Ver PDF"}
                </button>
              </label>
            </div>
          </div>

          {/* Pré-visualização */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Pré-visualização</p>
              <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                className="text-xs font-bold text-indigo-700 hover:text-indigo-900"
              >
                {showPreview ? "Ocultar" : "Mostrar"}
              </button>
            </div>

            {showPreview && channel === "email" && (
              <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
                <div className="bg-slate-100 px-3 py-2 text-[11px] font-mono text-slate-500 space-y-0.5">
                  <div><span className="text-slate-400">De:</span> Orey Açores — Gestor Naval</div>
                  <div><span className="text-slate-400">Para:</span> {to.trim() || "—"}</div>
                  <div><span className="text-slate-400">Assunto:</span> {subject.trim() || "—"}</div>
                </div>
                <div className="p-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
                  {message.trim() || "(sem mensagem)"}
                </div>
                {hasAnyAttachment && (
                  <div className="border-t border-slate-100 px-4 py-3 space-y-2">
                    {includeCertificate && (
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <FileText size={15} className="text-red-500" />
                        <span className="truncate">{certFileName}</span>
                      </div>
                    )}
                    {includeQuadro && (
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <FileText size={15} className="text-red-500" />
                        <span className="truncate">
                          Quadro de inspeção{quadro?.raftSerial ? ` — ${quadro.raftSerial}` : ""}.pdf
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {showPreview && channel === "whatsapp" && (
              <div className="rounded-xl border border-slate-200 overflow-hidden bg-[#e5ddd5] shadow-sm">
                <div className="bg-emerald-700 text-white px-3 py-2 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center text-xs font-bold">
                    OA
                  </div>
                  <div>
                    <p className="text-xs font-bold leading-tight">Orey Açores</p>
                    <p className="text-[10px] text-emerald-100 leading-tight">{phone.trim() || "—"}</p>
                  </div>
                </div>
                <div className="p-4 space-y-2 max-h-72 overflow-y-auto">
                  <div className="ml-auto max-w-[85%] bg-[#dcf8c6] rounded-lg rounded-tr-none px-3 py-2 text-sm text-slate-800 whitespace-pre-wrap shadow">
                    {message.trim() || "(sem mensagem)"}
                    <span className="block text-right text-[10px] text-slate-500 mt-1">✓✓</span>
                  </div>
                  {includeCertificate && (
                    <div className="ml-auto max-w-[85%] bg-[#dcf8c6] rounded-lg rounded-tr-none px-3 py-2 shadow flex items-center gap-2">
                      <FileText size={18} className="text-red-600" />
                      <span className="text-xs text-slate-700 truncate">{certFileName}</span>
                    </div>
                  )}
                  {includeQuadro && (
                    <div className="ml-auto max-w-[85%] bg-[#dcf8c6] rounded-lg rounded-tr-none px-3 py-2 shadow flex items-center gap-2">
                      <FileText size={18} className="text-red-600" />
                      <span className="text-xs text-slate-700 truncate">
                        Quadro de inspeção{quadro?.raftSerial ? ` — ${quadro.raftSerial}` : ""}.pdf
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <p className="text-[11px] text-slate-400 flex items-center gap-1">
            <Check size={13} className="text-emerald-500" />
            {hasAnyAttachment
              ? `${(includeCertificate ? 1 : 0) + (includeQuadro ? 1 : 0)} documento(s) em anexo`
              : "Sem documentos — selecione pelo menos um"}
          </p>
          <div className="flex gap-3">
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
              className={`flex items-center gap-2 px-5 py-2.5 text-white rounded-xl text-sm font-bold shadow-md transition disabled:opacity-50 ${
                channel === "email" ? "bg-indigo-600 hover:bg-indigo-700" : "bg-emerald-600 hover:bg-emerald-700"
              }`}
            >
              <Send size={15} />
              {sending ? "A enviar..." : channel === "email" ? "Enviar email" : "Enviar WhatsApp"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
