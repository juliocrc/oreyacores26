"use client";
import { isSosRaft } from '@/lib/raft-model-rules';
import { withoutSosEquipment } from './sosRules';
import React from 'react';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import { Plus, Trash2, Tag, Calendar, Hash, AlertTriangle, ShieldCheck, BatteryFull } from 'lucide-react';
import { getInspectionIntervalYears, getInspectionIntervalLabel, getSubstitutionMaxValidityDays } from '../rafts/inspectionInterval';
import { parseMonthYearValue, toMonthYearString, maskMonthYearInput, formatMonthPt } from '@/lib/date-utils';
import { getStepNumberByKey } from './steps';
import { ReplacementStockSelect as StockPickerSelect } from '@/components/shared/ReplacementStockPicker';
import { isComponentStockItem, isHruStockItem, isLightStockItem } from '@/lib/stock-picker';
import ArticleExpiryResolution from './ArticleExpiryResolution';
import { getArticleExpiryReason, getArticleExpiryStatus, isComponentExpiryControlled } from './articleExpiry';
import { hammarH20RExpiry, isHammarH20RReference } from '@/lib/hammar-h20';

const COMPONENT_TYPES = [
  'Cabeça Operacional (Operating Head)',
  'Válvula de Enchimento (Inlet Valve)',
  'Válvula de Alívio (Relief Valve)',
  'Válvula de Retenção (Non-Return Valve)',
  'Mangueira / Tubo Alta Pressão (High Pressure Hose)',
  'Manómetro (Pressure Gauge)',
  'Fita de Fecho (Bursting Band)',
  'Outro Componente'
];

export default function Step3_Componentes() {
  const { inspectionData, setInspectionData, hideOrcamento } = useJangadaWizardStore();
  const stepNo = getStepNumberByKey(inspectionData, 'componentes', { hideOrcamento });

  const componentes = withoutSosEquipment(inspectionData).componentes || [];
  const datedComponents = componentes.filter(isComponentExpiryControlled);
  const componentsNeedingAttention = datedComponents.filter(c => getArticleExpiryStatus(c.validade, inspectionData.dataProxInspecao) !== 'ok').length;

  // A lista de componentes comeca vazia: o tecnico confirma e adiciona cada
  // componente durante a inspecao. Nao se pre-preenche a partir da ficha do
  // modelo (raftModelData) porque obriga a confirmar e remover o que nao
  // exista a bordo. A aplicabilidade da HRU e definida apenas neste passo.

  const addComponent = () => {
    setInspectionData({
      componentes: [
        ...componentes,
        { id: Date.now().toString(), type: COMPONENT_TYPES[0], reference: '', serialLote: '', validade: '', estado: '' }
      ]
    });
  };

  const removeComponent = (id: string) => {
    setInspectionData({
      componentes: componentes.filter((c: any) => c.id !== id)
    });
  };

  const updateComponent = (id: string, field: string, value: string | boolean) => {
    setInspectionData({
      componentes: componentes.map((c: any) => 
        c.id === id ? { ...c, [field]: value, ...(field === 'expiryControlled' && !value ? { validade: '', serialLote: '' } : {}) } : c
      )
    });
  };

  const getLongValidity = (comp: any): number | null => {
    if (String(comp.estado || '').toUpperCase() === 'DANIFICADO') return null;
    if (!comp.validade) return null;
    let refDateStr = inspectionData.dataProxInspecao;
    if (!refDateStr && inspectionData.dataInspecao) {
      const years = getInspectionIntervalYears(inspectionData.brand, '', inspectionData.shipDetails);
      const parts = String(inspectionData.dataInspecao ?? "").split('-');
      if (parts[0] && parts[0].length === 4) {
        refDateStr = `${parseInt(parts[0]) + years}-${parts[1] || '01'}-${parts[2] || '01'}`;
      }
    }
    if (!refDateStr) return null;
    const vParsed = parseMonthYearValue(comp.validade);
    const valDate = vParsed ? new Date(vParsed.year, vParsed.month - 1, 1) : new Date(NaN);
    const [rYear, rMonth] = String(refDateStr ?? "").split('-').map(Number);
    const refDate = new Date(rYear, (rMonth || 1) - 1, 1);
    if (isNaN(valDate.getTime()) || isNaN(refDate.getTime())) return null;
    const monthsDiff = (valDate.getFullYear() - refDate.getFullYear()) * 12 + (valDate.getMonth() - refDate.getMonth());
    const intervalMonths = getSubstitutionMaxValidityDays(inspectionData.brand, inspectionData.model, inspectionData.shipDetails) / 30;
    if (monthsDiff > intervalMonths) return monthsDiff;
    return null;
  };

  const handleStockSelect = (id: string, stockIdStr: string) => {
    const stockId = parseInt(stockIdStr, 10);
    const stockItem = inspectionData.globalStock?.find((s: any) => s.id === stockId);
    if (stockItem) {
      setInspectionData({
        componentes: componentes.map((c: any) => 
          c.id === id ? { 
            ...c, 
            reference: stockItem.referencia, 
            stockId: stockItem.id,
            estado: 'SUBSTITUIDO',
            expiryControlled: isComponentExpiryControlled(c),
            validade: isComponentExpiryControlled(c) ? toMonthYearString(stockItem.validade) : '',
            serialLote: isComponentExpiryControlled(c) ? stockItem.lote || '' : ''
          } : c
        )
      });
    }
  };

  // Filter stock for components
  const rawStock = inspectionData.globalStock || [];
  const componentStock = rawStock.filter(isComponentStockItem);

  // Filter stock for HRU (libertador hidrostático)
  const filteredHruStock = rawStock.filter(isHruStockItem);
  const hruStock = filteredHruStock;

  // Filter stock for luzes / baterias do coberto
  const filteredLightStock = rawStock.filter(isLightStockItem);
  const lightStock = filteredLightStock;

  const HRU_TYPE_OPTIONS = [
    'DESCARTÁVEL',
    'REUTILIZÁVEL',
    'DESCONHECIDO',
  ];

  const LIGHT_STATUS_OPTIONS = [
    'OK',
    'SUBSTITUIDO',
    'REPROVADO',
    'NA',
  ];

  const updateHruField = (field: string, value: string) => {
    if (field === 'hruExpiry') {
      setInspectionData({ hruExpiry: value, hruValidade: value });
      return;
    }
    if (field === 'hruDataInstalacao') {
      if (inspectionData.hruSubstituido === true && isHammarH20RReference(inspectionData.hruReference) && inspectionData.hruHammarVerified === true) {
        const expiry = hammarH20RExpiry(value);
        setInspectionData({ hruDataInstalacao: value, hruExpiry: expiry, hruValidade: expiry });
      } else setInspectionData({ hruDataInstalacao: value });
      return;
    }
    setInspectionData({ [field]: value } as any);
  };

  const handleHruStockSelect = (stockIdStr: string) => {
    const stockId = parseInt(stockIdStr, 10);
    const stockItem = inspectionData.globalStock?.find((s: any) => s.id === stockId);
    if (stockItem) {
      const h20 = isHammarH20RReference(stockItem.referencia);
      setInspectionData({
        hruReference: stockItem.referencia,
        hruStockId: stockItem.id,
        hruSerial: h20 ? '' : stockItem.lote || '',
        hruSubstituido: true,
        hruTipo: (inspectionData.hruTipo || '').trim() || 'DESCONHECIDO',
        hruHammarVerified: false,
        hruDataInstalacao: '', hruExpiry: '', hruValidade: '',
      });
    }
  };

  const handleLightStockSelect = (itemId: string, stockIdStr: string) => {
    const stockId = parseInt(stockIdStr, 10);
    const stockItem = inspectionData.globalStock?.find((s: any) => s.id === stockId);
    if (stockItem) {
      const current = inspectionData.checklist?.[itemId] || {};
      setInspectionData({
        checklist: {
          ...(inspectionData.checklist || {}),
          [itemId]: {
            ...current,
            stockId: stockItem.id,
            referencia: stockItem.referencia,
            validade: toMonthYearString(stockItem.validade),
            lote: stockItem.lote || '',
            status: 'SUBSTITUIDO',
            voltagem: current.voltagem || '',
          },
        },
      });
    }
  };

  const updateLightItem = (itemId: string, field: string, value: string) => {
    const current = inspectionData.checklist?.[itemId] || {};
    setInspectionData({
      checklist: {
        ...(inspectionData.checklist || {}),
        [itemId]: { ...current, [field]: value },
      },
    });
  };

  const checkExpiry = (validade: string, referenceDate: string) => {
    if (!validade || !referenceDate) return null;
    const vParsed = parseMonthYearValue(validade);
    const valDate = vParsed ? new Date(vParsed.year, vParsed.month, 0) : new Date(NaN);
    const rParsed = parseMonthYearValue(referenceDate);
    const refDate = rParsed ? new Date(rParsed.year, rParsed.month - 1, 1) : new Date(NaN);
    if (isNaN(valDate.getTime()) || isNaN(refDate.getTime())) return null;
    return valDate < refDate ? 'expired' : 'ok';
  };

  const installedHruExpiry = isHammarH20RReference(inspectionData.hruReference) ? hammarH20RExpiry(inspectionData.hruDataInstalacao) : '';
  const hruExpiryStatus = checkExpiry(installedHruExpiry, inspectionData.dataInspecao);
  const luzExteriorItem = inspectionData.checklist?.['luz_exterior_bateria'] || {};
  const luzInteriorItem = inspectionData.checklist?.['luz_interior_bateria'] || {};
  const luzExteriorStatus = checkExpiry(luzExteriorItem.validade || '', inspectionData.dataInspecao);
  const luzInteriorStatus = checkExpiry(luzInteriorItem.validade || '', inspectionData.dataInspecao);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{stepNo > 0 ? `${stepNo}. ` : ''}Componentes Críticos & Válvulas</h2>
          <p className="text-slate-600 mt-1">Registe as válvulas e cabeças substituídas ou inspecionadas.</p>
        </div>
        <button 
          onClick={addComponent}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-semibold shadow-sm hover:bg-indigo-700 transition-colors"
        >
          <Plus size={18} />
          Adicionar Componente
        </button>
      </div>

      {/* State summary strip */}
      <div className="bg-sky-50 rounded-2xl p-4 text-slate-900 border border-sky-200 shadow-sm flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="grid grid-cols-3 gap-3 flex-1 text-center">
          <div className="bg-white border border-sky-200 rounded-lg py-2 shadow-sm">
            <p className="text-lg font-black text-sky-700">{componentes.length}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Registados</p>
          </div>
          <div className="bg-white border border-emerald-200 rounded-lg py-2 shadow-sm">
            <p className="text-lg font-black text-emerald-700">{datedComponents.filter(c => parseMonthYearValue(c.validade)).length}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">C/ Validade</p>
          </div>
          <div className="bg-white border border-amber-200 rounded-lg py-2 shadow-sm">
            <p className="text-lg font-black text-amber-700 flex items-center justify-center gap-1.5">
              {componentsNeedingAttention}
              {componentsNeedingAttention > 0 && (
                <AlertTriangle className="w-4 h-4" />
              )}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Em Alerta</p>
          </div>
        </div>
        <div className="hidden sm:block text-right">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Estado dos componentes</p>
          <p className="text-sm font-bold text-slate-900">
            {componentsNeedingAttention === 0
              ? 'Todos conformes' 
              : 'Requer atenção'}
          </p>
        </div>
      </div>

      {/* HRU — Libertador Hidrostático */}
      {!isSosRaft(inspectionData) && <div className="border border-slate-200 rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-5">
          <div className="bg-rose-50 p-2 rounded-lg text-rose-600">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">HRU — Libertador Hidrostático</h3>
            <p className="text-xs text-slate-500">Confirmar se a jangada tem libertador hidrostático instalado.</p>
          </div>
        </div>

        <div className="space-y-1.5 mb-5 max-w-xs">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">HRU Aplicável</label>
          <select
            value={inspectionData.hruAplicavel || 'NAO'}
            onChange={(e) => updateHruField('hruAplicavel', e.target.value)}
            className="w-full border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:bg-white text-sm transition-colors font-medium"
          >
            <option value="NAO">Não</option>
            <option value="SIM">Sim</option>
          </select>
        </div>

        {inspectionData.hruAplicavel === 'SIM' && (
        <>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Tipo de HRU</label>
            <select
              value={inspectionData.hruTipo || ''}
              onChange={(e) => updateHruField('hruTipo', e.target.value)}
              className="w-full border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:bg-white text-sm transition-colors font-medium"
            >
              <option value="" disabled>Selecionar tipo...</option>
              {HRU_TYPE_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Referência (P/N)</label>
            <input
              type="text"
              placeholder="Ex: Hammar H20"
              value={inspectionData.hruReference || ''}
              onChange={(e) => updateHruField('hruReference', e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5 bg-slate-50 focus:bg-white text-sm transition-colors"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">N.º de Série</label>
            <input
              type="text"
              placeholder="N.º de série"
              value={inspectionData.hruSerial || ''}
              onChange={(e) => updateHruField('hruSerial', e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5 bg-slate-50 focus:bg-white text-sm transition-colors"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Data de Instalação</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="MM/AAAA"
              maxLength={7}
              value={/^\d{4}-\d{2}-\d{2}/.test(String(inspectionData.hruDataInstalacao || '')) ? toMonthYearString(String(inspectionData.hruDataInstalacao)) : String(inspectionData.hruDataInstalacao || '')}
              onChange={(e) => updateHruField('hruDataInstalacao', maskMonthYearInput(e.target.value))}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:bg-white text-sm transition-colors"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Prazo após instalação — H20 R confirmado</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="MM/AAAA"
              maxLength={7}
              value={installedHruExpiry}
              readOnly
              className={`w-full border rounded-xl px-3 py-2.5 bg-slate-50 focus:bg-white text-sm transition-colors ${
                hruExpiryStatus === 'expired'
                  ? 'border-red-300 ring-2 ring-red-100 bg-red-50 text-red-900'
                  : 'border-slate-200'
              }`}
            />
          </div>
        </div>

        <label className="mt-4 block text-sm"><input type="checkbox" checked={inspectionData.hruSubstituido === true} onChange={e => setInspectionData({ hruSubstituido: e.target.checked })} /> HRU efetivamente substituído</label>
        {inspectionData.hruSubstituido === true && isHammarH20RReference(inspectionData.hruReference) && <label className="mt-3 flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked={inspectionData.hruHammarVerified === true} onChange={e => setInspectionData({ hruHammarVerified: e.target.checked })} /> Confirmo que a unidade instalada é Hammar H20 R e que a data de fabrico e o armazenamento foram verificados segundo o fabricante.</label>}
        {installedHruExpiry ? <ArticleExpiryResolution name="HRU (prazo após instalação)" validade={installedHruExpiry} nextInspection={inspectionData.dataProxInspecao} replaced={inspectionData.hruSubstituido === true} reason={String(inspectionData.hruJustificacaoNaoSubstituicao || '')} onReasonChange={value => setInspectionData({ hruJustificacaoNaoSubstituicao: value })} /> : <p className="mt-3 text-sm text-amber-800">Confirme a data de instalação e o modelo; para outros HRU confirme o prazo no manual aplicável.</p>}
        <div className="mt-4 space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Artigo de Stock (HRU)</label>
          <StockPickerSelect
            allowDeficit
            items={hruStock}
            value={inspectionData.hruStockId || ""}
            onSelect={(s) => handleHruStockSelect(String(s.id))}
            placeholder="Selecionar HRU do armazém..."
            emptyMessage="Nenhum artigo HRU disponível no stock para esta categoria"
            allowH20R
          />
        </div>

        {hruExpiryStatus === 'expired' && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start gap-2">
            <AlertTriangle size={18} className="shrink-0 mt-0.5 text-red-500" />
            <div>
              <p className="font-bold">Prazo após instalação ultrapassado ({installedHruExpiry})</p>
              <p className="mt-0.5 text-xs leading-relaxed">
                Substituir o HRU dentro do prazo de validade do fabricante. Verificar ainda o n.º de série e a etiqueta
                de validade do HRU quando se substituir.
              </p>
            </div>
          </div>
        )}

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 leading-relaxed">
          {inspectionData.hruTipo === 'DESCARTÁVEL' ? (
            <p>
              HRU <strong>descartável</strong> — confirmar o modelo e o prazo indicado pelo fabricante. No H20 R, marque a validade de 24 meses após o mês de instalação; verifique também a data de fabrico e o armazenamento.
            </p>
          ) : inspectionData.hruTipo === 'REUTILIZÁVEL' ? (
            <p>
              HRU <strong>reutilizável</strong> — verificar o mecanismo e o serviço periódico conforme o manual do
              fabricante antes de voltar a ser colocado em serviço.
            </p>
          ) : (
            <p>Confirme o tipo de HRU e a ponta fracável (weak link) do painter — 2,2 ± 0,4 kN (LSA Code 4.1.6.2).</p>
          )}
        </div>
        </>
        )}
      </div>}

      {/* Luzes do Coberto & Baterias */}
      <div className="border border-slate-200 rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-amber-50 p-2 rounded-lg text-amber-600">
            <BatteryFull size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">Luzes do Coberto & Baterias</h3>
            <p className="text-xs text-slate-500">Estado sincronizado com o checklist (passo 2). Registe validade e voltagem medidas.</p>
          </div>
        </div>

        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Indique, por luz, se está instalada na jangada</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { itemId: 'luz_exterior_bateria', label: 'Coberto Exterior', item: luzExteriorItem, statusCheck: luzExteriorStatus },
            { itemId: 'luz_interior_bateria', label: 'Coberto Interior', item: luzInteriorItem, statusCheck: luzInteriorStatus },
          ].map(({ itemId, label, item, statusCheck }) => {
            const installed = !['NA', 'N/A'].includes(String(item.status || '').toUpperCase());
            const setLightInstalled = (v: boolean) => {
              const current = inspectionData.checklist?.[itemId] || {};
              setInspectionData({
                checklist: {
                  ...(inspectionData.checklist || {}),
                  [itemId]: { ...current, status: v ? 'OK' : 'NA' },
                },
              });
            };
            return (
            <div key={itemId} className={`rounded-xl border p-4 space-y-3 ${installed ? 'border-slate-200' : 'border-slate-200 bg-slate-50 opacity-75'}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-slate-800">Luz — {label}</p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setLightInstalled(true)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${installed ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white border-slate-200 text-slate-500 hover:border-emerald-300'}`}>
                    👍 Sim
                  </button>
                  <button
                    type="button"
                    onClick={() => setLightInstalled(false)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${!installed ? 'bg-slate-200 border-slate-300 text-slate-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                    🚫 Não
                  </button>
                </div>
              </div>
              {!installed ? (
                <p className="text-xs text-slate-400 italic">Jangada sem esta luz instalada — não aplicável.</p>
              ) : (<>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Artigo de Stock (luz/bateria)</label>
                <StockPickerSelect
                  allowDeficit
                  items={lightStock}
                  nextInspection={inspectionData.dataProxInspecao}
                  value={item.stockId || ""}
                  onSelect={(s) => handleLightStockSelect(itemId, String(s.id))}
                  placeholder="Selecionar luz/bateria do armazém..."
                  emptyMessage="Nenhuma luz/bateria disponível no stock"
                  showValidade
                />
              </div>
              {item.referencia && (
                <p className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
                  <Tag size={12} className="shrink-0 text-slate-400" />
                  {item.referencia}
                </p>
              )}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Estado da luz/bateria</label>
                <select
                  value={item.status || ''}
                  onChange={(e) => updateLightItem(itemId, 'status', e.target.value)}
                  className="w-full border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:bg-white text-sm transition-colors font-medium"
                >
                  <option value="" disabled>Selecionar estado...</option>
                  {LIGHT_STATUS_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt === 'OK' ? 'Bom Estado' : opt === 'SUBSTITUIDO' ? 'Substituída' : opt === 'REPROVADO' ? 'Reprovada' : 'N/A'}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Validade da bateria / luz</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="MM/AAAA"
                  maxLength={7}
                  value={item.validade || ''}
                  onChange={(e) => updateLightItem(itemId, 'validade', maskMonthYearInput(e.target.value))}
                  className={`w-full border rounded-xl px-3 py-2.5 bg-slate-50 focus:bg-white text-sm transition-colors ${
                    statusCheck === 'expired'
                      ? 'border-red-300 ring-2 ring-red-100 bg-red-50 text-red-900'
                      : 'border-slate-200'
                  }`}
                />
              </div>
              {statusCheck === 'expired' && (
                <p className="text-[11px] font-semibold text-red-700 flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
                  <AlertTriangle size={13} className="shrink-0 text-red-500" />
                  Bateria expirada ({formatMonthPt(item.validade)}) — substituir.
                </p>
              )}
              <ArticleExpiryResolution name={label} validade={item.validade} nextInspection={inspectionData.dataProxInspecao} replaced={item.status === 'SUBSTITUIDO'} reason={item.justificacaoNaoSubstituicao} onReasonChange={value => updateLightItem(itemId, 'justificacaoNaoSubstituicao', value)} />
              </>)}
            </div>
            );
          })}
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 leading-relaxed">
          <p>
            Baterias <strong>sem data</strong>: substituir anualmente. Com <strong>data</strong>: substituir até a
            expiração. Baterias de ativação por água (water-activated): substituir sempre que forem ativadas
            (46 CFR 28.140; LSA Code 4.1.3.3 — luz exterior 50–70 flashes/min, ≥ 12 h; luz interior ≥ 12 h).
            Verificar a voltagem medida antes do acondicionamento.
          </p>
        </div>
      </div>

      {componentes.length === 0 ? (
        <div className="border-2 border-dashed border-slate-200 bg-slate-50 rounded-2xl p-12 flex flex-col items-center justify-center text-center">
          <WrenchIcon className="w-12 h-12 text-slate-300 mb-3" />
          <h3 className="text-lg font-semibold text-slate-700 mb-1">Nenhum componente registado</h3>
          <p className="text-sm text-slate-500 max-w-md">
            Clique no botão acima para adicionar válvulas, mangueiras ou cabeças operacionais substituídas durante a revisão desta jangada.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
           {componentes.map((comp: any) => {
            const expiryControlled = isComponentExpiryControlled(comp);
            const isWarning = expiryControlled && getArticleExpiryStatus(comp.validade, inspectionData.dataProxInspecao) !== 'ok';
            return (
              <div key={comp.id} className="border border-slate-200 rounded-2xl bg-white p-6 shadow-sm relative group transition-all hover:border-indigo-200 hover:shadow-md">
              <button 
                onClick={() => removeComponent(comp.id)}
                className="absolute top-4 right-4 p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                title="Remover componente"
              >
                <Trash2 size={18} />
              </button>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="col-span-1 md:col-span-2 lg:col-span-1 space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Tipo de Componente</label>
                  <select 
                    value={comp.type}
                    onChange={(e) => updateComponent(comp.id, 'type', e.target.value)}
                    className="w-full border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:bg-white text-sm transition-colors font-medium"
                  >
                    {COMPONENT_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                   </select>
                   <label className="flex items-center gap-2 text-xs text-slate-600">
                     <input type="checkbox" checked={expiryControlled} onChange={event => updateComponent(comp.id, 'expiryControlled', event.target.checked)} />
                     Artigo com validade
                   </label>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Referência (P/N) do Stock</label>
                  <StockPickerSelect
                    allowDeficit
                    items={componentStock}
                    nextInspection={inspectionData.dataProxInspecao}
                    value={comp.stockId || ""}
                    onSelect={(s) => handleStockSelect(comp.id, String(s.id))}
                    placeholder="Selecionar peça do armazém..."
                    emptyMessage="Nenhum artigo de stock disponível para esta categoria"
                    showValidade={expiryControlled}
                    showQuantity
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">{expiryControlled ? 'Lote / Nº Série' : 'N.º de Série'}</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Hash size={14} className="text-slate-400" />
                    </div>
                    <input 
                      type="text" 
                      placeholder={expiryControlled ? 'Ex: L123 / SN456' : 'Ex: SN456'}
                      value={comp.serialLote}
                      onChange={(e) => updateComponent(comp.id, 'serialLote', e.target.value)}
                      className="w-full border-slate-200 rounded-xl pl-9 pr-3 py-2.5 bg-slate-50 focus:bg-white text-sm transition-colors"
                    />
                  </div>
                </div>

                {expiryControlled && <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Validade</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Calendar size={14} className="text-slate-400" />
                    </div>
                    <input 
                      type="text" 
                      inputMode="numeric"
                      placeholder="MM/AAAA"
                      maxLength={7}
                       value={comp.validade || ''}
                      onChange={(e) => updateComponent(comp.id, 'validade', maskMonthYearInput(e.target.value))}
                      className={`w-full border rounded-xl pl-9 pr-3 py-2.5 bg-slate-50 focus:bg-white text-sm transition-colors ${
                        isWarning
                          ? 'border-amber-300 ring-2 ring-amber-100 bg-amber-50 focus:ring-amber-200 text-amber-900'
                          : 'border-slate-200'
                      }`}
                    />
                    {isWarning && (
                      <p className="text-[10px] text-amber-700 font-semibold mt-1">
                         {getArticleExpiryReason(comp.validade, inspectionData.dataProxInspecao)}
                      </p>
                    )}
                    {getLongValidity(comp) !== null && (
                      <div className="mt-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5">
                        <p className="text-[10px] font-bold text-amber-800 leading-snug">
                          Validade superior ao intervalo de inspeção ({getInspectionIntervalLabel(inspectionData.brand, inspectionData.model, inspectionData.shipDetails)}). Confirme que este componente foi efetivamente substituído.
                        </p>
                        <label className="flex items-center gap-1.5 mt-1 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={String(comp.estado || '').toUpperCase() === 'DANIFICADO'}
                            onChange={(e) => updateComponent(comp.id, 'estado', e.target.checked ? 'DANIFICADO' : '')}
                            className="rounded border-slate-300 text-amber-700 focus:ring-amber-500"
                          />
                          <span className="text-[10px] font-semibold text-amber-900">Componente danificado (substituído com justificação)</span>
                        </label>
                      </div>
                    )}
                  </div>
                </div>}
              </div>
              <label className="mt-3 block text-sm"><input type="checkbox" checked={comp.estado === 'SUBSTITUIDO'} onChange={e => updateComponent(comp.id, 'estado', e.target.checked ? 'SUBSTITUIDO' : '')} /> Componente efetivamente substituído</label>
              {expiryControlled && <ArticleExpiryResolution name={comp.type || comp.id} validade={comp.validade} nextInspection={inspectionData.dataProxInspecao} replaced={comp.estado === 'SUBSTITUIDO'} reason={comp.justificacaoNaoSubstituicao} onReasonChange={value => updateComponent(comp.id, 'justificacaoNaoSubstituicao', value)} />}
            </div>
          )})}
        </div>
      )}
    </div>
  );
}

function WrenchIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}
