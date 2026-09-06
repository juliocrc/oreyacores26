"use client";
import React, { useMemo } from 'react';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import { ShieldCheck, FileText, CheckCircle2, Clock, AlertTriangle, Landmark, ClipboardCheck } from 'lucide-react';
import type { InspectionData } from './types';

const STATUS_OPTIONS = [
  { value: 'POR_APLICAR', label: 'Por Aplicar', icon: Clock, color: 'text-amber-600 bg-amber-50 hover:bg-amber-100 border-amber-200' },
  { value: 'EM_VERIFICACAO', label: 'Em Verificação', icon: ClipboardCheck, color: 'text-blue-600 bg-blue-50 hover:bg-blue-100 border-blue-200' },
  { value: 'APLICADO', label: 'Aplicado', icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border-emerald-200' },
];

function setBulletinStatus(
  inspectionData: InspectionData,
  setInspectionData: (data: Partial<InspectionData>) => void,
  bulletinId: string,
  status: string,
) {
  const current = inspectionData.serviceBulletinsApplied || {};
  const next = { ...current, [bulletinId]: status as typeof current[string] };
  setInspectionData({ serviceBulletinsApplied: next });
}

export default function Step6C_BoletinsServico() {
  const { inspectionData, setInspectionData } = useJangadaWizardStore();

  const bulletins = inspectionData.applicableServiceBulletins || [];
  const applied = inspectionData.serviceBulletinsApplied || {};

  const stats = useMemo(() => {
    const aplicados = Object.values(applied).filter((v) => v === 'APLICADO').length;
    const emVerificacao = Object.values(applied).filter((v) => v === 'EM_VERIFICACAO').length;
    const porAplicar = bulletins.length - aplicados - emVerificacao;
    return { aplicados, emVerificacao, porAplicar: Math.max(porAplicar, 0) };
  }, [applied, bulletins]);

  const markAllApplied = () => {
    const next: Record<string, "APLICADO" | "EM_VERIFICACAO" | "POR_APLICAR"> = { ...applied };
    for (const b of bulletins) next[b.id] = 'APLICADO';
    setInspectionData({ serviceBulletinsApplied: next });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">6-b. Boletins de Serviço</h2>
        <p className="text-slate-600 mt-1">
          Aplicação dos boletins de serviço aplicáveis à marca e modelo da jangada ({inspectionData.brand || '—'} · {inspectionData.model || '—'}).
        </p>
      </div>

      {bulletins.length === 0 ? (
        <div className="border border-slate-200 bg-white rounded-2xl p-8 text-center shadow-sm">
          <div className="mx-auto w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
            <ShieldCheck size={28} className="text-emerald-600" />
          </div>
          <h3 className="text-lg font-bold text-slate-800">Sem boletins aplicáveis</h3>
          <p className="text-slate-500 mt-1 text-sm max-w-md mx-auto">
            Não existem boletins de serviço que correspondam à marca, modelo, capacidade ou data de fabrico registada
            para esta jangada.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="border border-slate-200 bg-white rounded-2xl p-4 text-center shadow-sm">
              <p className="text-2xl font-extrabold text-slate-800">{bulletins.length}</p>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">Aplicáveis</p>
            </div>
            <div className="border border-slate-200 bg-white rounded-2xl p-4 text-center shadow-sm">
              <p className="text-2xl font-extrabold text-emerald-600">{stats.aplicados}</p>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">Aplicados</p>
            </div>
            <div className="border border-slate-200 bg-white rounded-2xl p-4 text-center shadow-sm">
              <p className="text-2xl font-extrabold text-blue-600">{stats.emVerificacao}</p>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">Em Verificação</p>
            </div>
          </div>

          <div className="flex items-center justify-end">
            <button
              onClick={markAllApplied}
              className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-3 py-1.5 rounded-lg hover:bg-emerald-200 transition-colors"
            >
              Marcar todos como Aplicado
            </button>
          </div>

          <div className="space-y-4">
            {bulletins.map((bulletin) => {
              const currentStatus = applied[bulletin.id] || 'POR_APLICAR';
              return (
                <div key={bulletin.id} className="border border-slate-200 rounded-2xl bg-white shadow-sm overflow-hidden">
                  <div className="p-5 sm:p-6">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                      <div className="flex gap-4 min-w-0">
                        <div className="w-11 h-11 rounded-xl bg-indigo-50 p-2.5 text-indigo-600 flex-shrink-0">
                          <FileText size={22} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            Boletim {bulletin.bulletinNumber || bulletin.id} · {bulletin.matchedBrand || '—'} · {bulletin.matchedModel || '—'}
                          </p>
                          <h3 className="text-lg font-bold text-slate-800 mt-0.5">{bulletin.title}</h3>
                          {bulletin.shortDescription && (
                            <p className="text-sm text-slate-600 mt-1">{bulletin.shortDescription}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 xl:w-auto shrink-0">
                        {STATUS_OPTIONS.map((opt) => {
                          const isSelected = currentStatus === opt.value;
                          return (
                            <button
                              key={opt.value}
                              onClick={() => setBulletinStatus(inspectionData, setInspectionData, bulletin.id, opt.value)}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                                isSelected
                                  ? `${opt.color} ring-2 ring-offset-1 ring-opacity-50 ${opt.color.split(' ')[0].replace('text', 'ring')}`
                                  : 'text-slate-600 bg-white border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              <opt.icon size={15} />
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {bulletin.reason && (
                      <div className="mt-4 flex items-start gap-2 text-sm text-slate-600 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
                        <Landmark size={16} className="text-indigo-500 mt-0.5 flex-shrink-0" />
                        <p>{bulletin.reason}</p>
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2 items-center">
                      {bulletin.matchedRuleLabel && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-600 bg-slate-100 rounded-full">
                          <ShieldCheck size={12} />
                          {bulletin.matchedRuleLabel}
                        </span>
                      )}
                      {bulletin.yearFrom != null && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-amber-700 bg-amber-50 rounded-full">
                          <Clock size={12} />
                          {bulletin.yearFrom}{bulletin.yearTo != null ? `–${bulletin.yearTo}` : ''}{bulletin.manufactureYear ? ` · fab. ${bulletin.manufactureYear}` : ''}
                        </span>
                      )}
                      {bulletin.matchedContainer && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 rounded-full">
                          {bulletin.matchedContainer}
                        </span>
                      )}
                      {currentStatus === 'POR_APLICAR' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-amber-700 bg-amber-50 rounded-full">
                          <AlertTriangle size={12} />
                          Por aplicar na próxima intervenção
                        </span>
                      )}
                    </div>

                    {bulletin.fileUrl && (
                      <div className="mt-4">
                        <a
                          href={bulletin.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
                        >
                          <FileText size={14} />
                          Descarregar ficha do boletim
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}