"use client";

import { useManagerDashboard } from "@/hooks/useManagerDashboard";
import { useState } from "react";
import { 
  Ship, Package, AlertTriangle, 
  CheckCircle, Wrench, FileCheck,
  Plus, Calendar, User
} from "lucide-react";
import Link from "next/link";
import type { JangadaDashboard } from "@/types/dashboard";

const STATUS_CONFIG = {
  agendado: { label: "AGENDADO", color: "bg-blue-500", icon: Calendar, columns: ["agendada", "confirmada"] },
  em_inspecao: { label: "EM INSPEÇÃO", color: "bg-cyan-500", icon: Wrench, columns: ["em_inspecao", "em_andamento"] },
  aguardando_pecas: { label: "AGUARDA PEÇAS", color: "bg-amber-500", icon: Package, columns: ["aguardando_pecas"] },
  pronto: { label: "PRONTO", color: "bg-emerald-500", icon: CheckCircle, columns: ["pronta", "concluida"] },
  certificado: { label: "CERTIFICADO", color: "bg-indigo-500", icon: FileCheck, columns: ["certificado", "entregue"] },
} as const;

type KanbanColumnType = keyof typeof STATUS_CONFIG;

export function ManagerDashboard() {
  const { fleetSummary, kanbanColumns, isLoading, refetch } = useManagerDashboard();
  // Referência temporal estável, fixada na montagem (evita leituras impuras durante o render).
  const [now] = useState(() => Date.now());

  if (isLoading) return <KanbanSkeleton />;

  const columns: KanbanColumnType[] = ["agendado", "em_inspecao", "aguardando_pecas", "pronto", "certificado"];

  return (
    <div className="space-y-6">
      {/* KPIs Row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
        <KPICard title="Total Jangadas" value={fleetSummary.total} icon={Ship} color="blue" />
        <KPICard title="Em Inspeção" value={fleetSummary.emInspecao} icon={Wrench} color="cyan" />
        <KPICard title="Aguarda Peças" value={fleetSummary.aguardandoPecas} icon={Package} color="amber" />
        <KPICard title="Prontas" value={fleetSummary.prontas} icon={CheckCircle} color="emerald" />
        <KPICard title="Certificadas" value={fleetSummary.certificadas} icon={FileCheck} color="indigo" />
        <KPICard title="Próx. 7 dias" value={fleetSummary.upcomingNext7Days} icon={Calendar} color="purple" />
        <KPICard title="Cert. Vencidos" value={fleetSummary.overdueCerts} icon={AlertTriangle} color="red" alert={fleetSummary.overdueCerts > 0} />
      </div>

      {/* Métricas reais da agenda */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricTile
          label="Taxa de Conclusão"
          value={`${fleetSummary.completionRate}%`}
          hint="Eventos concluídos / total na agenda"
        />
        <MetricTile
          label="Duração Média"
          value={
            fleetSummary.averageDurationMinutes > 0
              ? `${Math.floor(fleetSummary.averageDurationMinutes / 60)}h${String(fleetSummary.averageDurationMinutes % 60).padStart(2, "0")}`
              : "—"
          }
          hint="Tempo reservado por inspeção"
        />
        <MetricTile
          label="Agendamentos Atrasados"
          value={String(fleetSummary.agendaOverdue)}
          hint="Agendamentos por realizar com data passada"
          alert={fleetSummary.agendaOverdue > 0}
        />
      </div>

      {/* Kanban Board */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800/60 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Pipeline de Inspeções</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => refetch()} className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600">
              Atualizar
            </button>
            <Link href="/agenda" className="px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700">
              Ver Calendário
            </Link>
          </div>
        </div>

        <div className="flex overflow-x-auto p-4 gap-4 min-h-[500px]">
          {columns.map((colKey) => {
            const config = STATUS_CONFIG[colKey];
            const column = kanbanColumns.find(c => c.id === colKey);
            const items = column?.items || [];
            
            return (
              <KanbanColumn 
                key={colKey} 
                config={config} 
                items={items} 
                count={items.length}
                now={now}
              />
            );
          })}
          
          {/* Add new column */}
          <div className="w-72 flex-shrink-0">
            <div className="rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 p-6 text-center hover:border-cyan-400 transition">
              <Plus className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Nova coluna</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Arrastar O.S. aqui</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KanbanColumn({ config, items, count, now }: { 
  config: typeof STATUS_CONFIG[keyof typeof STATUS_CONFIG]; 
  items: JangadaDashboard[]; 
  count: number;
  now: number;
}) {
  return (
    <div className="w-72 flex-shrink-0 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-8 rounded-l-xl ${config.color}`} />
          <div className="pl-2">
            <h3 className="font-bold text-slate-900 dark:text-slate-100">{config.label}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{count} items</p>
          </div>
        </div>
      </div>
      <div className="space-y-3 min-h-[400px] p-1 rounded-xl bg-slate-50/50 dark:bg-slate-900/20">
        {items.length === 0 ? (
          <div className="h-20 flex items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
            <p className="text-xs text-slate-400 dark:text-slate-500">Vazio</p>
          </div>
        ) : (
          items.map((item) => (
            <KanbanCard key={item.id} item={item} now={now} />
          ))
        )}
      </div>
    </div>
  );
}

function KanbanCard({ item, now }: { item: JangadaDashboard; now: number }) {
  const daysLeft = item.dataProxInspecao 
    ? Math.ceil((new Date(item.dataProxInspecao).getTime() - now) / 86400000)
    : null;

  return (
    <Link 
      href={`/jangadas/${item.id}`}
      className="block p-3 rounded-xl bg-white border border-slate-200 hover:border-cyan-400 hover:shadow-md transition dark:bg-slate-800 dark:border-slate-700"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-900 dark:text-slate-100 truncate">
            {item.brand} {item.model}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
            {item.serial}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-1">
            {item.shipName || item.linkedShipName || "Sem navio"}
          </p>
        </div>
        {daysLeft !== null && (
          <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${
            daysLeft < 0 ? "bg-red-100 text-red-700" :
            daysLeft <= 7 ? "bg-amber-100 text-amber-700" :
            daysLeft <= 30 ? "bg-blue-100 text-blue-700" :
            "bg-emerald-100 text-emerald-700"
          } dark:bg-red-900/30 dark:text-red-400`}>
            {daysLeft < 0 ? `${Math.abs(daysLeft)}d atraso` : `${daysLeft}d`}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        {item.ultimoCertificadoNumero && (
          <span className="flex items-center gap-1">
            <FileCheck className="w-3 h-3" />
            {item.ultimoCertificadoNumero}
          </span>
        )}
        {item.capacity && (
          <span className="flex items-center gap-1">
            <User className="w-3 h-3" />
            {item.capacity}P
          </span>
        )}
      </div>
    </Link>
  );
}

function KPICard({ title, value, icon: Icon, color, alert }: { 
  title: string; value: number; icon: React.ComponentType<{ className?: string }>; color: string; alert?: boolean }) {
  const colors = {
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400",
    cyan: "bg-cyan-50 text-cyan-600 dark:bg-cyan-900/20 dark:text-cyan-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400",
    indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400",
    purple: "bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400",
    red: "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400",
  };
  return (
    <div className={`rounded-xl border p-4 transition ${alert ? "border-red-300 dark:border-red-800" : "hover:border-cyan-500/40"} dark:border-slate-700 dark:bg-slate-800/60`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-900 dark:text-slate-50">{value}</p>
        </div>
        <div className={`p-2 rounded-xl ${colors[color as keyof typeof colors]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

function MetricTile({ label, value, hint, alert }: { 
  label: string; value: string; hint: string; alert?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 dark:bg-slate-800/60 ${
      alert ? "border-red-300 dark:border-red-800" : "border-slate-200 dark:border-slate-700"
    }`}>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-extrabold tabular-nums ${
        alert ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-slate-50"
      }`}>
        {value}
      </p>
      <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{hint}</p>
    </div>
  );
}

function KanbanSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
        {[1,2,3,4,5,6,7].map(i => (
          <div key={i} className="rounded-xl border p-4 animate-pulse dark:border-slate-700 dark:bg-slate-800/60">
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/2 mb-2" />
            <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/4" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/60 animate-pulse">
        <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-1/4 mb-4" />
        <div className="flex gap-4 overflow-x-auto">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="w-72 flex-shrink-0">
              <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded mb-3" />
              <div className="space-y-3">
                {[1,2].map(j => (
                  <div key={j} className="h-24 bg-slate-200 dark:bg-slate-700 rounded" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}