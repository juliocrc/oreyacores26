// src/components/coletes/ColetorPremiumDossier.tsx
"use client";

import Link from "next/link";
import React from "react";

type HealthTone = {
  ring: string;
  text: string;
  badge: string;
  label: string;
};

type BreakdownItem = {
  label: string;
  value: number;
  hint: string;
  kind: "critical" | "attention" | "documents" | "coverage";
};

type SpotlightCard = {
  title: string;
  value: string;
  description: string;
  kind: "critical" | "attention" | "documents" | "coverage";
};

type CategoryScore = {
  label: string;
  score: number;
  detail: string;
};

type FocusAction = {
  title: string;
  detail: string;
  cta: string;
  onClick: () => void;
};

type QuickAction = {
  key: string;
  label: string;
  onClick: () => void;
  className: string;
};

type TimelineItem = {
  id: string;
  title: string;
  date?: string;
  detail?: string;
  kind: "inspecao" | "certificado" | "evidencia" | "operacao" | "dados";
  href?: string;
  badge?: string;
};

type CertificateDocument = {
  id: string | number;
  fileName?: string;
  sourceYear?: number;
  dataInspecao?: string;
  dataProxInspecao?: string;
};

type EvidenceDocument = {
  name: string;
  originalName?: string;
  size?: number;
  uploadedAt?: string;
  url: string;
};

type DeadlineItem = {
  key: string;
  label: string;
  displayValue: string;
  description: string;
  days: number | null;
};

type Recommendation = {
  key: string;
  title: string;
  description: string;
  tone: string;
  actionLabel: string;
  onAction: () => void;
};

type SummaryCard = {
  label: string;
  value: string;
  hint: string;
  tone: string;
};

type DeadlineTone = {
  badge: string;
  className: string;
};

type Props = {
  dossierCounts: { overdue: number; dueSoon: number };
  dossierSummaryCards: readonly SummaryCard[];
  coleteHealthTone: HealthTone;
  coleteHealthScore: number;
  coleteHealthStrokeOffset: number;
  coleteHealthBreakdown: BreakdownItem[];
  coleteSpotlightCards: SpotlightCard[];
  coleteCategoryScores: CategoryScore[];
  coleteNextFocusActions: FocusAction[];
  dossierQuickActions: readonly QuickAction[];
  coleteHref?: string | null;
  dossierTimeline: TimelineItem[];
  certificateDocuments: CertificateDocument[];
  certificadoPreferencialId?: string | number | null;
  evidenceDocuments: EvidenceDocument[];
  dossierDeadlines: DeadlineItem[];
  phase3Recommendations: Recommendation[];
  recommendedNextInspection?: string;
  inspectionCycleLabel: string;
  formatDatePt: (value?: string) => string;
  formatFileSize: (value?: number) => string;
  getDeadlineTone: (days: number | null) => DeadlineTone;
  scrollToDossierBlock: (id: string) => void;
  onOpenEvidencias: () => void;
  onOpenHistorico: () => void;
};

function getPremiumCardTone(kind: "critical" | "attention" | "documents" | "coverage") {
  switch (kind) {
    case "critical":
      return "border-rose-200 bg-rose-50 text-rose-900";
    case "attention":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "documents":
      return "border-violet-200 bg-violet-50 text-violet-900";
    case "coverage":
    default:
      return "border-sky-200 bg-sky-50 text-sky-900";
  }
}

function getPremiumCategoryScoreTone(score: number) {
  if (score >= 85) return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (score >= 65) return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-rose-200 bg-rose-50 text-rose-900";
}

const ColetorPremiumDossierNoMemo = function ColetorPremiumDossier({
  dossierCounts,
  dossierSummaryCards,
  coleteHealthTone,
  coleteHealthScore,
  coleteHealthStrokeOffset,
  coleteHealthBreakdown,
  coleteSpotlightCards,
  coleteCategoryScores,
  coleteNextFocusActions,
  dossierQuickActions,
  coleteHref,
  dossierTimeline,
  certificateDocuments,
  certificadoPreferencialId,
  evidenceDocuments,
  dossierDeadlines,
  phase3Recommendations,
  recommendedNextInspection,
  formatDatePt,
  formatFileSize,
  getDeadlineTone,
  onOpenEvidencias,
  onOpenHistorico,
}: Props) {
  return (
    <>
      <div className="mb-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm" id="section-dossier-overview">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Dossiê digital do colete</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">Resumo 360º operacional</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Estado da ficha, prazos, documentos e histórico recente — tudo junto no mesmo cockpit, sem caça ao tesouro. 🦺
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${dossierCounts.overdue > 0 ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
              {dossierCounts.overdue > 0 ? `${dossierCounts.overdue} prazo(s) atrasado(s)` : "Sem atrasos"}
            </span>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${dossierCounts.dueSoon > 0 ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
              {dossierCounts.dueSoon > 0 ? `${dossierCounts.dueSoon} a vencer em 30 dias` : "Sem vencimentos imediatos"}
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {dossierSummaryCards.map((card) => (
            <div key={card.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">{card.label}</p>
              <p className={`mt-1 text-2xl font-bold ${card.tone}`}>{card.value}</p>
              <p className="mt-1 text-xs text-slate-600">{card.hint}</p>
            </div>
          ))}
        </div>

        {/* Health Score */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm mt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Health score do colete</h3>
              <p className="mt-1 text-xs text-slate-500">Leitura instantânea do equilíbrio técnico, documental e operacional.</p>
            </div>
            <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold ${coleteHealthTone.badge}`}>
              {coleteHealthTone.label}
            </span>
          </div>
          <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-center">
            <div className="relative mx-auto h-36 w-36 lg:mx-0">
              <svg viewBox="0 0 120 120" className="h-36 w-36 -rotate-90">
                <circle cx="60" cy="60" r="45" className="fill-none stroke-slate-200" strokeWidth="10" />
                <circle cx="60" cy="60" r="45" className={`fill-none ${coleteHealthTone.ring}`} strokeWidth="10" strokeLinecap="round" strokeDasharray="282.743" strokeDashoffset={coleteHealthStrokeOffset} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className={`text-4xl font-extrabold ${coleteHealthTone.text}`}>{coleteHealthScore}</span>
                <span className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">score</span>
              </div>
            </div>
            <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
              {coleteHealthBreakdown.map((item) => (
                <div key={item.label} className={`rounded-2xl border p-3 ${getPremiumCardTone(item.kind)}`}>
                  <div className="text-[11px] uppercase tracking-wide opacity-70">{item.label}</div>
                  <div className="mt-2 text-2xl font-bold">{item.value}</div>
                  <div className="mt-1 text-xs opacity-90">{item.hint}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Spotlight */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Radar premium da ficha</h3>
              <p className="mt-1 text-xs text-slate-500">Resumo executivo do que merece olhos primeiro.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-700">cockpit rápido</span>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
            {coleteSpotlightCards.map((card) => (
              <div key={card.title} className={`rounded-2xl border p-4 ${getPremiumCardTone(card.kind)}`}>
                <div className="text-[11px] uppercase tracking-wide opacity-70">{card.title}</div>
                <div className="mt-2 text-2xl font-bold">{card.value}</div>
                <div className="mt-2 text-xs opacity-90">{card.description}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Próximos focos</div>
            <div className="mt-3 space-y-3">
              {coleteNextFocusActions.length > 0 ? coleteNextFocusActions.map((action, index) => (
                <div key={`${action.title}-${index}`} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{action.title}</div>
                    <div className="mt-1 text-xs text-slate-600">{action.detail}</div>
                  </div>
                  <button type="button" onClick={action.onClick} className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100">
                    {action.cta}
                  </button>
                </div>
              )) : (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
                  Sem focos quentes neste momento — boa altura para manutenção preventiva e arrumação fina do dossiê.
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Category Scores */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Scores por categoria</h3>
              <p className="mt-1 text-xs text-slate-500">A ficha repartida em frentes operacionais para perceber onde apertar primeiro.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-700">leitura tática</span>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {coleteCategoryScores.map((item) => (
              <div key={item.label} className={`rounded-2xl border p-4 ${getPremiumCategoryScoreTone(item.score)}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide opacity-70">{item.label}</div>
                    <div className="mt-2 text-3xl font-extrabold">{item.score}</div>
                  </div>
                  <span className="rounded-full border border-current/15 px-2 py-0.5 text-[11px] font-semibold">/100</span>
                </div>
                <div className="mt-2 text-xs opacity-90">{item.detail}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Quick actions */}
        <div className="mt-4 flex flex-wrap gap-2">
          {dossierQuickActions.map((action) => (
            <button key={action.key} type="button" onClick={action.onClick} className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${action.className}`}>
              {action.label}
            </button>
          ))}
          {coleteHref ? (
            <Link href={coleteHref} className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-800 transition hover:bg-indigo-100">
              Abrir colete associado
            </Link>
          ) : null}
        </div>

        {/* Timeline */}
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div id="section-dossier-timeline" className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Timeline / histórico unificado</h3>
                <p className="mt-1 text-xs text-slate-500">Inspeções, certificados, fila operacional e evidências recentes.</p>
              </div>
              <button type="button" onClick={onOpenHistorico} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50">
                Histórico completo
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {dossierTimeline.length > 0 ? dossierTimeline.map((item) => {
                const kindClasses = item.kind === 'inspecao'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : item.kind === 'certificado'
                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                    : item.kind === 'evidencia'
                      ? 'border-cyan-200 bg-cyan-50 text-cyan-700'
                      : item.kind === 'operacao'
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : 'border-slate-200 bg-slate-50 text-slate-700';
                return (
                  <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                          {item.badge ? (<span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${kindClasses}`}>{item.badge}</span>) : null}
                        </div>
                        <p className="mt-1 text-xs text-slate-600">{item.detail || 'Sem detalhe adicional.'}</p>
                      </div>
                      <div className="text-right text-xs text-slate-500">
                        <p>{item.date ? formatDatePt(item.date) : '—'}</p>
                        {item.href ? (<a href={item.href} target="_blank" rel="noreferrer" className="mt-1 inline-flex font-medium text-cyan-700 hover:text-cyan-800">Abrir</a>) : null}
                      </div>
                    </div>
                  </div>
                );
              }) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                  Ainda não há eventos suficientes para compor a timeline deste colete.
                </div>
              )}
            </div>
          </div>

          {/* Documents */}
          <div className="space-y-4" id="section-dossier-docs">
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Documentos & certificados</h3>
                  <p className="mt-1 text-xs text-slate-500">Certificados associados à ficha e evidências multimédia recentes.</p>
                </div>
                <button type="button" onClick={onOpenEvidencias} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50">Ver separador</button>
              </div>
              <div className="mt-4 space-y-3">
                {certificateDocuments.length > 0 ? certificateDocuments.map((cert) => (
                  <div key={`cert-${String(cert.id)}`} className="rounded-2xl border border-blue-100 bg-blue-50 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{cert.fileName || `Certificado de inspeção${cert.sourceYear ? ` ${cert.sourceYear}` : ''}`}</p>
                        <p className="mt-1 text-xs text-slate-600">
                          {cert.dataInspecao ? `Inspeção ${formatDatePt(cert.dataInspecao)}` : 'Sem data de inspeção'}
                          {cert.dataProxInspecao ? ` · Próxima ${formatDatePt(cert.dataProxInspecao)}` : ''}
                        </p>
                      </div>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${String(cert.id) === String(certificadoPreferencialId ?? '') ? 'border-blue-200 bg-white text-blue-700' : 'border-slate-200 bg-white text-slate-600'}`}>
                        {String(cert.id) === String(certificadoPreferencialId ?? '') ? 'Ativo' : `Ano ${String(cert.sourceYear || '—')}`}
                      </span>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">Sem certificados extraídos associados a este colete.</div>
                )}
                {evidenceDocuments.length > 0 ? evidenceDocuments.map((file) => (
                  <a key={`evidence-${file.name}`} href={file.url} target="_blank" rel="noreferrer" className="block rounded-2xl border border-cyan-100 bg-cyan-50 p-3 transition hover:bg-cyan-100">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{file.originalName || file.name}</p>
                        <p className="mt-1 text-xs text-slate-600">{file.uploadedAt ? `Carregado em ${formatDatePt(file.uploadedAt)}` : 'Sem data de upload'} · {formatFileSize(file.size)}</p>
                      </div>
                      <span className="rounded-full border border-cyan-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-cyan-700">Abrir</span>
                    </div>
                  </a>
                )) : null}
              </div>
            </div>

            {/* Deadlines */}
            <div className="rounded-2xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Prazos monitorizados</h3>
              <div className="mt-3 space-y-3">
                {dossierDeadlines.map((item) => {
                  const tone = getDeadlineTone(item.days);
                  return (
                    <div key={item.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                          <p className="mt-1 text-xs text-slate-600">{item.description}</p>
                        </div>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone.className}`}>{tone.badge}</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-700">{item.displayValue}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Recommendations */}
        <div className="mt-4">
          {phase3Recommendations.length > 0 ? (
            <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-4">
              {phase3Recommendations.map((item) => (
                <div key={item.key} className={`rounded-2xl border p-4 ${item.tone}`}>
                  <div className="text-[11px] uppercase tracking-wide opacity-70">Alerta preditivo</div>
                  <h3 className="mt-1 text-sm font-semibold">{item.title}</h3>
                  <p className="mt-2 text-xs opacity-90">{item.description}</p>
                  <button type="button" onClick={item.onAction} className="mt-4 rounded-xl border border-current/20 bg-white/80 px-3 py-2 text-xs font-semibold transition hover:bg-white">
                    {item.actionLabel}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">Sem sinais fortes de escalada neste momento — a ficha está alinhada com a regra da próxima inspeção e com boa margem operacional. ✨</div>
          )}
        </div>

        {/* Next inspection */}
        {recommendedNextInspection ? (
          <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            <p className="text-xs uppercase tracking-wide text-sky-700">Próxima inspeção recomendada</p>
            <p className="mt-1 text-lg font-bold">{formatDatePt(recommendedNextInspection)}</p>
          </div>
        ) : null}
      </div>
    </>
  );
}
export const ColetorPremiumDossier = React.memo(ColetorPremiumDossierNoMemo);
