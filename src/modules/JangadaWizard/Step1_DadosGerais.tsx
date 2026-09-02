"use client";
import React from 'react';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import { PACK_TEMPLATES } from '@/config/packTemplates';
import { useEffect, useState } from 'react';
import { getInspectionIntervalYears, getInspectionIntervalLabel } from '../rafts/inspectionInterval';

const SOS_BRANDS = ['SOS', 'SURVITEC', 'VIKING', 'LALIZAS', 'ZODIAC', 'PLASTIMO', 'EUROVINIL'];
const isSosBrand = (brand: string, model?: string) => {
  const normalizedBrand = brand.toUpperCase().trim();
  const normalizedModel = (model || '').toUpperCase().trim();
  return SOS_BRANDS.some(sos => normalizedBrand.includes(sos) || normalizedModel.includes(sos));
};

const PACK_OPTIONS = [
  { value: '', label: 'Selecionar Pack...' },
  { value: 'Sem pack', label: 'Sem pack (SOS / Jangadas sem pack de emergência)' },
  ...Object.keys(PACK_TEMPLATES).map(pack => ({ value: pack, label: pack })),
];

const checkValidityWarning = (validadeStr: string, dataProxInspecao: string, dataInspecao: string, brand: string, shipDetails: any) => {
  if (!validadeStr) return null;

  let refDateStr = dataProxInspecao;
  if (!refDateStr && dataInspecao) {
    const years = getInspectionIntervalYears(brand, '', shipDetails);
    const parts = dataInspecao.split('-');
    if (parts[0] && parts[0].length === 4) {
      const year = parseInt(parts[0]) + years;
      const month = parts[1] || '01';
      const day = parts[2] || '01';
      refDateStr = `${year}-${month}-${day}`;
    }
  }

  if (!refDateStr) return null;

  const [vYear, vMonth] = validadeStr.split('-').map(Number);
  const valDate = new Date(vYear, (vMonth || 1) - 1, 1);

  const [pYear, pMonth] = refDateStr.split('-').map(Number);
  const proxDate = new Date(pYear, (pMonth || 1) - 1, 1);

  if (isNaN(valDate.getTime()) || isNaN(proxDate.getTime())) return null;

  if (valDate < proxDate) {
    return 'warning';
  }
  return 'ok';
};

export default function Step1_DadosGerais() {
  const { inspectionData, setInspectionData } = useJangadaWizardStore();
  
  // Auto-select "Sem pack" for SOS brand/model jangadas
  useEffect(() => {
    if (isSosBrand(inspectionData.brand || '', inspectionData.model || '') && !inspectionData.packType) {
      setInspectionData({ packType: 'Sem pack' });
    }
  }, [inspectionData.brand, inspectionData.model, inspectionData.packType, setInspectionData]);

  const hruWarning = checkValidityWarning(
    inspectionData.hruValidade, 
    inspectionData.dataProxInspecao, 
    inspectionData.dataInspecao, 
    inspectionData.brand, 
    inspectionData.shipDetails
  ) === 'warning';

  const handleChange = (field: string, value: any) => {
    const nextData = { ...inspectionData, [field]: value };
    if ((field === 'dataInspecao' || field === 'brand' || field === 'model') && nextData.dataInspecao) {
      const years = getInspectionIntervalYears(
        nextData.brand,
        nextData.model,
        nextData.shipDetails
      );
      const parts = nextData.dataInspecao.split('-');
      if (parts[0] && parts[0].length === 4) {
        const year = parseInt(parts[0]) + years;
        const month = parts[1] || '01';
        const day = parts[2] || '01';
        nextData.dataProxInspecao = `${year}-${month}-${day}`;
      }
    }
    setInspectionData(nextData);
  };

  return (
    <>
      <datalist id="brands-list">
        <option value="SURVITEC" />
        <option value="EUROVINIL" />
        <option value="LALIZAS" />
        <option value="PLASTIMO" />
        <option value="ZODIAC" />
        <option value="VIKING" />
        <option value="ARIMAR" />
        <option value="DSB" />
        <option value="RFD" />
      </datalist>

    <div className="space-y-8 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">1. Identificação Operacional</h2>
        <p className="text-slate-600 mt-1">Registe os dados identificativos da jangada e as suas características principais.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Serial */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Nº Série</label>
          <input 
            type="text" 
            className="w-full border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white transition-colors"
            placeholder="Ex: XDC1234"
            value={inspectionData.serial || ''}
            onChange={(e) => handleChange('serial', e.target.value)}
          />
        </div>

        {/* Marca */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Marca</label>
          <input 
            type="text"
            list="brands-list" 
            className="w-full border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white transition-colors"
            placeholder="Ex: Survitec"
            value={inspectionData.brand || ''}
            onChange={(e) => handleChange('brand', e.target.value)}
          />
        </div>

        {/* Modelo */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Modelo</label>
          <input 
            type="text" 
            className="w-full border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white transition-colors"
            placeholder="Ex: DL-25"
            value={inspectionData.model || ''}
            onChange={(e) => handleChange('model', e.target.value)}
          />
        </div>

        {/* Capacidade */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Capacidade (Pessoas)</label>
          <input 
            type="number" 
            className="w-full border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white transition-colors"
            placeholder="Ex: 25"
            value={inspectionData.capacity || ''}
            onChange={(e) => handleChange('capacity', parseInt(e.target.value) || '')}
          />
        </div>

        {/* Tipo de Pack */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Tipo de Pack</label>
          <select 
            className="w-full border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white transition-colors"
            value={inspectionData.packType || ''}
            onChange={(e) => handleChange('packType', e.target.value)}
          >
            {PACK_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {inspectionData.packType === 'Sem pack' && (
            <p className="text-xs text-emerald-700 mt-1 flex items-center gap-1">
              <span className="text-emerald-500">✓</span> Pack desativado - jangada SOS sem pack de emergência
            </p>
          )}
        </div>

        {/* Navio associado */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Embarcação</label>
          <input 
            type="text" 
            className="w-full border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white transition-colors"
            placeholder="Nome do navio associado"
            value={inspectionData.shipName || ''}
            onChange={(e) => handleChange('shipName', e.target.value)}
          />
        </div>

        {/* Armador / Proprietário */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Armador / Proprietário</label>
          <input 
            type="text" 
            className="w-full border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white transition-colors"
            placeholder="Ex: Armador Exemplo"
            value={inspectionData.owner || ''}
            onChange={(e) => handleChange('owner', e.target.value)}
          />
        </div>

        {/* Comprimento da Retenida (m) */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Comprimento da Retenida (m)</label>
          <input 
            type="text" 
            className="w-full border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white transition-colors"
            placeholder="Ex: 36"
            value={inspectionData.painterLength || ''}
            onChange={(e) => handleChange('painterLength', e.target.value)}
          />
        </div>

        {/* Altura de Lançamento Máxima (m) */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Altura Máx. Lançamento (m)</label>
          <input 
            type="text" 
            className="w-full border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white transition-colors"
            placeholder="Ex: 18"
            value={inspectionData.maxStowageHeight || ''}
            onChange={(e) => handleChange('maxStowageHeight', e.target.value)}
          />
        </div>

        {/* Tipo de Tecido */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Tipo de Tecido</label>
          <select 
            className="w-full border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white transition-colors"
            value={inspectionData.fabricType || ''}
            onChange={(e) => handleChange('fabricType', e.target.value)}
          >
            <option value="">Desconhecido / Outro</option>
            <option value="PU">PU (Poliuretano)</option>
            <option value="NR">NR (Borracha Natural)</option>
            <option value="PVC">PVC</option>
          </select>
        </div>

        {/* Tipo de Lançamento */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Tipo de Lançamento</label>
          <select 
            className="w-full border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white transition-colors"
            value={inspectionData.launchType || ''}
            onChange={(e) => handleChange('launchType', e.target.value)}
          >
            <option value="">Desconhecido / Outro</option>
            <option value="Throw-Over">Throw-Over (Queda Livre)</option>
            <option value="Davit-Launched">Davit-Launched (Arriável por Turco)</option>
          </select>
        </div>

        {/* Bandeira */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Bandeira do Navio</label>
          <input 
            type="text" 
            className="w-full border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white transition-colors"
            placeholder="Ex: Portugal"
            value={inspectionData.shipFlag || ''}
            onChange={(e) => handleChange('shipFlag', e.target.value)}
          />
        </div>

        {/* IMO */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">IMO do Navio</label>
          <input 
            type="text" 
            className="w-full border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white transition-colors"
            placeholder="Ex: 9123456"
            value={inspectionData.shipImo || ''}
            onChange={(e) => handleChange('shipImo', e.target.value)}
          />
        </div>

        {/* Call Sign */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Indicativo de Chamada</label>
          <input 
            type="text" 
            className="w-full border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white transition-colors"
            placeholder="Ex: CSAB2"
            value={inspectionData.shipCallSign || ''}
            onChange={(e) => handleChange('shipCallSign', e.target.value)}
          />
        </div>
      </div>

      <hr className="border-slate-200 my-8" />

      <div>
        <h3 className="text-lg font-bold text-slate-800 mb-4">Dados da Inspeção e Certificação</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Número do Certificado */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Nº do Certificado</label>
            <input 
              type="text" 
              className="w-full border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white transition-colors"
              placeholder="Ex: AZ26-001 (Deixar vazio para auto-gerar)"
              value={inspectionData.certificadoNumero || ''}
              disabled={Boolean((inspectionData.certificadoExternoNumero || '').trim())}
              onChange={(e) => handleChange('certificadoNumero', e.target.value)}
            />
            {(inspectionData.certificadoExternoNumero || '').trim() ? (
              <p className="text-[11px] font-semibold text-amber-600 flex items-center gap-1">
                Certificado externo (HarbourOne) indicado — o número AZ26-XXX fica sem efeito nesta inspeção.
              </p>
            ) : null}
          </div>

          {/* Número da Obra */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Nº da Obra</label>
            <input 
              type="text" 
              className="w-full border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white transition-colors"
              placeholder="Ex: OB-2026/04"
              value={inspectionData.numeroObra || ''}
              onChange={(e) => handleChange('numeroObra', e.target.value)}
            />
          </div>

          {/* Data da Inspeção */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Data da Inspeção</label>
            <input 
              type="date" 
              className="w-full border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white transition-colors"
              value={inspectionData.dataInspecao || ''}
              onChange={(e) => handleChange('dataInspecao', e.target.value)}
            />
          </div>

          {/* Próxima Inspeção */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Próxima Inspeção (Prevista)</label>
            <input 
              type="date" 
              className="w-full border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white transition-colors"
              value={inspectionData.dataProxInspecao || ''}
              onChange={(e) => handleChange('dataProxInspecao', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Data de Fabrico</label>
            <input 
              type="month" 
              className="w-full border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white transition-colors"
              value={inspectionData.dataFabrico || ''}
              onChange={(e) => handleChange('dataFabrico', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">HRU Instalado</label>
            <select 
              className="w-full border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white transition-colors"
              value={inspectionData.hruAplicavel || 'NAO'}
              onChange={(e) => handleChange('hruAplicavel', e.target.value)}
            >
              <option value="NAO">Não</option>
              <option value="SIM">Sim</option>
            </select>
          </div>

          {inspectionData.hruAplicavel === 'SIM' && (
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Validade do HRU</label>
              <input 
                type="month" 
                className={`w-full rounded-xl px-4 py-3 bg-amber-50 focus:bg-white transition-colors border ${
                  hruWarning 
                    ? 'border-amber-300 ring-2 ring-amber-100 bg-amber-50 focus:ring-amber-200' 
                    : 'border-slate-200'
                }`}
                value={inspectionData.hruValidade || ''}
                onChange={(e) => handleChange('hruValidade', e.target.value)}
              />
              {hruWarning && (
                <p className="text-[10px] text-amber-700 font-semibold mt-1">
                  ⚠️ Sugere-se substituir (val. inferior a {getInspectionIntervalLabel(inspectionData.brand, inspectionData.model, inspectionData.shipDetails)})
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
