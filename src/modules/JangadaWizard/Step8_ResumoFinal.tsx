"use client";
import React, { useMemo, useEffect, useState } from 'react';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import { AlertTriangle, CheckCircle, FileText, Anchor, ShieldAlert, QrCode as QrCodeIcon, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import QRCode from 'react-qr-code';
import { formatDateDisplay } from '@/lib/date-display';
import { getIvaRate, calcIva, round2 } from '@/lib/iva';
import { getWizardSteps, getStepIndexByKey } from './steps';
import { isArticleValidityRequired } from '@/modules/rafts/mandatoryPack';
import { computeFinishWarnings } from './finalizeInspection';
import { getArticleExpiryReason, getArticleExpiryStatus, isComponentExpiryControlled, resolveArticleNextInspection } from './articleExpiry';
import type { InspectionData } from './types';
import { withoutSosEquipment } from './sosRules';
import { installedHruDue } from '@/lib/hammar-h20';

export function getSummaryExceptionRows(data: InspectionData) {
  data = withoutSosEquipment(data);
  const nextInspection = resolveArticleNextInspection(data);
  const rows: { key: string; article: string; problem: string; decision: string; justification: string; stepKey: string }[] = [];
  const add = (key: string, article: string, stepKey: string, validity: string | undefined, controlled: boolean, replaced: boolean, reason: string | undefined, failed = false) => {
    const expiryProblem = controlled && getArticleExpiryStatus(validity, nextInspection) !== 'ok'
      ? getArticleExpiryReason(validity, nextInspection) : '';
    if (!failed && !expiryProblem) return;
    rows.push({ key, article, stepKey,
      problem: [failed ? 'REPROVADO' : '', expiryProblem].filter(Boolean).join(' · '),
      decision: controlled && getArticleExpiryStatus(validity, nextInspection) === 'pending'
        ? 'Verificação de validade pendente'
        : replaced ? (expiryProblem ? 'Substituído; validade ainda por resolver' : 'Substituído') : reason?.trim() ? 'Não substituído (exceção registada)' : 'Decisão por registar',
      justification: reason?.trim() || 'Sem justificação registada',
    });
  };
  for (const [id, item] of Object.entries(data.checklist || {})) {
    if (id.startsWith('_') || !item || ['NA', 'N/A'].includes(item.status || '')) continue;
    add(`checklist:${id}`, id.replace(/_/g, ' '), 'checklist', item.validade,
      item.validade !== undefined || ['luz_exterior_bateria', 'luz_interior_bateria'].includes(id),
      item.status === 'SUBSTITUIDO', item.justificacaoNaoSubstituicao, item.status === 'REPROVADO');
  }
  for (const [id, item] of Object.entries(data.packItems || {})) {
    add(`pack:${id}`, item.name || item.descricao || id, 'pack', item.validade,
      isArticleValidityRequired({ name: item.name, referencia: item.referencia }), Number(item.quantidade) > 0, item.justificacaoNaoSubstituicao, item.estado === 'REPROVADO');
  }
  for (const [index, item] of (data.componentes || []).entries()) {
    if (data.hruAplicavel === 'SIM' && /\b(?:HRU|HAMMAR|H20)\b/i.test(`${item.type || ''} ${item.reference || ''}`)) continue;
    add(`componentes:${item.id || index}`, item.type || item.reference || 'Componente', 'componentes', item.validade,
      isComponentExpiryControlled(item), item.estado === 'SUBSTITUIDO', item.justificacaoNaoSubstituicao, item.estado === 'REPROVADO');
  }
  if (data.hruAplicavel === 'SIM') {
    const due = installedHruDue(data.hruReference, data.hruDataInstalacao);
    if (due) add('hru', 'HRU — prazo após instalação', 'componentes', due, true,
      data.hruSubstituido === true, typeof data.hruJustificacaoNaoSubstituicao === 'string' ? data.hruJustificacaoNaoSubstituicao : undefined);
  }
  return rows;
}

export default function Step8_ResumoFinal() {
  const router = useRouter();
  const { 
    jangadaId,
    inspecaoId,
    inspectionData: rawInspectionData,
    globalStock,
    setInspectionData,
    setStepByKey,
    hideOrcamento,
    inspecoes,
  } = useJangadaWizardStore();
  const inspectionData = withoutSosEquipment(rawInspectionData);

  const [selectedTecnicoId, setSelectedTecnicoId] = useState<string>('');
  const [tecnicos, setTecnicos] = useState<any[]>([]);
  const [certs, setCerts] = useState<any[]>([]);

  const previousInsp = inspecoes?.[0] || null;

  const handleDownloadDossierPdf = () => {
    if (inspecaoId) {
      window.open(`/api/certificados/pdf?inspecaoId=${inspecaoId}`, '_blank');
    } else {
      window.print();
    }
  };

  useEffect(() => {
    fetch('/api/tecnicos?includeInactive=false')
      .then(res => res.json())
      .then(data => {
        const list: any[] = [];
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          (data.stations || []).forEach((station: any) => {
            if (Array.isArray(station.tecnicos)) list.push(...station.tecnicos);
          });
          if (Array.isArray(data.unassigned)) list.push(...data.unassigned);
        } else if (Array.isArray(data)) {
          list.push(...data);
        }
        const uniqueMap = new Map<number | string, any>();
        list.forEach(t => {
          if (t && t.id != null) uniqueMap.set(t.id, t);
        });
        const unique = Array.from(uniqueMap.values());
        setTecnicos(unique);
        if (inspectionData.responsavel && inspectionData.responsavel !== 'Operador') {
          const match = unique.find(t => t.nome?.toLowerCase() === String(inspectionData.responsavel).toLowerCase());
          if (match) setSelectedTecnicoId(String(match.id));
        } else if (unique.length > 0) {
          setSelectedTecnicoId(String(unique[0].id));
          setInspectionData({ responsavel: unique[0].nome });
        }
      })
      .catch(err => console.error('Erro ao carregar técnicos:', err));
  }, [inspectionData.responsavel]);

  useEffect(() => {
    if (selectedTecnicoId) {
      fetch(`/api/tecnicos/certificacoes?tecnicoId=${selectedTecnicoId}`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            setCerts(data);
          }
        })
        .catch(err => console.error('Erro ao carregar certificações:', err));
    } else {
      Promise.resolve().then(() => setCerts([]));
    }
  }, [selectedTecnicoId]);

  const checkTechnicianCertification = () => {
    if (!selectedTecnicoId) return null;
    const brand = (inspectionData.brand || '').trim().toUpperCase();
    if (!brand) return null;

    const hasCert = certs.find(c => {
      const matchBrand = c.fabricante.trim().toUpperCase() === brand;
      const valid = new Date(c.dataValidade) >= (inspectionData.dataInspecao ? new Date(inspectionData.dataInspecao) : new Date());
      return matchBrand && valid && c.ativo;
    });

    if (!hasCert) {
      const tecnico = tecnicos.find(t => String(t.id) === String(selectedTecnicoId));
      return `O técnico ${tecnico?.nome || ''} não tem certificação válida do fabricante ${brand} para esta balsa.`;
    }
    return null;
  };

  const warnings = useMemo(() => {
    const list = computeFinishWarnings(inspectionData, globalStock.length ? globalStock : undefined);
    if (!selectedTecnicoId && !list.some(w => w.stepKey === 'resumo')) {
      list.push({ text: 'Técnico responsável não selecionado.', stepKey: 'resumo', isCritical: true, blocksCompletion: true });
    }
    return list.map(w => ({ ...w, blocksCompletion: false }));
  }, [inspectionData, globalStock, selectedTecnicoId]);

  const wizardSteps = useMemo(
    () => getWizardSteps(inspectionData, { hideOrcamento }),
    [inspectionData, hideOrcamento],
  );

  const visibleStepKeyOf = (stepKey: string) => {
    const key = stepKey === 'orcamento' && hideOrcamento ? 'artigos' : stepKey;
    return getStepIndexByKey(wizardSteps, key) > 0 ? key : 'resumo';
  };

  const stepNumberOf = (stepKey: string) => {
    const idx = getStepIndexByKey(wizardSteps, visibleStepKeyOf(stepKey));
    return idx > 0 ? idx : 1;
  };

  const criticalCount = warnings.filter(w => w.isCritical).length;
  const exceptionRows = getSummaryExceptionRows(inspectionData);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{stepNumberOf('resumo') > 0 ? `${stepNumberOf('resumo')}. ` : ''}Resumo e revisão da inspeção</h2>
          <p className="text-slate-600 mt-1">Reveja os dados, os alertas e o técnico responsável. No passo seguinte pode pré-visualizar os documentos antes de guardar.</p>
        </div>
        <button
          type="button"
          onClick={() => router.push('/orcamentos')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 shadow-sm transition-all text-xs"
        >
          <ExternalLink size={16} />
          Módulo de Orçamentos
        </button>
        <button
          type="button"
          onClick={handleDownloadDossierPdf}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 shadow-sm transition-all text-xs"
        >
          <FileText size={16} />
          Descarregar Dossier Técnico PDF
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Painel Central de Alertas */}
        <div className="xl:col-span-2 space-y-6">
          
          {/* Comparativo Lado a Lado com a Vistoria Anterior */}
          {previousInsp && (
            <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl p-6 shadow-md">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-indigo-800/60">
                <div className="flex items-center gap-2.5">
                  <FileText className="text-indigo-400" size={20} />
                  <h3 className="text-base font-bold">Comparativo com Vistoria Anterior</h3>
                </div>
                <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-white/15 text-white border border-white/20">
                  {formatDateDisplay(previousInsp.dataInspecao)} · Cert: {previousInsp.certificadoNumero || 'N/A'}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white/10 p-3.5 rounded-xl border border-white/15 shadow-inner">
                  <p className="text-indigo-200 font-semibold mb-1 text-[11px] uppercase tracking-wide">Técnico Anterior</p>
                  <p className="font-bold text-sm truncate">{previousInsp.responsavel || 'N/D'}</p>
                </div>
                <div className="bg-white/10 p-3.5 rounded-xl border border-white/15 shadow-inner">
                  <p className="text-indigo-200 font-semibold mb-1 text-[11px] uppercase tracking-wide">Próx. Insp. Anterior</p>
                  <p className="font-bold text-sm">{formatDateDisplay(previousInsp.dataProxInspecao, 'N/A')}</p>
                </div>
                <div className="bg-white/10 p-3.5 rounded-xl border border-white/15 shadow-inner">
                  <p className="text-indigo-200 font-semibold mb-1 text-[11px] uppercase tracking-wide">Estado Anterior</p>
                  <p className="font-bold text-sm text-emerald-300">{previousInsp.status || 'Concluída'}</p>
                </div>
                <div className="bg-white/10 p-3.5 rounded-xl border border-white/15 shadow-inner">
                  <p className="text-indigo-200 font-semibold mb-1 text-[11px] uppercase tracking-wide">Cilindro S/N</p>
                  <p className="font-bold text-sm">{previousInsp.cylinderSerial || inspectionData.cylinder?.serial || 'N/D'}</p>
                </div>
              </div>
            </div>
          )}
          <div id="inspection-finish-warnings" tabIndex={-1} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center gap-3">
              <ShieldAlert className="text-slate-500" size={20} />
              <h3 className="text-lg font-bold text-slate-800">Validação do Sistema: lista consolidada</h3>
            </div>
            
            <div className="p-6">
              {warnings.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle size={32} />
                  </div>
                  <h4 className="text-lg font-bold text-slate-800">Tudo Perfeito!</h4>
                  <p className="text-slate-500 mt-1 max-w-sm">
                    A inteligência do sistema não detetou falhas, validades em atraso ou itens reprovados. A jangada está pronta para ser certificada.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                    <section aria-label="Exceções consolidadas" className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
                      <div className="p-4">
                        <h4 className="font-bold text-amber-900">Exceções e decisões por artigo</h4>
                        <p className="text-xs text-amber-800 mt-1">A justificação permite registar a decisão, mas não declara conformidade nem elimina a reprovação.</p>
                        <p className="text-xs text-amber-800 mt-1">Reveja as pendências antes de concluir; permanecem registadas mesmo após a confirmação.</p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-amber-100 text-amber-900"><tr>
                            {['Artigo / Passo', 'Problema', 'Decisão', 'Justificação'].map(label => <th key={label} scope="col" className="p-3 font-bold">{label}</th>)}
                          </tr></thead>
                          <tbody>{warnings.map((warning, index) => {
                            const row = exceptionRows.find(row => warning.articleKey ? row.key === warning.articleKey : row.stepKey === warning.stepKey && warning.text.startsWith(`${row.article}:`));
                            const problem = row ? warning.text.split(`Justificação: ${row.justification}.`).join('') : warning.text;
                            return <tr key={`${warning.stepKey}:${index}`} className="border-t border-amber-200 align-top">
                              <td className="p-3"><button type="button" onClick={() => setStepByKey(visibleStepKeyOf(warning.stepKey))} className="font-bold text-indigo-700 hover:underline">{row?.article || `Passo ${stepNumberOf(warning.stepKey)}`}</button><span className="block text-xs">Corrigir Passo {stepNumberOf(warning.stepKey)}</span></td>
                              <td className={`p-3 ${warning.isCritical ? 'text-red-800' : 'text-amber-900'}`}>{problem}<span className="block text-xs font-bold mt-1">{warning.blocksCompletion ? 'Impede a conclusão' : warning.isCritical ? 'Requer confirmação' : 'Aviso informativo'}</span></td>
                              <td className="p-3 text-amber-900">{row?.decision || 'Rever no passo indicado'}</td>
                              <td className="p-3 text-slate-700 whitespace-pre-wrap">{row?.justification || 'Não aplicável'}</td>
                            </tr>;
                          })}</tbody>
                        </table>
                      </div>
                    </section>
                </div>
              )}
            </div>
          </div>

          {/* Seleção do Técnico Responsável */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mt-6">
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center gap-3">
              <FileText className="text-slate-500" size={20} />
              <h3 className="text-lg font-bold text-slate-800">Técnico Responsável pela Inspeção</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5 max-w-md">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 font-semibold">Técnico Responsável</label>
                <select
                  value={selectedTecnicoId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedTecnicoId(id);
                    const tecnico = tecnicos.find(t => String(t.id) === String(id));
                    setInspectionData({ responsavel: tecnico?.nome || 'Operador' });
                  }}
                  className="w-full border-slate-200 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-100 font-medium text-slate-700"
                >
                  <option value="">-- Selecione o Técnico --</option>
                  {tecnicos.map(t => (
                    <option key={t.id} value={t.id}>{t.nome}</option>
                  ))}
                </select>
                {(() => {
                  const warning = checkTechnicianCertification();
                  if (warning) {
                    return (
                      <div className="text-xs font-semibold text-amber-700 flex items-center gap-1.5 mt-2 bg-amber-50 p-2 rounded-xl border border-amber-200">
                        <AlertTriangle size={16} className="shrink-0" />
                        <span>{warning}</span>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* Barra Lateral de Resumo Rápido */}
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-indigo-900 to-indigo-950 rounded-2xl p-6 text-white shadow-md">
            <h3 className="text-sm font-bold uppercase tracking-wider text-indigo-200 mb-6 border-b border-indigo-800/60 pb-3">Raio-X da Jangada</h3>
            
            <div className="space-y-5">
              <div className="flex items-center gap-4">
                <div className="bg-white/15 w-11 h-11 flex items-center justify-center rounded-xl text-white shrink-0">
                  <Anchor size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-indigo-200 font-bold uppercase tracking-wider mb-0.5">Identificação</p>
                  <p className="font-bold text-sm">{inspectionData.serial || 'Sem Série'}</p>
                  <p className="text-xs text-indigo-200">{inspectionData.brand || 'Sem Marca'} - {inspectionData.model || 'Sem Modelo'}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="bg-white/15 w-11 h-11 flex items-center justify-center rounded-xl text-white shrink-0">
                  <FileText size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-indigo-200 font-bold uppercase tracking-wider mb-0.5">Configuração</p>
                  <p className="font-bold text-sm">{inspectionData.packType || 'Sem Pack'}</p>
                  <p className="text-xs text-indigo-200">{inspectionData.capacity ? `${inspectionData.capacity} Pessoas` : 'S/ Capacidade'}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="bg-white/15 w-11 h-11 flex items-center justify-center rounded-xl text-white shrink-0">
                  <CheckCircle size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-indigo-200 font-bold uppercase tracking-wider mb-0.5">Estado</p>
                  {Boolean(inspectionData.abate?.ativo) ? (
                    <p className="font-bold text-sm text-red-300 flex items-center gap-1.5">
                      <ShieldAlert size={15} />
                      Condenada (Abate)
                    </p>
                   ) : warnings.length > 0 ? (
                    <p className="font-bold text-sm text-amber-300 flex items-center gap-1.5">
                      <AlertTriangle size={15} />
                      Com Avisos Pendentes
                    </p>
                  ) : (
                    <p className="font-bold text-sm text-emerald-300 flex items-center gap-1.5">
                      <CheckCircle size={15} />
                      Pronto a Fechar
                    </p>
                  )}
                  <p className="text-xs text-indigo-200">Próx. Insp: {formatDateDisplay(inspectionData.dataProxInspecao, '?')}</p>
                </div>
              </div>

              {!hideOrcamento && (() => {
                const orcLinhas = inspectionData.orcamento?.linhas || [];
                if (orcLinhas.length === 0 && !inspectionData.orcamento?.usarOrcamento) return null;
                const orcSubtotal = orcLinhas.reduce((s: number, l: any) => s + (Number(l.quantidade) || 0) * (Number(l.unitPrice) || 0), 0);
                const orcDesconto = Number(inspectionData.orcamento?.valorDesconto || 0);
                const orcBase = Math.max(0, orcSubtotal - orcDesconto);
                const orcIsento = Boolean(inspectionData.orcamento?.isIsentoIva);
                const orcIva = calcIva(orcBase, orcIsento);
                const orcTotal = round2(orcBase + orcIva);
                return (
                  <div className="flex items-start gap-4">
                    <div className="bg-white/15 w-11 h-11 flex items-center justify-center rounded-xl text-white shrink-0">
                      <FileText size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-indigo-200 font-bold uppercase tracking-wider mb-0.5">Orçamento{stepNumberOf('orcamento') > 0 ? ` (Passo ${stepNumberOf('orcamento')})` : ''}</p>
                      <p className="font-bold text-sm">{orcLinhas.length} linha(s) · {new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(orcTotal)}</p>
                      <p className="text-xs text-indigo-200">
                        Subtotal: {new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(orcBase)}
                        {!orcIsento && ` · IVA (${(getIvaRate() * 100).toFixed(0)}%): ${new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(orcIva)}`}
                        {orcIsento && ' · Isento de IVA'}
                      </p>
                    </div>
                  </div>
                );
              })()}
            </div>

            <hr className="border-indigo-700 my-6" />

            <p className="text-sm text-indigo-100">
              Reveja o resumo e avance para Certificados. A gravação e finalização são feitas uma única vez, no último passo.
            </p>
            {criticalCount > 0 && (
              <p className="text-center text-xs mt-3 text-amber-200">
                {Boolean(inspectionData.abate?.ativo)
                  ? 'Jangada será finalizada como Condenada (Abate)'
                  : 'Reveja os avisos antes de concluir. Pode finalizar com pendências; isso não significa que estejam resolvidas ou que o equipamento esteja conforme.'}
              </p>
            )}
</div>
          </div>

          {/* QR Code de Identificação da Jangada */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
              <QrCodeIcon className="text-slate-400" size={16} />
              Etiqueta QR (imprimir e afixar)
            </h3>
            <div className="flex items-center gap-4">
              <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
                <QRCode
                  value={`${typeof window !== 'undefined' && window.location.origin}/jangadas/${jangadaId || ''}`}
                  size={104}
                  level="M"
                />
              </div>
              <div className="text-xs text-slate-600 space-y-1.5">
                <p className="font-bold text-slate-800">
                  {inspectionData.serial || 'S/N'}
                </p>
                <p>{inspectionData.brand} · {inspectionData.model}</p>
                <p className="text-slate-400">Aponte para abrir a ficha da jangada no sistema.</p>
              </div>
            </div>
          </div>

          {/* Pré-requisitos de Fecho */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
              <FileText size={16} className="text-slate-400" />
              Dossier de Fecho
            </h3>
            {(() => {
              const items = [
                {
                  label: 'Técnico responsável selecionado',
                  ok: Boolean(selectedTecnicoId),
                  hint: selectedTecnicoId ? 'Selecionado' : 'Pendente',
                },
                {
                  label: 'Certificação do fabricante',
                  ok: !checkTechnicianCertification(),
                  hint: checkTechnicianCertification() ? 'Em falta' : 'Válida',
                  skip: !selectedTecnicoId,
                },
              ];
              const done = items.filter(i => i.ok).length;
              const total = items.filter(i => !i.skip).length;
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              return (
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-xs font-bold mb-1">
                      <span className="text-slate-600">Preparação do dossier</span>
                      <span className={pct === 100 ? 'text-emerald-600' : 'text-indigo-600'}>{pct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${pct === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    {items.filter(i => !i.skip).map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-3 text-xs">
                        <span className="flex items-center gap-2 font-medium text-slate-600">
                          {item.ok ? <CheckCircle size={14} className="text-emerald-500" /> : <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300" />}
                          {item.label}
                        </span>
                        <span className={`font-bold ${item.ok ? 'text-emerald-600' : 'text-slate-400'}`}>{item.hint}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
  );
}
