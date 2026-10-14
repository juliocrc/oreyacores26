"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Anchor,
  Search,
  FileText,
  CalendarClock,
  AlertTriangle,
  ShieldCheck,
  Clock,
  Loader2,
  Ship,
} from "lucide-react";
import { formatDate } from "@/lib/date-utils";
import { INSPECTION_STATUS_STYLES, type InspectionStatusColor } from "@/lib/inspection-status";

type PublicStatus = {
  serial: string;
  brand: string | null;
  model: string | null;
  capacity: number | null;
  owner: string | null;
  dataInspecao: string | null;
  dataProxInspecao: string | null;
  status: { label: string; color: InspectionStatusColor; daysLeft: number | null };
  diasParaProxima: number | null;
  ultimoCertificadoNumero: string | null;
  hruValidade: string | null;
  diasHru: number | null;
  radarReflectorValidade: string | null;
  diasRadarReflector: number | null;
  cylinderDataProxTeste: string | null;
  diasProxTesteCilindro: number | null;
};

function formatDias(dias: number | null): string {
  if (dias === null || dias === undefined) return "—";
  if (dias < 0) return `há ${Math.abs(dias)} dia${Math.abs(dias) === 1 ? "" : "s"}`;
  if (dias === 0) return "hoje";
  return `em ${dias} dia${dias === 1 ? "" : "s"}`;
}

function statusBanner(status: PublicStatus["status"]): {
  title: string;
  message: string;
  classes: string;
} {
  switch (status.color) {
    case "red":
      return {
        title: "Inspeção Geral EXPIRADA",
        message: "A jangada não está em condições de ser utilizada. Contacte a oficina com urgência.",
        classes: "bg-red-50 border-red-200 text-red-700",
      };
    case "orange":
      return {
        title: `Inspeção Geral a expirar (${status.daysLeft} dia${status.daysLeft === 1 ? "" : "s"})`,
        message: "Agende a inspeção geral nos próximos dias para não deixar expirar.",
        classes: "bg-orange-50 border-orange-200 text-orange-700",
      };
    case "yellow":
      return {
        title: `Próxima Inspeção Geral em ${status.daysLeft} dias`,
        message: "A validade da inspeção aproxima-se. Pode agendar a inspeção quando preferir.",
        classes: "bg-yellow-50 border-yellow-200 text-yellow-700",
      };
    case "green":
      return {
        title: "Inspeção Geral em dia",
        message: "A jangada está dentro da validade da inspeção geral.",
        classes: "bg-emerald-50 border-emerald-200 text-emerald-700",
      };
    default:
      return {
        title: "Sem inspeção registada",
        message: "Contacte a oficina para registar a primeira inspeção geral.",
        classes: "bg-slate-50 border-slate-200 text-slate-600",
      };
  }
}

export default function PublicStatusClient({ initialSerial }: { initialSerial: string }) {
  const [input, setInput] = useState(initialSerial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PublicStatus | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const mounted = useRef(true);

  const consultar = useCallback(async (serial: string) => {
    const value = serial.trim();
    if (!value) {
      setError("Indique o serial (número de série) da jangada.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/publico/jangada?serial=${encodeURIComponent(value)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro na consulta.");
      setResult(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro na consulta.");
    } finally {
      if (mounted.current) {
        setLoading(false);
        setHasSearched(true);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (initialSerial.trim()) {
      consultar(initialSerial);
    }
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const banner = result ? statusBanner(result.status) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-slate-50 to-indigo-50">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-6">
        <section className="bg-white rounded-3xl border border-slate-200/60 shadow-sm p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-indigo-600 text-white rounded-xl p-2.5 shadow-md shadow-indigo-600/20">
              <Anchor size={22} />
            </div>
            <div>
              <p className="text-sm font-extrabold text-slate-800 leading-tight">Orey Açores</p>
              <p className="text-xs text-slate-500 font-medium">Estado da jangada salva-vidas</p>
            </div>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-800">
            Verificar o estado da sua jangada
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Introduza o número de série (serial) impresso na jangada para consultar a validade da inspeção geral.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              consultar(input);
            }}
            className="mt-6 flex flex-col sm:flex-row gap-3"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setError(null);
              }}
              placeholder="Ex: 123456 / JANG-0001"
              className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100 outline-none font-medium uppercase"
            />
            <button
              type="submit"
              disabled={loading}
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/10 disabled:opacity-50"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
              {loading ? "A consultar..." : "Consultar"}
            </button>
          </form>

          {error && (
            <div className="mt-4 flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-xl p-4">
              <AlertTriangle size={18} className="shrink-0" />
              <p className="text-sm font-semibold">{error}</p>
            </div>
          )}

          {hasSearched && !loading && !error && !result && (
            <div className="mt-4 flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <ShieldCheck size={18} className="shrink-0" />
              <p className="text-sm font-semibold">Sem resultados. Confirme o serial impresso na jangada.</p>
            </div>
          )}
        </section>

        {result && !loading && (
          <section className="bg-white rounded-3xl border border-slate-200/60 shadow-sm p-6 sm:p-8 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-extrabold text-slate-800">
                    {result.brand || "—"} {result.model || ""}
                  </p>
                  {result.capacity ? (
                    <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                      {result.capacity}P
                    </span>
                  ) : null}
                </div>
                <p className="text-xs font-mono font-semibold text-slate-500 mt-0.5">S/N: {result.serial}</p>
                {result.owner && (
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                    <Ship size={12} className="text-slate-400" /> {result.owner}
                  </p>
                )}
              </div>
            </div>

            {banner && (
              <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${banner.classes}`}>
                <ShieldCheck size={20} className="shrink-0" />
                <div>
                  <p className="text-sm font-extrabold">{banner.title}</p>
                  <p className="text-xs font-medium mt-0.5 opacity-80">{banner.message}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <CalendarClock size={12} /> Última Inspeção
                </p>
                <p className="font-bold text-slate-700 mt-0.5">
                  {result.dataInspecao ? formatDate(result.dataInspecao) : "—"}
                </p>
              </div>
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Clock size={12} /> Próxima Inspeção
                </p>
                <p className="font-bold text-slate-700 mt-0.5">
                  {result.dataProxInspecao ? formatDate(result.dataProxInspecao) : "—"}
                </p>
                {result.diasParaProxima !== null && (
                  <p
                    className={`text-[11px] font-semibold mt-0.5 ${
                      result.diasParaProxima < 0
                        ? "text-red-600"
                        : result.diasParaProxima <= 30
                        ? "text-orange-600"
                        : "text-emerald-600"
                    }`}
                  >
                    {formatDias(result.diasParaProxima)}
                  </p>
                )}
              </div>
            </div>

            {result.ultimoCertificadoNumero && (
              <p className="text-xs text-slate-600 flex items-center gap-1.5">
                <FileText size={13} className="text-indigo-500 shrink-0" />
                Certificado: <span className="font-mono font-semibold">{result.ultimoCertificadoNumero}</span>
              </p>
            )}

            <div className="flex flex-wrap gap-1.5">
              {result.hruValidade && (
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg border ${
                    result.diasHru !== null && result.diasHru < 0
                      ? "bg-red-50 border-red-200 text-red-700"
                      : "bg-white border-slate-200 text-slate-600"
                  }`}
                >
                  HRU {formatDate(result.hruValidade)}
                  {result.diasHru !== null && result.diasHru < 0 ? " · expirado" : ""}
                </span>
              )}
              {result.radarReflectorValidade && (
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg border ${
                    result.diasRadarReflector !== null && result.diasRadarReflector < 0
                      ? "bg-red-50 border-red-200 text-red-700"
                      : "bg-white border-slate-200 text-slate-600"
                  }`}
                >
                  Radar {formatDate(result.radarReflectorValidade)}
                  {result.diasRadarReflector !== null && result.diasRadarReflector < 0 ? " · expirado" : ""}
                </span>
              )}
              {result.cylinderDataProxTeste && (
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg border ${
                    result.diasProxTesteCilindro !== null && result.diasProxTesteCilindro < 0
                      ? "bg-red-50 border-red-200 text-red-700"
                      : "bg-white border-slate-200 text-slate-600"
                  }`}
                >
                  Cilindro: próx. teste {formatDate(result.cylinderDataProxTeste)}
                  {result.diasProxTesteCilindro !== null && result.diasProxTesteCilindro < 0 ? " · expirado" : ""}
                </span>
              )}
            </div>
          </section>
        )}

        <p className="text-[11px] text-slate-400 text-center">
          Orey Açores · Manutenção e inspeção de jangadas salva-vidas · Se tiver dúvidas, contacte a nossa oficina.
        </p>
      </main>
    </div>
  );
}
