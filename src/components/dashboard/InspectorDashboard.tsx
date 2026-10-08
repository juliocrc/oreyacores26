"use client";

import { useInspectorDashboard } from "@/hooks/useInspectorDashboard";
import { 
  AlertCircle, CheckCircle, Package, 
  ChevronRight, FileText, QrCode, Settings,
  Wrench, AlertTriangle, BadgePercent, ClipboardCheck
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function InspectorDashboard({ jangadaId }: { jangadaId?: number } = {}) {
  const { dashboardData, isLoading, error, refetch } = useInspectorDashboard(jangadaId);
  const router = useRouter();

  if (isLoading) return <DashboardSkeleton />;
  if (error) return <DashboardError onRetry={() => refetch()} />;
  if (!dashboardData) return <NoInspectionSelected onSelect={() => router.push("/jangadas")} />;

  const { currentInspection, progress, currentStep, pendingItems } = dashboardData;
  if (!currentInspection) return <NoInspectionSelected onSelect={() => router.push("/jangadas")} />;
  const j = currentInspection;
  const stepNames = [
    "Dados Gerais", "Checklist", "Componentes", "Equipamento (Pack)",
    "Cilindros", "Testes", "Boletins", "Orçamento", "Resumo Final",
    "Certificados", "Histórico"
  ];

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800/60">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold uppercase tracking-widest text-cyan-600 dark:text-cyan-400">
                INSPEÇÃO ATIVA
              </span>
              <BadgePercent className="w-5 h-5 text-cyan-600" />
              <span className="text-lg font-bold text-cyan-600">{progress}%</span>
            </div>
            <h1 className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-slate-50">
              {j.brand} {j.model}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 font-mono">
              Série: {j.serial} · {j.capacity} pax · Pack {j.packType}
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Navio: <span className="font-semibold text-slate-700 dark:text-slate-200">{j.shipName || j.linkedShipName || "—"}</span>
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Link
              href={`/jangadas/${j.id}`}
              className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition shadow-sm"
            >
              <ClipboardCheck size={18} /> Registar Vistoria
            </Link>
            <Link
              href={`/jangadas/${j.id}`}
              className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              <FileText size={18} /> Ver Ficha Completa
            </Link>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Passos da Inspeção</h3>
            <span className="text-sm text-slate-500">Passo {currentStep} de 11</span>
          </div>
          <div className="relative">
            <div className="absolute top-2 left-0 right-0 h-1 bg-slate-200 dark:bg-slate-700 rounded-full" />
            <div className="absolute top-2 left-0 h-1 bg-cyan-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
            <div className="relative flex items-center justify-between">
              {stepNames.map((name, i) => {
                const stepNum = i + 1;
                const isComplete = stepNum < currentStep;
                const isCurrent = stepNum === currentStep;
                const isPending = pendingItems.some(p => p.step === stepNum);
                return (
                  <div key={stepNum} className="flex flex-col items-center">
                    <div className={`
                      relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all
                      ${isComplete ? "bg-emerald-500 text-white" : isCurrent ? "bg-cyan-500 text-white" : "bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400"}
                      ${isPending && !isComplete && "ring-2 ring-amber-500"}
                    `}>
                      {isComplete ? <CheckCircle size={12} /> : stepNum}
                    </div>
                    <span className={`mt-1.5 text-[10px] text-center max-w-[70px] ${isCurrent ? "font-bold text-cyan-600" : "text-slate-500"}`}>
                      {name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Pending Items */}
      {pendingItems.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-800 dark:bg-amber-900/20">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <h3 className="font-semibold text-amber-800 dark:text-amber-200">Itens Pendentes ({pendingItems.length})</h3>
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                Complete estes itens para avançar na inspeção:
              </p>
              <ul className="mt-3 space-y-2">
                {pendingItems.map((item) => (
                  <li key={item.step} className="flex items-center gap-3 text-sm text-amber-700 dark:text-amber-300">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px] dark:bg-amber-800 dark:text-amber-100">
                      {item.step}
                    </span>
                    <span className="font-medium">{item.stepName}</span>
                    <ChevronRight className="w-3 h-3 text-amber-400" />
                    <span>{item.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          title="Dados Gerais"
          value={j.serial ? "✓" : "—"}
          icon={Package}
          color="blue"
          complete={!!j.serial}
        />
        <StatCard
          title="Pack Emergência"
          value={j.artigos?.length || 0}
          subtitle="artigos"
          icon={Package}
          color="purple"
          complete={j.artigos && j.artigos.length > 0}
        />
        <StatCard
          title="Cilindros"
          value={j.cylinderSerial ? "✓" : "—"}
          icon={Settings}
          color="orange"
          complete={!!j.cylinderSerial}
        />
        <StatCard
          title="Testes"
          value={(j.testeWP || j.testeNAP) ? "✓" : "—"}
          icon={Wrench}
          color="emerald"
          complete={!!(j.testeWP || j.testeNAP)}
        />
      </div>

      {/* Quick Actions */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800/60">
        <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Ações Rápidas</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <QuickAction
            icon={FileText}
            label="Gerar Certificado"
            color="emerald"
            onClick={() => router.push(`/jangadas/${j.id}?action=certificado`)}
          />
          <QuickAction
            icon={FileText}
            label="Gerar Quadro"
            color="blue"
            onClick={() => router.push(`/jangadas/${j.id}?action=quadro`)}
          />
          <QuickAction
            icon={QrCode}
            label="Etiqueta QR"
            color="indigo"
            onClick={() => router.push(`/jangadas/${j.id}?action=qr`)}
          />
          <QuickAction
            icon={AlertCircle}
            label="Ver Alertas"
            color="amber"
            onClick={() => router.push(`/alertas?jangada=${j.id}`)}
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle, icon: Icon, color, complete }: { 
  title: string; value: string | number; subtitle?: string; icon: React.ComponentType<{ className?: string }>; color: string; complete: boolean }) {
  const colors = {
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400",
    purple: "bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400",
    orange: "bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400",
  };
  return (
    <div className="rounded-xl border p-4 transition hover:border-cyan-500/40 dark:border-slate-700 dark:bg-slate-800/60">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-900 dark:text-slate-50">{value}</p>
          {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
        <div className={`p-2 rounded-xl ${colors[color as keyof typeof colors]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="mt-3 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${complete ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`} style={{ width: complete ? "100%" : "0%" }} />
      </div>
    </div>
  );
}

function QuickAction({ icon: Icon, label, color, onClick }: { 
  icon: React.ComponentType<{ className?: string }>; label: string; color: string; onClick: () => void }) {
  const colors = {
    emerald: "bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/30",
    blue: "bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30",
    indigo: "bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-400 dark:hover:bg-indigo-900/30",
    amber: "bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/30",
  };
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-2 px-4 py-3 rounded-xl border transition ${colors[color as keyof typeof colors]} dark:border-slate-700`}
    >
      <Icon className="w-5 h-5" />
      <span className="text-sm font-medium text-center">{label}</span>
    </button>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800/60 animate-pulse">
        <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-3/4 mb-4" />
        <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/2 mb-2" />
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[1,2,3,4].map(i => (
          <div key={i} className="rounded-xl border p-4 dark:border-slate-700 dark:bg-slate-800/60 animate-pulse">
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/2 mb-2" />
            <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/4" />
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20 text-center">
      <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
      <h3 className="font-semibold text-red-800 dark:text-red-200">Erro ao carregar dashboard</h3>
      <p className="mt-1 text-sm text-red-600 dark:text-red-400">Não foi possível obter os dados da inspeção.</p>
      <button onClick={onRetry} className="mt-4 px-4 py-2 rounded-lg font-medium text-white bg-red-600 hover:bg-red-700">
        Tentar Novamente
      </button>
    </div>
  );
}

function NoInspectionSelected({ onSelect }: { onSelect: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
      <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
      <h3 className="font-semibold text-slate-700 dark:text-slate-300">Nenhuma inspeção selecionada</h3>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Selecione uma jangada para ver o progresso da inspeção.</p>
      <button onClick={onSelect} className="mt-4 px-4 py-2 rounded-lg font-medium text-white bg-cyan-600 hover:bg-cyan-700">
        Ir para Jangadas
      </button>
    </div>
  );
}