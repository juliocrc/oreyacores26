"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { CalendarClock, ClipboardList, PackageSearch, Wrench } from "lucide-react";
import { parseFlexibleDateValue, formatDateDisplay } from "@/lib/date-display";

type AgendaEvento = {
  id: string | number;
  title: string;
  date: string;
  raftSerial?: string;
  responsavel?: string;
  status?: string;
  type?: string;
  durationMinutes?: number;
};

type OtAlert = {
  id: string;
  ordemServicoId: number;
  numeroOrdem: string;
  severity: "info" | "warning" | "critical";
  type: string;
  title: string;
  description: string;
  recommendation: string;
  href: string;
  status: string;
  prioridade: string;
  tecnicoResponsavel: string | null;
  clienteNome: string | null;
  jangadaSerial: string | null;
  plannedEnd: string | null;
};

type JangadaSimples = {
  id: number;
  serial: string;
  artigos?: Array<{ id: number; name: string; validade?: string | null }>;
};

const HORIZONTES = [7, 14, 30, 60] as const;
const HORIZONTE_KEY = "tarefas-dia-horizonte";

function diasAte(d: Date): number {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
  return Math.round((d.getTime() - inicio) / 86400000);
}

function validadeChip(dias: number): string {
  if (dias <= 7) return "border-red-200 bg-red-50 text-red-700";
  if (dias <= 14) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-sky-200 bg-sky-50 text-sky-700";
}

const statusChip: Record<string, string> = {
  scheduled: "bg-indigo-50 border-indigo-200 text-indigo-700",
  confirmed: "bg-sky-50 border-sky-200 text-sky-700",
  in_progress: "bg-amber-50 border-amber-200 text-amber-700",
  testing: "bg-purple-50 border-purple-200 text-purple-700",
  completed: "bg-emerald-50 border-emerald-200 text-emerald-700",
  cancelled: "bg-rose-50 border-rose-200 text-rose-700",
  no_show: "bg-slate-100 border-slate-200 text-slate-600",
  paused: "bg-orange-50 border-orange-200 text-orange-700",
};

function chipFor(status?: string): string {
  const s = String(status || "").trim().toLowerCase();
  return statusChip[s] || "bg-slate-100 border-slate-200 text-slate-600";
}

function severityChip(severity?: string) {
  if (severity === "critical") return "bg-red-50 border-red-200 text-red-700";
  if (severity === "warning") return "bg-amber-50 border-amber-200 text-amber-700";
  return "bg-sky-50 border-sky-200 text-sky-700";
}

function horaDe(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function TarefasDoDiaPanel() {
  const { data: session } = useSession();
  const [agenda, setAgenda] = useState<AgendaEvento[]>([]);
  const [otAlerts, setOtAlerts] = useState<OtAlert[]>([]);
  const [jangadas, setJangadas] = useState<JangadaSimples[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(false);
  const [horizonte, setHorizonte] = useState<number>(() => {
    const stored = Number(window.localStorage.getItem(HORIZONTE_KEY));
    return HORIZONTES.includes(stored as (typeof HORIZONTES)[number]) ? stored : 14;
  });

  const tecnico = session?.user?.name || "";

  useEffect(() => {
    let alive = true;
    const urls = [`/api/agenda`, `/api/ordens-servico/alertas${tecnico ? `?tecnico=${encodeURIComponent(tecnico)}` : ""}`, `/api/jangadas?scope=all`];
    Promise.all(urls.map((u) => fetch(u)))
      .then(async (res) => {
        if (!alive) return;
        const parsed = await Promise.all(res.map((r) => r.ok ? r.json() : []));
        setAgenda(Array.isArray(parsed[0]) ? parsed[0] : []);
        setOtAlerts(Array.isArray(parsed[1]) ? parsed[1] : []);
        setJangadas(Array.isArray(parsed[2]) ? parsed[2] : []);
      })
      .catch(() => {
        if (alive) setErro(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [tecnico]);

  const hoje = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toDateString();
  }, []);

  const dados = useMemo(() => {
    const eventosHoje = agenda
      .filter((ev) => new Date(ev.date).toDateString() === hoje)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 8);

    const limit = new Date();
    limit.setDate(limit.getDate() + horizonte);
    const inicio = new Date();
    inicio.setHours(0, 0, 0, 0);

    const validades = jangadas
      .flatMap((j) => (j.artigos || []).map((a) => ({ j, a })))
      .map(({ j, a }) => {
        const d = parseFlexibleDateValue(a.validade);
        return d ? { j, a, d } : null;
      })
      .filter((x): x is { j: JangadaSimples; a: { id: number; name: string; validade?: string | null }; d: Date } => {
        if (!x) return false;
        return x.d.getTime() >= inicio.getTime() && x.d.getTime() <= limit.getTime();
      })
      .sort((a, b) => a.d.getTime() - b.d.getTime())
      .slice(0, 10);

    return { eventosHoje, otAlerts: otAlerts.slice(0, 8), validades };
  }, [agenda, hoje, otAlerts, jangadas, horizonte]);

  const total = dados.eventosHoje.length + dados.otAlerts.length + dados.validades.length;
  const dataLabel = new Date().toLocaleDateString("pt-PT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-md">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <span className="p-2 rounded-xl bg-indigo-100 border border-indigo-200 text-indigo-700">
              <ClipboardList className="h-5 w-5" />
            </span>
            O meu dia
          </h3>
          <p className="text-sm text-slate-500 capitalize">
            {dataLabel}{tecnico ? ` · ${tecnico}` : ""}
          </p>
        </div>
        {!loading && !erro && (
          <span className="rounded-xl bg-slate-100 border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">
            {total} tarefa{total === 1 ? "" : "s"}
          </span>
        )}
        {!loading && !erro && (
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
            Horizonte
            <select
              value={horizonte}
              onChange={(e) => {
                const v = Number(e.target.value);
                setHorizonte(v);
                window.localStorage.setItem(HORIZONTE_KEY, String(v));
              }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-slate-400"
            >
              {HORIZONTES.map((h) => (
                <option key={h} value={h}>{h} dias</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {loading ? (
        <div className="h-32 flex items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 animate-pulse">
          <p className="text-sm text-slate-500 font-semibold">A carregar o dia...</p>
        </div>
      ) : erro ? (
        <div className="h-32 flex items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50">
          <p className="text-sm text-slate-500 font-semibold">Não foi possível carregar os dados.</p>
        </div>
      ) : total === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4">
          <ClipboardList className="h-6 w-6 text-emerald-500 shrink-0" />
          <p className="text-sm font-extrabold text-emerald-800">Sem tarefas pendentes para hoje.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <section className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
            <h4 className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500">
              <CalendarClock className="h-4 w-4" /> Agenda de hoje
            </h4>
            <div className="space-y-2">
              {dados.eventosHoje.length === 0 && (
                <p className="text-xs font-medium text-slate-400">Sem eventos agendados.</p>
              )}
              {dados.eventosHoje.map((ev) => (
                <Link key={String(ev.id)} href="/agenda" className="block rounded-xl bg-white border border-slate-200 px-3 py-2 hover:border-indigo-200 hover:bg-indigo-50/40 transition">
                  <span className="flex items-center gap-2 text-xs font-extrabold text-slate-800">
                    <span className="font-mono text-indigo-600">{horaDe(ev.date)}</span>
                    <span className="truncate">{ev.title}</span>
                  </span>
                  <span className="mt-1 flex items-center gap-2">
                    {ev.raftSerial && <span className="font-mono text-[10px] font-semibold text-slate-500">{ev.raftSerial}</span>}
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${chipFor(ev.status)}`}>{ev.status || "—"}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
            <h4 className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500">
              <Wrench className="h-4 w-4" /> Ordens de serviço
            </h4>
            <div className="space-y-2">
              {dados.otAlerts.length === 0 && (
                <p className="text-xs font-medium text-slate-400">Sem ordens pendentes.</p>
              )}
              {dados.otAlerts.map((ot) => (
                <Link key={ot.id} href={ot.href} className="block rounded-xl bg-white border border-slate-200 px-3 py-2 hover:border-indigo-200 hover:bg-indigo-50/40 transition">
                  <span className="flex items-center gap-2 text-xs font-extrabold text-slate-800">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${severityChip(ot.severity)}`}>{ot.type === "delayed" ? "Atrasada" : ot.type === "running_too_long" ? "Demora" : "Stock"}</span>
                    <span className="truncate">OT {ot.numeroOrdem}</span>
                  </span>
                  <span className="mt-1 block truncate text-[11px] font-medium text-slate-500">
                    {[ot.clienteNome, ot.jangadaSerial, ot.prioridade].filter(Boolean).join(" · ")}
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
            <h4 className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500">
              <PackageSearch className="h-4 w-4" /> Validades ≤{horizonte} dias
            </h4>
            <div className="space-y-2">
              {dados.validades.length === 0 && (
                <p className="text-xs font-medium text-slate-400">Nada a vencer nos próximos {horizonte} dias.</p>
              )}
              {dados.validades.map(({ j, a, d }) => (
                <Link key={`${j.id}-${a.id}`} href="/jangadas" className="block rounded-xl bg-white border border-slate-200 px-3 py-2 hover:border-amber-200 hover:bg-amber-50/40 transition">
                  <span className="flex items-center gap-2 text-xs font-extrabold text-slate-800">
                    <span className="truncate">{a.name}</span>
                  </span>
                  <span className="mt-1 flex items-center justify-between text-[10px] font-semibold">
                    <span className="font-mono text-slate-500">{j.serial}</span>
                    <span className={`rounded-full border px-2 py-0.5 font-bold ${validadeChip(diasAte(d))}`}>{formatDateDisplay(String(d))}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}