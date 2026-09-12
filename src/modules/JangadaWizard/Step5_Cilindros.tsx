"use client";
import React from 'react';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import { Container, Scale, Calendar, Beaker, AlertTriangle, CheckCircle2, XCircle, Gauge } from 'lucide-react';
import { resolveNominalCharge } from '@/modules/rafts/nominalCharge';

export default function Step5_Cilindros() {
  const { inspectionData, setInspectionData } = useJangadaWizardStore();

  const cylinder = inspectionData.cylinder || {};

  const handleChange = (field: string, value: string) => {
    const updatedCylinder = {
      ...cylinder,
      [field]: value
    };

    if (field === 'dataTeste' && value) {
      const parts = value.split('-');
      if (parts[0] && parts[0].length === 4) {
        const year = parseInt(parts[0]) + 5;
        const month = parts[1] || '01';
        const day = parts[2];
        updatedCylinder.dataProxTeste = day ? `${year}-${month}-${day}` : `${year}-${month}`;
      }
    }

    setInspectionData({
      cylinder: updatedCylinder
    });
  };

  // Helper function to try to calculate gross weight if possible
  const calculateGrossWeight = () => {
    const tara = parseFloat(cylinder.tara || '0');
    const co2 = parseFloat(cylinder.co2 || '0');
    const n2 = parseFloat(cylinder.n2 || '0');
    
    if (tara > 0 || co2 > 0 || n2 > 0) {
      return (tara + co2 + n2).toFixed(3);
    }
    return '';
  };

  // Carga medida (kg) — a partir da pesagem (bruto - tara) ou da soma CO2/N2 registada
  const measuredChargeKg = (() => {
    const bruto = parseFloat(cylinder.pesoBruto || '0');
    const tara = parseFloat(cylinder.tara || '0');
    if (bruto > 0 && tara > 0) return bruto - tara;
    const co2 = parseFloat(cylinder.co2 || '0');
    const n2 = parseFloat(cylinder.n2 || '0');
    if (co2 > 0 || n2 > 0) return co2 + n2;
    return 0;
  })();

  const nominalChargeKg = parseFloat(cylinder.cargaNominal || '0');
  const chargeStatus = (() => {
    if (nominalChargeKg <= 0) return null;
    if (measuredChargeKg <= 0) return null;
    const ratio = measuredChargeKg / nominalChargeKg;
    if (ratio < 0.95) return 'deficient';
    if (ratio > 1.05) return 'over';
    return 'ok';
  })();

  const handleRecarregadoChange = (checked: boolean) => {
    setInspectionData({ cylinder: { ...cylinder, cilindroRecarregado: checked } });
  };

  // Sugestão automática de carga nominal (CO2/N2) a partir da tabela técnica do manual (marca/modelo/capacidade/configuração)
  const suggestion = resolveNominalCharge({
    brand: inspectionData.brand,
    model: inspectionData.model,
    capacity: inspectionData.capacity,
    launchType: inspectionData.launchType,
  });

  const isSuggestionApplied = Boolean(
    suggestion &&
      parseFloat(cylinder.co2 || '0') === suggestion.co2 &&
      parseFloat(cylinder.n2 || '0') === suggestion.n2 &&
      Math.abs(parseFloat(cylinder.cargaNominal || '0') - suggestion.totalKg) < 0.0001
  );

  const applySuggestion = (match: typeof suggestion) => {
    if (!match) return;
    setInspectionData({
      cylinder: {
        ...cylinder,
        co2: String(match.co2),
        n2: String(match.n2),
        cargaNominal: String(match.totalKg),
      },
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">5. Cilindro e Teste Hidrostático</h2>
        <p className="text-slate-600 mt-1">Registe os dados do cilindro de insuflação, pesagens de gás e as datas das provas.</p>
      </div>

      {/* State summary strip */}
      {(() => {
        const gross = cylinder.pesoBruto || calculateGrossWeight();
        const hasGas = (parseFloat(cylinder.co2 || '0') > 0) || (parseFloat(cylinder.n2 || '0') > 0);
        let hydroStatus: 'ok' | 'warn' | 'expired' = 'ok';
        let hydroDays = '';
        if (cylinder.dataProxTeste) {
          const expDate = new Date(cylinder.dataProxTeste);
          const insDate = inspectionData.dataInspecao ? new Date(inspectionData.dataInspecao) : new Date();
          if (!isNaN(expDate.getTime())) {
            const diffDays = Math.ceil((expDate.getTime() - insDate.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays < 0) { hydroStatus = 'expired'; hydroDays = `Expirado há ${Math.abs(diffDays)} dias`; }
            else if (diffDays <= 90) { hydroStatus = 'warn'; hydroDays = `Expira em ${diffDays} dias`; }
            else hydroDays = `Válido`;
          }
        }
        return (
          <div className="bg-sky-50 rounded-2xl p-4 text-slate-900 border border-sky-200 shadow-sm grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white border border-sky-200 rounded-lg py-2 text-center shadow-sm">
              <p className="text-xs font-black text-sky-700 truncate px-2">{cylinder.serial ? 'Série registada' : 'Sem série'}</p>
              <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold mt-0.5">Identificação</p>
            </div>
            <div className={`bg-white border border-amber-200 rounded-lg py-2 text-center shadow-sm`}>
              <p className="text-sm font-black text-amber-700 truncate px-2">{gross ? `${gross} kg` : '—'}</p>
              <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold mt-0.5">Peso Bruto</p>
            </div>
            <div className={`rounded-lg py-2 text-center border shadow-sm ${hasGas ? 'bg-emerald-50 border-emerald-300' : 'bg-red-50 border-red-300'}`}>
              <p className="text-sm font-black flex items-center justify-center gap-1.5 ${hasGas ? 'text-emerald-700' : 'text-red-700'}">
                {hasGas ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {hasGas ? 'Carga OK' : 'S/ carga'}
              </p>
              <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold mt-0.5">Gás CO2/N2</p>
            </div>
            <div className={`rounded-lg py-2 text-center border shadow-sm ${
              hydroStatus === 'expired' ? 'bg-red-50 border-red-300' :
              hydroStatus === 'warn' ? 'bg-amber-50 border-amber-300' : 'bg-emerald-50 border-emerald-300'
            }`}>
              <p className="text-sm font-black flex items-center justify-center gap-1.5 ${
                hydroStatus === 'expired' ? 'text-red-700' : hydroStatus === 'warn' ? 'text-amber-700' : 'text-emerald-700'
              }">
                <Gauge className="w-4 h-4" />
                {hydroStatus === 'expired' ? 'Expirado' : hydroStatus === 'warn' ? 'Atenção' : 'OK'}
              </p>
              <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold mt-0.5">{hydroDays || 'Hidrostático'}</p>
            </div>
          </div>
        );
      })()}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        
        {/* Identificação */}
        <div className="border border-slate-200 bg-white rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-indigo-50 p-2 rounded-lg text-indigo-600">
              <Container size={20} />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Identificação</h3>
          </div>

          <div className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Nº de Série do Cilindro</label>
              <input 
                type="text" 
                placeholder="Ex: CYL-123456"
                value={cylinder.serial || ''}
                onChange={(e) => handleChange('serial', e.target.value)}
                className="w-full border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white text-sm transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Sistema de Insuflação</label>
              <input 
                type="text" 
                placeholder="Ex: Cabeça Operacional MK3"
                value={cylinder.sistema || ''}
                onChange={(e) => handleChange('sistema', e.target.value)}
                className="w-full border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white text-sm transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Pesagens */}
        <div className="border border-slate-200 bg-white rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-amber-50 p-2 rounded-lg text-amber-600">
              <Scale size={20} />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Pesagens de Gás</h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5"><Beaker size={12}/> CO2 (kg)</label>
              <input 
                type="number" 
                step="0.001"
                placeholder="0.000"
                value={cylinder.co2 || ''}
                onChange={(e) => handleChange('co2', e.target.value)}
                className="w-full border-slate-200 rounded-xl px-4 py-3 bg-amber-50/30 focus:bg-white text-sm transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5"><Beaker size={12}/> N2 (kg)</label>
              <input 
                type="number" 
                step="0.001"
                placeholder="0.000"
                value={cylinder.n2 || ''}
                onChange={(e) => handleChange('n2', e.target.value)}
                className="w-full border-slate-200 rounded-xl px-4 py-3 bg-amber-50/30 focus:bg-white text-sm transition-colors"
              />
            </div>
            <div className="space-y-1.5 col-span-2 sm:col-span-1">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Tara (kg)</label>
              <input 
                type="number" 
                step="0.001"
                placeholder="0.000"
                value={cylinder.tara || ''}
                onChange={(e) => handleChange('tara', e.target.value)}
                className="w-full border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white text-sm transition-colors"
              />
            </div>
            <div className="space-y-1.5 col-span-2 sm:col-span-1">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Peso Bruto Verificado (kg)</label>
              <input 
                type="number" 
                step="0.001"
                placeholder={calculateGrossWeight() || "0.000"}
                value={cylinder.pesoBruto || ''}
                onChange={(e) => handleChange('pesoBruto', e.target.value)}
                className="w-full border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white text-sm transition-colors font-semibold text-slate-700"
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Carga Nominal de Referência (kg)</label>
              <input 
                type="number" 
                step="0.001"
                placeholder="Ex: 2.300 (massa de gás estampada / manual do modelo)"
                value={cylinder.cargaNominal || ''}
                onChange={(e) => handleChange('cargaNominal', e.target.value)}
                className="w-full border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white text-sm transition-colors"
              />
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Massa de gás (CO2/N2) indicada pelo fabricante para este cilindro. A verificação abaixo compara a
                carga medida (pesagem: bruto − tara) com a nominal.
              </p>

              {inspectionData.capacity && nominalChargeKg > 0 && (() => {
                const cap = Number(inspectionData.capacity);
                const maxPlausibleKg = cap * 3.5;
                const minPlausibleKg = 0.5;
                if (nominalChargeKg > maxPlausibleKg || nominalChargeKg < minPlausibleKg) {
                  return (
                    <div className="mt-2 p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-800 flex items-start gap-2">
                      <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Aviso de Consistência (Carga vs Capacidade)</p>
                        <p className="mt-0.5">
                          Indicou {nominalChargeKg} kg para uma lotação de {cap} pessoas ({ (nominalChargeKg / cap).toFixed(2) } kg/pax). Confirme se o valor da carga nominal do manual está correto para esta jangada.
                        </p>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {suggestion && (
                <div className={`mt-2 rounded-xl border p-3 text-sm flex items-start gap-2 ${
                  isSuggestionApplied
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-sky-50 border-sky-200 text-sky-900'
                }`}>
                  <CheckCircle2 size={16} className={`shrink-0 mt-0.5 ${isSuggestionApplied ? 'text-emerald-500' : 'text-sky-500'}`} />
                  <div className="flex-1">
                    <p className="font-bold">
                      {isSuggestionApplied ? 'Sugestão aplicada' : 'Carga nominal segundo o manual'}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed">
                      CO₂ {suggestion.co2} kg + N₂ {suggestion.n2} kg = <strong>{suggestion.totalKg} kg</strong>
                      {' — '}{suggestion.modelName} {suggestion.capacity}P
                      {suggestion.configuration ? ` (${suggestion.configuration})` : ''}
                      {suggestion.codRef ? ` · ref. ${suggestion.codRef}` : ''}
                    </p>
                    {suggestion.source && (
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        {suggestion.source.doc}
                        {suggestion.source.revision ? `, ${suggestion.source.revision}` : ''}
                        {suggestion.source.note ? ` — ${suggestion.source.note}` : ''}
                      </p>
                    )}
                  </div>
                  {!isSuggestionApplied && (
                    <button
                      type="button"
                      onClick={() => applySuggestion(suggestion)}
                      className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-700 text-white transition-colors"
                    >
                      Aplicar
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {(chargeStatus !== null) && (
            <div className={`mt-4 rounded-xl border p-3 text-sm flex items-start gap-2 ${
              chargeStatus === 'deficient'
                ? 'bg-red-50 border-red-300 text-red-800'
                : chargeStatus === 'over'
                  ? 'bg-amber-50 border-amber-300 text-amber-800'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-800'
            }`}>
              {chargeStatus === 'deficient' ? <XCircle size={18} className="shrink-0 mt-0.5 text-red-500" /> :
               chargeStatus === 'over' ? <AlertTriangle size={18} className="shrink-0 mt-0.5 text-amber-500" /> :
               <CheckCircle2 size={18} className="shrink-0 mt-0.5 text-emerald-500" />}
              <div>
                {chargeStatus === 'deficient' && (
                  <>
                    <p className="font-bold">Carga insuficiente — perda superior a 5%</p>
                    <p className="mt-0.5 text-xs leading-relaxed">
                      Carga medida: {measuredChargeKg.toFixed(3)} kg vs nominal {nominalChargeKg} kg (&lt; 95%).
                      Recarregar ou substituir o cilindro (46 CFR 160.151-57: o cilindro deve ser recarregado se a
                      perda de gás exceder 5% da carga). Rejeitar o cilindro até ser recarregado.
                    </p>
                  </>
                )}
                {chargeStatus === 'over' && (
                  <>
                    <p className="font-bold">Carga acima da nominal</p>
                    <p className="mt-0.5 text-xs leading-relaxed">
                      Carga medida {measuredChargeKg.toFixed(3)} kg é superior a 105% da nominal ({nominalChargeKg} kg).
                      Verificar leitura da balança e peso bruto.
                    </p>
                  </>
                )}
                {chargeStatus === 'ok' && (
                  <>
                    <p className="font-bold">Carga dentro do tolerável (&lt; 5%)</p>
                    <p className="mt-0.5 text-xs leading-relaxed">
                      Carga medida {measuredChargeKg.toFixed(3)} kg dentro de ±5% da nominal ({nominalChargeKg} kg).
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Cilindro Recarregado */}
        <div className="border border-slate-200 bg-white rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-violet-50 p-2 rounded-lg text-violet-600">
              <AlertTriangle size={20} />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Recarga do Cilindro</h3>
          </div>

          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={Boolean(cylinder.cilindroRecarregado)}
              onChange={(e) => handleRecarregadoChange(e.target.checked)}
              className="mt-1 w-4 h-4 accent-violet-600"
            />
            <span className="text-sm font-semibold text-slate-700">
              O cilindro foi recarregado nesta inspeção
            </span>
          </label>

          {Boolean(cylinder.cilindroRecarregado) && (
            <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900">
              <p className="font-bold flex items-center gap-1.5"><AlertTriangle size={15} className="text-violet-500" /> Nota de segurança</p>
              <p className="mt-1 text-xs leading-relaxed">
                O cilindro recarregado deve ficar <strong>em repouso durante pelo menos 2 semanas</strong> e ser
                verificado por pesagem antes de ser instalado/entregue (46 CFR 160.151-57). Confirme a data de
                repouso e a pesagem final antes de colocar em serviço.
              </p>
            </div>
          )}
        </div>

        {/* Testes Hidrostáticos */}
        <div className="border border-slate-200 bg-white rounded-2xl p-6 shadow-sm xl:col-span-2">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-emerald-50 p-2 rounded-lg text-emerald-600">
              <Calendar size={20} />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Testes Hidrostáticos</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Data do Último Teste (Realizado)</label>
              <input 
                type="month" 
                value={cylinder.dataTeste || ''}
                onChange={(e) => handleChange('dataTeste', e.target.value)}
                className="w-full border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white text-sm transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Próximo Teste Hidrostático</label>
              <input 
                type="month" 
                value={cylinder.dataProxTeste || ''}
                onChange={(e) => handleChange('dataProxTeste', e.target.value)}
                className="w-full border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white text-sm transition-colors"
              />
              {(() => {
                if (cylinder.dataProxTeste) {
                  const expDate = new Date(cylinder.dataProxTeste);
                  const insDate = inspectionData.dataInspecao ? new Date(inspectionData.dataInspecao) : new Date();
                  if (!isNaN(expDate.getTime())) {
                    const diffTime = expDate.getTime() - insDate.getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    if (diffDays < 0) {
                      return (
                        <div className="text-xs font-semibold text-red-700 flex items-center gap-1.5 mt-2 bg-red-50 p-2 rounded-xl border border-red-200 animate-pulse">
                          <AlertTriangle size={16} className="shrink-0 text-red-500" />
                          <span>O teste hidrostático do cilindro está EXPIRADO!</span>
                        </div>
                      );
                    } else if (diffDays <= 90) {
                      return (
                        <div className="text-xs font-semibold text-amber-700 flex items-center gap-1.5 mt-2 bg-amber-50 p-2 rounded-xl border border-amber-200">
                          <AlertTriangle size={16} className="shrink-0 text-amber-500" />
                          <span>O teste hidrostático expira em {diffDays} dias.</span>
                        </div>
                      );
                    }
                  }
                }
                return null;
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
