"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type QualitySample = {
  id: number;
  label: string;
  meta?: string | null;
  href: string;
};

type QualityIssue = {
  key: string;
  title: string;
  description: string;
  severity: "critical" | "warning" | "info";
  count: number;
  href: string;
  samples: QualitySample[];
};

type DataQualityPayload = {
  summary: {
    totalOpen: number;
    criticalCount: number;
    warningCount: number;
    healthyCount: number;
  };
  issues: QualityIssue[];
};

function severityClasses(severity: QualityIssue["severity"]) {
  if (severity === "critical") return "border-rose-200 bg-rose-50 text-rose-800";
  if (severity === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export default function QualidadeDadosPage() {
  const [payload, setPayload] = useState<DataQualityPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const res = await fetch("/api/data-quality", { cache: "no-store" });
        const data = res.ok ? ((await res.json()) as DataQualityPayload) : null;
        if (!active) return;
        setPayload(data);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  const visibleIssues = useMemo(
    () => (payload?.issues || []).filter((issue) => issue.count > 0),
    [payload]
  );

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="ds-page space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-6 text-white shadow-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">Saúde de dados</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight">Painel de qualidade operacional</h1>
              <p className="mt-3 max-w-3xl text-sm text-slate-200">
                Onde a base de dados deixa trabalho por fechar: associações em falta, contactos ausentes e campos essenciais sem preenchimento.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <Link href="/" className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 hover:bg-white/15">Voltar ao dashboard</Link>
              <Link href="/alertas" className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 hover:bg-white/15">Abrir alertas</Link>
            </div>
          </div>
        </div>

        {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">A carregar saúde de dados...</div> : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Pendências abertas", value: payload?.summary.totalOpen ?? 0, tone: "border-slate-200 bg-white text-slate-900" },
            { label: "Frentes prioritárias", value: payload?.summary.criticalCount ?? 0, tone: "border-rose-200 bg-rose-50 text-rose-900" },
            { label: "Frentes de revisão", value: payload?.summary.warningCount ?? 0, tone: "border-amber-200 bg-amber-50 text-amber-900" },
            { label: "Checks sem desvios", value: payload?.summary.healthyCount ?? 0, tone: "border-emerald-200 bg-emerald-50 text-emerald-900" },
          ].map((card) => (
            <div key={card.label} className={`rounded-2xl border p-5 shadow-sm ${card.tone}`}>
              <p className="text-xs uppercase tracking-wide opacity-70">{card.label}</p>
              <p className="mt-2 text-3xl font-bold">{card.value}</p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Lista de frentes para limpar</h2>
              <p className="mt-1 text-sm text-slate-500">Cada cartão mostra a dimensão do problema e alguns exemplos já clicáveis.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {visibleIssues.length} categoria(s) com trabalho
            </span>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {visibleIssues.length === 0 ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-sm text-emerald-800">
                Sem desvios abertos neste painel. Não vou dizer “milagre”, mas anda perto.
              </div>
            ) : visibleIssues.map((issue) => (
              <div key={issue.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-900">{issue.title}</h3>
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${severityClasses(issue.severity)}`}>
                        {issue.severity === "critical" ? "prioritário" : issue.severity === "warning" ? "rever" : "info"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{issue.description}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold text-slate-900">{issue.count}</p>
                    <Link href={issue.href} className="text-xs font-semibold text-blue-700 underline underline-offset-2">Abrir módulo</Link>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {issue.samples.length > 0 ? issue.samples.map((sample) => (
                    <Link key={`${issue.key}-${sample.id}`} href={sample.href} className="block rounded-xl border border-white bg-white px-3 py-3 hover:border-slate-300 hover:shadow-sm">
                      <p className="text-sm font-semibold text-slate-900">{sample.label}</p>
                      <p className="mt-1 text-xs text-slate-500">{sample.meta || "Sem metadados adicionais"}</p>
                    </Link>
                  )) : (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-4 text-sm text-slate-500">
                      Sem exemplos recentes para mostrar, mas a contagem indica pendências nesta frente.
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}