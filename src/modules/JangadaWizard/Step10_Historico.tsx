"use client";
import React, { useEffect, useMemo, useState } from 'react';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import { History, Calendar, User, FileCheck, ArrowLeft, Search, FileText, RefreshCw, Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { formatDateDisplay } from '@/lib/date-display';

export default function Step10_Historico() {
  const { jangadaId, inspecoes, setInspecoes, setStep } = useJangadaWizardStore();
  const router = useRouter();
  const [busca, setBusca] = useState('');
  const [anoFiltro, setAnoFiltro] = useState('');

  useEffect(() => {
    if (!jangadaId) return;
    let cancelled = false;
    fetch(`/api/inspecoes?jangadaId=${jangadaId}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (!cancelled) setInspecoes(Array.isArray(data) ? data : []);
      })
      .catch(err => console.error('Erro ao carregar histórico de inspeções:', err));
    return () => {
      cancelled = true;
    };
  }, [jangadaId, setInspecoes]);

  const anos = useMemo(() => {
    const set = new Set<number>();
    inspecoes.forEach((insp: any) => {
      const year = new Date(insp?.dataInspecao).getFullYear();
      if (Number.isFinite(year)) set.add(year);
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [inspecoes]);

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return inspecoes.filter((insp: any) => {
      if (anoFiltro) {
        const year = new Date(insp?.dataInspecao).getFullYear();
        if (year !== Number(anoFiltro)) return false;
      }
      if (!q) return true;
      const haystack = [
        insp?.certificadoNumero,
        insp?.responsavel,
        insp?.status,
        insp?.jangadaSerial,
        insp?.navioNome,
        insp?.numeroObra,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [inspecoes, busca, anoFiltro]);

  const openInspection = (inspId: number) => {
    const base = typeof window !== 'undefined' ? window.location.pathname : '/';
    window.location.assign(`${base}?startInspection=1&inspecaoId=${inspId}`);
  };

  const downloadDossierPdf = (inspId: number) => {
    window.open(`/api/certificados/pdf?inspecaoId=${inspId}`, '_blank');
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <History className="text-slate-500" />
            Histórico de Inspeções
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Consulta as inspeções antigas registadas nesta jangada
          </p>
        </div>
        {inspecoes.length > 0 && (
          <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
            {filtered.length} de {inspecoes.length} registo{inspecoes.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {inspecoes.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={14} className="text-slate-400" />
            </div>
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Procurar por certificado, técnico, estado, navio, nº de obra..."
              className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <select
            value={anoFiltro}
            onChange={(e) => setAnoFiltro(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-slate-700"
          >
            <option value="">Todos os anos</option>
            {anos.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
      )}

      {inspecoes.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-12 text-center">
          <History className="mx-auto text-slate-300 mb-4" size={48} />
          <h3 className="text-slate-700 font-bold text-lg">Sem histórico de inspeções</h3>
          <p className="text-slate-500">Ainda não existem inspeções anteriores registadas para esta jangada no sistema.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-12 text-center">
          <Search className="mx-auto text-slate-300 mb-4" size={40} />
          <h3 className="text-slate-700 font-bold text-lg">Sem resultados</h3>
          <p className="text-slate-500">Nenhuma inspeção corresponde aos filtros aplicados.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((insp: any) => (
            <div key={insp.id} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex items-start gap-6 hover:border-slate-300 transition-colors">
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex flex-col items-center justify-center min-w-[120px]">
                <Calendar className="text-indigo-500 mb-2" size={24} />
                <span className="font-bold text-indigo-900">{formatDateDisplay(insp.dataInspecao)}</span>
              </div>

              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-800">
                    Certificado nº: {insp.certificadoNumero || 'Não gerado'}
                    {insp.numeroObra ? <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 align-middle">OB {insp.numeroObra}</span> : null}
                  </h3>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                    insp.status === 'Concluída' ? 'bg-emerald-100 text-emerald-800' : insp.status === 'Condenada' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {insp.status || 'Pendente'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="flex items-center gap-2 text-slate-600 text-sm">
                    <User size={16} />
                    <span><strong>Técnico:</strong> {insp.responsavel || 'Desconhecido'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600 text-sm">
                    <FileCheck size={16} />
                    <span><strong>Próxima Inspeção:</strong> {formatDateDisplay(insp.dataProxInspecao, 'N/A')}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => openInspection(insp.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors"
                    title="Abrir esta inspeção no wizard (consulta/edição)"
                  >
                    <Play size={13} />
                    Abrir no wizard
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadDossierPdf(insp.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors"
                    title="Descarregar o dossier técnico (PDF) desta inspeção"
                  >
                    <FileText size={13} />
                    Dossier PDF
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-6 border-t border-slate-200">
        <button
          onClick={() => setStep(1)}
          className="px-6 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-bold flex items-center gap-2 transition-colors"
        >
          <ArrowLeft size={20} />
          Voltar ao Resumo
        </button>
        <button
          onClick={() => router.refresh()}
          className="px-4 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl font-bold text-sm flex items-center gap-2 transition-colors"
          title="Recarregar dados do servidor"
        >
          <RefreshCw size={16} />
          Atualizar
        </button>
      </div>
    </div>
  );
}