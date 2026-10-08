'use client';

import { useComplianceDashboard } from '@/hooks/useComplianceDashboard';
import {
  ShieldCheck,
  ShieldAlert,
  Package,
  FileCheck,
  Wrench,
  Radio,
  CalendarClock,
  ExternalLink,
  RefreshCw,
  Bell,
} from 'lucide-react';
import Link from 'next/link';

const SEVERITY_CONFIG = {
  high: {
    label: 'CRÍTICO',
    bg: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    border: 'border-red-200 dark:border-red-800',
  },
  medium: {
    label: 'ATENÇÃO',
    bg: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-800',
  },
  low: {
    label: 'INFO',
    bg: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-800',
  },
} as const;

export function ComplianceDashboard() {
  const { complianceRafts, stats, alerts, isLoading, refetch } = useComplianceDashboard();

  if (isLoading) return <ComplianceSkeleton />;

  return (
    <div className="space-y-6">
      {/* Compliance Status Header */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatusCard
          label="Válidos"
          value={stats.validos}
          total={stats.total}
          color="emerald"
          icon={ShieldCheck}
        />
        <StatusCard
          label="Vencem < 30d"
          value={stats.expirando}
          total={stats.total}
          color="amber"
          icon={CalendarClock}
        />
        <StatusCard
          label="Expirados"
          value={stats.expirados}
          total={stats.total}
          color="red"
          icon={ShieldAlert}
        />
        <StatusCard
          label="Boletins Pendentes"
          value={stats.serviceBulletinsPendentes}
          total={stats.total}
          color="blue"
          icon={FileCheck}
        />
      </div>

      {/* Compliance progress bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800/60">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            Estado de Conformidade da Frota
          </h2>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          >
            <RefreshCw size={13} /> Atualizar
          </button>
        </div>
        <div className="flex h-8 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700">
          {stats.validos > 0 && (
            <div
              className="bg-emerald-500 flex items-center justify-center text-white text-xs font-bold transition-all"
              style={{ width: `${(stats.validos / Math.max(stats.total, 1)) * 100}%` }}
            >
              {stats.validos > 2 &&
                `${Math.round((stats.validos / Math.max(stats.total, 1)) * 100)}%`}
            </div>
          )}
          {stats.expirando > 0 && (
            <div
              className="bg-amber-500 flex items-center justify-center text-white text-xs font-bold transition-all"
              style={{ width: `${(stats.expirando / Math.max(stats.total, 1)) * 100}%` }}
            >
              {stats.expirando > 2 && stats.expirando}
            </div>
          )}
          {stats.expirados > 0 && (
            <div
              className="bg-red-500 flex items-center justify-center text-white text-xs font-bold transition-all"
              style={{ width: `${(stats.expirados / Math.max(stats.total, 1)) * 100}%` }}
            >
              {stats.expirados > 2 && stats.expirados}
            </div>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> {stats.validos} válidos
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> {stats.expirando} vencem &lt;
            30d
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> {stats.expirados} expirados
          </span>
          <span className="ml-auto">{stats.total} jangadas no total</span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Alerts list */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800/60">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <h2 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-500" />
              Alertas de Conformidade
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold dark:bg-amber-900/30 dark:text-amber-300">
              {alerts.length}
            </span>
          </div>
          <div className="max-h-[500px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
            {alerts.length === 0 ? (
              <div className="p-8 text-center">
                <ShieldCheck className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Nenhum alerta. Frota 100% conforme.
                </p>
              </div>
            ) : (
              alerts.map((alert, i) => {
                const config = SEVERITY_CONFIG[alert.severity];
                return (
                  <Link
                    key={i}
                    href={`/jangadas/${alert.raftId}`}
                    className={`flex items-start gap-3 p-3.5 hover:bg-slate-50 transition dark:hover:bg-slate-700/40 border-l-2 ${config.border}`}
                  >
                    <span
                      className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold ${config.bg}`}
                    >
                      {config.label}
                    </span>
                    <span className="flex-1 text-sm text-slate-700 dark:text-slate-200">
                      {alert.message}
                    </span>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  </Link>
                );
              })
            )}
          </div>
        </div>

        {/* Compliance table */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800/60">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <h2 className="font-bold text-slate-900 dark:text-slate-100">
              Fleet Compliance Timeline
            </h2>
          </div>
          <div className="max-h-[500px] overflow-y-auto">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-700/50 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold">Jangada</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Próx. Insp.</th>
                    <th className="px-3 py-2.5 text-center font-semibold">Estado</th>
                    <th className="px-3 py-2.5 text-center font-semibold">Boletins</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {complianceRafts
                    .slice()
                    .sort((a, b) => a.diasParaExpirar - b.diasParaExpirar)
                    .map(raft => (
                      <tr key={raft.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                        <td className="px-4 py-2.5">
                          <Link href={`/jangadas/${raft.id}`} className="block group">
                            <span className="font-semibold text-slate-800 dark:text-slate-100 group-hover:text-cyan-600">
                              {raft.model}
                            </span>
                            <span className="block text-xs font-mono text-slate-500 dark:text-slate-400">
                              {raft.serial}
                            </span>
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 text-xs tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {raft.dataProxInspecao || '—'}
                          {raft.diasParaExpirar !== -999 && (
                            <span className="block text-[10px] text-slate-400">
                              {raft.diasParaExpirar < 0
                                ? `${Math.abs(raft.diasParaExpirar)}d em atraso`
                                : `${raft.diasParaExpirar}d restantes`}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <StatusBadge status={raft.status} dias={raft.diasParaExpirar} />
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {raft.applicableServiceBulletinsCount > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold dark:bg-amber-900/30 dark:text-amber-300">
                              {raft.applicableServiceBulletinsCount}
                            </span>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-600">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Secondary compliance metrics */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MiniStat
          icon={Radio}
          label="HRU Vencendo < 30d"
          value={stats.hruExpirando}
          alert={stats.hruExpirando > 0}
        />
        <MiniStat
          icon={Wrench}
          label="Cilindro Teste < 60d"
          value={stats.cylinderTesteExpirando}
          alert={stats.cylinderTesteExpirando > 0}
        />
        <MiniStat
          icon={Package}
          label="Stock Vencido"
          value={stats.artigosVencidos}
          alert={stats.artigosVencidos > 0}
        />
        <MiniStat
          icon={Package}
          label="Stock Vence < 30d"
          value={stats.artigosExpirando30}
          alert={stats.artigosExpirando30 > 0}
        />
      </div>
    </div>
  );
}

function StatusCard({
  label,
  value,
  total,
  color,
  icon: Icon,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const colors = {
    emerald: {
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
      text: 'text-emerald-600 dark:text-emerald-400',
      bar: 'bg-emerald-500',
    },
    amber: {
      bg: 'bg-amber-50 dark:bg-amber-900/20',
      text: 'text-amber-600 dark:text-amber-400',
      bar: 'bg-amber-500',
    },
    red: {
      bg: 'bg-red-50 dark:bg-red-900/20',
      text: 'text-red-600 dark:text-red-400',
      bar: 'bg-red-500',
    },
    blue: {
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      text: 'text-blue-600 dark:text-blue-400',
      bar: 'bg-blue-500',
    },
  };
  const c = colors[color as keyof typeof colors];
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div
      className={`rounded-2xl border border-slate-200 dark:border-slate-700 p-5 ${c.bg} dark:bg-opacity-20`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            {label}
          </p>
          <p className="mt-1 text-3xl font-extrabold tabular-nums text-slate-900 dark:text-slate-50">
            {value}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">de {total} jangadas</p>
        </div>
        <div className={`p-2.5 rounded-xl bg-white/60 dark:bg-slate-800/40 ${c.text}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
      <div className="mt-3 h-1.5 bg-white/50 dark:bg-slate-800/50 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  dias,
}: {
  status: 'valido' | 'expirando' | 'expirado';
  dias: number;
}) {
  if (status === 'expirado') {
    return (
      <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold dark:bg-red-900/30 dark:text-red-300">
        EXPIRADO
      </span>
    );
  }
  if (status === 'expirando') {
    return (
      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold dark:bg-amber-900/30 dark:text-amber-300">
        {dias}d
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold dark:bg-emerald-900/30 dark:text-emerald-300">
      OK
    </span>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  alert,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${alert ? 'border-red-300 dark:border-red-800' : 'border-slate-200 dark:border-slate-700'} bg-white dark:bg-slate-800/60`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`p-2 rounded-lg ${alert ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}
        >
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">
            {label}
          </p>
          <p className="text-xl font-extrabold tabular-nums text-slate-900 dark:text-slate-50">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

function ComplianceSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[1, 2, 3, 4].map(i => (
          <div
            key={i}
            className="rounded-2xl border p-5 animate-pulse dark:border-slate-700 dark:bg-slate-800/60"
          >
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/2 mb-2" />
            <div className="h-9 bg-slate-200 dark:bg-slate-700 rounded w-1/4" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border p-5 animate-pulse dark:border-slate-700 dark:bg-slate-800/60">
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/4 mb-4" />
        <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border p-4 animate-pulse dark:border-slate-700 dark:bg-slate-800/60">
          <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mb-4" />
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-12 bg-slate-200 dark:bg-slate-700 rounded" />
            ))}
          </div>
        </div>
        <div className="rounded-2xl border p-4 animate-pulse dark:border-slate-700 dark:bg-slate-800/60">
          <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mb-4" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-10 bg-slate-200 dark:bg-slate-700 rounded" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
