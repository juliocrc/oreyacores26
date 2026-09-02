"use client";
import React from 'react';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import { Plus, Trash2, Tag, Calendar, Hash, Info } from 'lucide-react';
import { raftModelData } from '../rafts/raftModelData';
import { getInspectionIntervalYears, getInspectionIntervalLabel, getSubstitutionMaxValidityDays } from '../rafts/inspectionInterval';

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
  const { inspectionData, setInspectionData } = useJangadaWizardStore();

  const componentes = inspectionData.componentes || [];

  React.useEffect(() => {
    if (componentes.length === 0 && inspectionData.brand && inspectionData.model && !inspectionData.hasAutoFilledComponents) {
      const brandKey = inspectionData.brand.toUpperCase();
      const brandData = raftModelData[brandKey];
      
      if (brandData) {
        const modelData = brandData.find(m => 
          m.name.toUpperCase() === inspectionData.model.toUpperCase() ||
          m.aliases?.map(a => a.toUpperCase()).includes(inspectionData.model.toUpperCase())
        );

        if (modelData && (modelData.serviceItems || modelData.spareParts)) {
          const autoComponents: any[] = [];
          let idCounter = Date.now();
          
          if (modelData.serviceItems) {
            modelData.serviceItems.forEach(item => {
              autoComponents.push({
                id: (idCounter++).toString(),
                type: item.name,
                reference: item.reference || '',
                serialLote: '',
                validade: '',
                isAuto: true,
                category: item.category || 'SERVIÇO',
                notes: item.notes
              });
            });
          }
          
          if (modelData.spareParts) {
            modelData.spareParts.forEach(item => {
              autoComponents.push({
                id: (idCounter++).toString(),
                type: item.name,
                reference: item.reference || '',
                serialLote: '',
                validade: '',
                isAuto: true,
                category: item.category || 'SPARE',
                notes: item.notes
              });
            });
          }
          
          if (autoComponents.length > 0) {
            setInspectionData({ 
              componentes: autoComponents,
              hasAutoFilledComponents: true 
            });
          }
        }
      }
    }
  }, [inspectionData.brand, inspectionData.model, componentes.length, inspectionData.hasAutoFilledComponents, setInspectionData]);

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

  const updateComponent = (id: string, field: string, value: string) => {
    setInspectionData({
      componentes: componentes.map((c: any) => 
        c.id === id ? { ...c, [field]: value } : c
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
    const [vYear, vMonth] = String(comp.validade ?? "").split('-').map(Number);
    const valDate = new Date(vYear, (vMonth || 1) - 1, 1);
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
            validade: stockItem.validade || c.validade,
            serialLote: stockItem.lote || c.serialLote
          } : c
        )
      });
    }
  };

  // Filter stock for components
  const componentStock = (inspectionData.globalStock || []).filter((s: any) => {
    const cat = (s.categoria || '').toUpperCase();
    const desc = (s.descricao || '').toLowerCase();
    return cat.includes('VALV') || cat.includes('CILINDRO') || cat.includes('MANGUEIRA') ||
      cat.includes('COMPONENTE') || cat.includes('BEXIGA') || cat.includes('GASKET') ||
      cat.includes('OP_HEAD') || cat.includes('BOBBIN') || cat.includes('TUBO') ||
      desc.includes('valvula') || desc.includes('valve') || desc.includes('hose') ||
      desc.includes('mangueira') || desc.includes('operating head') || desc.includes('cabeca') ||
      desc.includes('cylinder') || desc.includes('cilindro') || desc.includes('o-ring') ||
      desc.includes('gasket') || desc.includes('vedante') || desc.includes('tubo');
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">3. Componentes Críticos & Válvulas</h2>
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
            const warningStatus = checkValidityWarning(
              comp.validade,
              inspectionData.dataProxInspecao,
              inspectionData.dataInspecao,
              inspectionData.brand,
              inspectionData.shipDetails
            );
            const isWarning = warningStatus === 'warning';
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
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Referência (P/N) do Stock</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Tag size={14} className="text-slate-400" />
                    </div>
                    {componentStock.length > 0 ? (
                    <select 
                      value={comp.stockId || ""}
                      onChange={(e) => handleStockSelect(comp.id, e.target.value)}
                      className="w-full border-slate-200 rounded-xl pl-9 pr-3 py-2.5 bg-slate-50 focus:bg-white text-sm transition-colors"
                    >
                      <option value="" disabled>Selecionar peça do armazém...</option>
                      {componentStock.map((s: any) => (
                        <option key={s.id} value={s.id}>
                          {s.referencia} - {s.descricao} {s.quantidade > 0 ? `(Qtd: ${s.quantidade})` : '(Sem Stock)'}
                        </option>
                      ))}
                    </select>
                    ) : (
                    <div className="w-full border border-dashed border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 text-xs text-slate-400 italic">
                      Nenhum artigo de stock disponível para esta categoria
                    </div>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Lote / Nº Série</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Hash size={14} className="text-slate-400" />
                    </div>
                    <input 
                      type="text" 
                      placeholder="Ex: L123 / SN456"
                      value={comp.serialLote}
                      onChange={(e) => updateComponent(comp.id, 'serialLote', e.target.value)}
                      className="w-full border-slate-200 rounded-xl pl-9 pr-3 py-2.5 bg-slate-50 focus:bg-white text-sm transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Validade</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Calendar size={14} className="text-slate-400" />
                    </div>
                    <input 
                      type="month" 
                      value={comp.validade}
                      onChange={(e) => updateComponent(comp.id, 'validade', e.target.value)}
                      className={`w-full border rounded-xl pl-9 pr-3 py-2.5 bg-slate-50 focus:bg-white text-sm transition-colors ${
                        isWarning
                          ? 'border-amber-300 ring-2 ring-amber-100 bg-amber-50 focus:ring-amber-200 text-amber-900'
                          : 'border-slate-200'
                      }`}
                    />
                    {isWarning && (
                      <p className="text-[10px] text-amber-700 font-semibold mt-1">
                        ⚠️ Sugere-se substituir (val. inferior a {getInspectionIntervalLabel(inspectionData.brand, inspectionData.model, inspectionData.shipDetails)})
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
                </div>
              </div>
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
