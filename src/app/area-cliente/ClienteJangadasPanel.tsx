"use client";

import { useMemo } from "react";
import { Anchor, Clock, FileCheck2, Ship } from "lucide-react";

type WorkflowStatus = {
  state: "SEM_ESTADO" | "RECEIONADA" | "EM_INSPECAO" | "FINALIZADA" | "OUTRO";
  label: string;
  dataHora?: string | null;
  queueStatus?: string | null;
};

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
  workflowStatus?: WorkflowStatus;
};

type Navio = { id: number; nome: string; matricula?: string; ilha?: string; tipoPesca?: string };

function formatDate(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short" }).format(d);
  } catch {
    return d.toLocaleString("pt-PT");
  }
}

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

export default function ClienteJangadasPanel({ navios, jangadas }: { navios: Navio[]; jangadas: Jangada[] }) {
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
              {group.items.map((j) => {
                const gs = determineGlobalState(j);
                const wfDataHora = formatDate(gs.dataHora || j.workflowStatus?.dataHora);
                return (
                  <div key={j.id} className="rounded-2xl border border-slate-200 p-4 sm:p-5 transition hover:border-indigo-300 hover:bg-slate-50/40">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-extrabold text-slate-800">
                          {j.brand} {j.model} · <span className="font-mono text-slate-700">{j.serial}</span>
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Capacidade: {j.capacity} · {j.navioNome || "—"}
                          {j.ultimoCertificadoNumero && <span className="ml-2">· Cert: {j.ultimoCertificadoNumero}</span>}
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
                        <p className="mt-1 text-sm font-semibold text-slate-800">{formatDate(j.dataInspecao) || "—"}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="flex items-center gap-1 text-xs font-bold text-slate-500">
                          <Clock size={12} /> Próxima inspeção
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">{formatDate(j.dataProxInspecao) || "—"}</p>
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
                      <div className="mt-3 flex justify-end">
                        <a href={j.certificadoPdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-white">
                          <FileCheck2 size={14} /> Ver certificado PDF
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
