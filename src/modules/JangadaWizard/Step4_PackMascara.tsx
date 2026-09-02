"use client";
import React, { useMemo } from 'react';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import { Package, ShieldAlert, Zap, Droplets, Flame, Stethoscope, Info, PackageSearch, X } from 'lucide-react';
import { getMandatoryPackItemsForRaft, findMatchingArticleForPackItem } from '../rafts/mandatoryPack';
import { isRationArticle } from '@/config/packTemplates';
import { formatValidityDisplay } from '@/lib/date-display';
import { getInspectionIntervalYears, getInspectionIntervalLabel, getSubstitutionMaxValidityDays } from '../rafts/inspectionInterval';

const toMonthYearFormat = (dateStr?: string | null) => {
  if (!dateStr) return '';
  const trimmed = String(dateStr).trim();

  const mmYyyy = trimmed.match(/^(\d{1,2})\/(\d{4})$/);
  if (mmYyyy) {
    const month = Number(mmYyyy[1]);
    const year = Number(mmYyyy[2]);
    if (month >= 1 && month <= 12) return `${String(month).padStart(2, '0')}/${year}`;
  }

  const yyyyMm = trimmed.match(/^(\d{4})-(\d{1,2})/);
  if (yyyyMm) {
    const month = Number(yyyyMm[2]);
    const year = Number(yyyyMm[1]);
    if (month >= 1 && month <= 12) return `${String(month).padStart(2, '0')}/${year}`;
  }

  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const parseMonthYear = (dateStr: string): { year: number; month: number } | null => {
  if (!dateStr) return null;
  const trimmed = String(dateStr).trim();

  const mmYyyy = trimmed.match(/^(\d{1,2})\/(\d{4})$/);
  if (mmYyyy) {
    const month = Number(mmYyyy[1]);
    const year = Number(mmYyyy[2]);
    if (year > 0 && month >= 1 && month <= 12) return { year, month };
  }

  const yyyyMm = trimmed.match(/^(\d{4})-(\d{1,2})$/);
  if (yyyyMm) {
    const year = Number(yyyyMm[1]);
    const month = Number(yyyyMm[2]);
    if (year > 0 && month >= 1 && month <= 12) return { year, month };
  }

  return null;
};

const maskMonthYearInput = (raw: string) => {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 6);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
};

const getStockCandidatesForLabel = (globalStock: any[], label: string) => {
  const queryDesc = (label || '').toLowerCase();
  const firstWord = queryDesc.split(' ')[0];
  return (globalStock || [])
    .filter((s: any) => s.quantidade > 0)
    .filter((s: any) => {
      const stockDesc = (s.descricao || '').toLowerCase();
      const refDesc = (s.referencia || '').toLowerCase();
      return stockDesc.includes(firstWord) ||
             refDesc.includes(firstWord) ||
             (s.categoria && s.categoria === 'PACK');
    });
};

const getStockAvailableForLabel = (globalStock: any[], label: string) => {
  return getStockCandidatesForLabel(globalStock, label).reduce(
    (sum, s: any) => sum + (s.quantidade || 0),
    0
  );
};

function getDaysRemaining(validadeStr: string, refDate: Date): number | null {
  const parsed = parseMonthYear(validadeStr);
  if (!parsed) return null;
  const expDate = new Date(parsed.year, parsed.month - 1, 1);
  const diffTime = expDate.getTime() - refDate.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

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
  
  const vParsed = parseMonthYear(validadeStr);
  if (!vParsed) return null;
  const valDate = new Date(vParsed.year, vParsed.month - 1, 1);
  
  const [pYear, pMonth] = refDateStr.split('-').map(Number);
  const proxDate = new Date(pYear, (pMonth || 1) - 1, 1);
  
  if (isNaN(valDate.getTime()) || isNaN(proxDate.getTime())) return null;
  
  if (valDate < proxDate) {
    return 'warning';
  }
  return 'ok';
};

const PACK_ICONS: Record<string, any> = {
  'agua': Droplets,
  'racoes': Package,
  'farmacia': Stethoscope,
  'comprimidos': ShieldAlert,
  'paraquedas': Flame,
  'fachos': Flame,
  'fumo': Flame,
  'pilhas': Zap,
};

const PACK_COLORS: Record<string, string> = {
  'agua': 'text-blue-500 bg-blue-50',
  'racoes': 'text-amber-600 bg-amber-50',
  'farmacia': 'text-emerald-600 bg-emerald-50',
  'comprimidos': 'text-teal-600 bg-teal-50',
  'paraquedas': 'text-red-500 bg-red-50',
  'fachos': 'text-orange-500 bg-orange-50',
  'fumo': 'text-slate-600 bg-slate-100',
  'pilhas': 'text-yellow-600 bg-yellow-50',
};

export default function Step4_PackMascara() {
  const { inspectionData, setInspectionData } = useJangadaWizardStore();

  const packItems = inspectionData.packItems || {};

  const refDate = React.useMemo(
    () => (inspectionData.dataInspecao ? new Date(inspectionData.dataInspecao) : new Date()),
    [inspectionData.dataInspecao]
  );

  // Calcular itens obrigatórios baseados na jangada atual
  const mandatoryItems = useMemo(() => {
    return getMandatoryPackItemsForRaft({
      brand: inspectionData.brand,
      model: inspectionData.model,
      packType: inspectionData.packType,
      capacity: inspectionData.capacity as number,
    });
  }, [inspectionData.brand, inspectionData.model, inspectionData.packType, inspectionData.capacity]);

  
  React.useEffect(() => {
    const upperPack = String(inspectionData.packType || '').toUpperCase().trim();
    const isRestrictedPack = upperPack === 'R' || upperPack === 'E' || upperPack === 'SOLAS B' || upperPack.includes('R') || upperPack.includes('E') || upperPack.includes('SOLAS B') || upperPack.includes('REDUZIDO');
    if (isRestrictedPack && packItems) {
      let changed = false;
      const nextPackItems = { ...packItems };
      for (const key of Object.keys(nextPackItems)) {
        if (isRationArticle(nextPackItems[key]?.name)) {
          delete nextPackItems[key];
          changed = true;
        }
      }
      if (changed) {
        setInspectionData({ packItems: nextPackItems });
      }
    }
  }, [inspectionData.packType, packItems, setInspectionData]);

  React.useEffect(() => {
    if (mandatoryItems.length > 0 && (!packItems || Object.keys(packItems).length === 0)) {
      const initialPackItems: any = {};
      mandatoryItems.forEach(item => {
        const matched = findMatchingArticleForPackItem(item, (inspectionData.artigos || []) as any[]) as any;
        initialPackItems[item.checklistName] = {
          checklistName: item.checklistName,
          name: item.label,
          descricao: item.label,
          quantidade: item.quantity,
          quantidadeVerificada: matched ? matched.quantidade : 0,
          validade: matched ? toMonthYearFormat(matched.validade) : '',
          validadeOriginal: matched ? toMonthYearFormat(matched.validade) : '',
          lote: matched ? matched.codigoFabricante || matched.referencia || '' : '',
          referencia: matched ? matched.referencia : '',
          stockId: matched ? matched.id : undefined,
        };
      });
      setInspectionData({ packItems: initialPackItems });
    }
  }, [mandatoryItems, packItems, setInspectionData, inspectionData.artigos]);

  const updateItem = (referenciaStr: string, field: string, value: string) => {
    const updated = { ...packItems };
    for (const key of Object.keys(updated)) {
      if (updated[key].referencia === referenciaStr) {
        updated[key] = { ...updated[key], [field]: value };
      }
    }
    setInspectionData({ packItems: updated });
  };

  const [stockDialogKey, setStockDialogKey] = React.useState<string | null>(null);

  const applyStockItem = (key: string, stockItem: any) => {
    if (!stockItem) return;
    setInspectionData({
      packItems: {
        ...packItems,
        [key]: {
          ...(packItems[key] || {}),
          referencia: stockItem.referencia,
          stockId: stockItem.id,
          descricao: stockItem.descricao || packItems[key]?.descricao,
          validade: toMonthYearFormat(stockItem.validade) || packItems[key]?.validade || '',
          lote: stockItem.lote || '',
        },
      },
    });
    setStockDialogKey(null);
  };

  const clearStock = (key: string) => {
    const updated = { ...packItems };
    const current = { ...(updated[key] || {}) };
    delete current.stockId;
    updated[key] = current;
    setInspectionData({ packItems: updated });
  };

  const isDamagedItem = (item: any) => String(item.estado || '').toUpperCase() === 'DANIFICADO';

  const getSubstitutionBlockReason = (item: any) => {
    if (isDamagedItem(item)) return null;
    if (!item?.validadeOriginal) return null;
    const maxDays = getSubstitutionMaxValidityDays(inspectionData.brand, inspectionData.model, inspectionData.shipDetails);
    const days = getDaysRemaining(item.validadeOriginal, refDate);
    if (days === null || days <= maxDays) return null;
    return days;
  };

  const handleItemChange = (itemId: string, field: string, value: any) => {
    const current = packItems[itemId] || {};

    if (field === 'quantidade') {
      const newQty = Number(value) || 0;
      if (newQty > 0 && getSubstitutionBlockReason(current) !== null) return;
      setInspectionData({
        packItems: { ...packItems, [itemId]: { ...current, quantidade: newQty } },
      });
      return;
    }

    if (field === 'estado') {
      const newEstado = value ? 'DANIFICADO' : '';
      const next = { ...current, estado: newEstado };
      if (newEstado === '' && (Number(current.quantidade) || 0) > 0 && getSubstitutionBlockReason(current) !== null) {
        next.quantidade = 0;
      }
      setInspectionData({ packItems: { ...packItems, [itemId]: next } });
      return;
    }

    setInspectionData({
      packItems: { ...packItems, [itemId]: { ...current, [field]: value } }
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">4. Pack de Emergência</h2>
        <p className="text-slate-600 mt-1">Registe as validades e quantidades dos consumíveis obrigatórios da jangada.</p>
        <div className="mt-3 flex items-center gap-2 bg-indigo-50 text-indigo-700 px-3 py-2 rounded-lg text-sm font-medium w-fit border border-indigo-100">
          <Info size={16} />
          A mostrar requisitos para: {inspectionData.packType || 'Pack não definido'} / {inspectionData.capacity || '0'} Pax
        </div>
        {(() => {
          const insufficientItems = mandatoryItems.filter((item) => {
            const data = packItems[item.checklistName] || {};
            const qty = data.quantidade || 0;
            return qty > 0 && qty > getStockAvailableForLabel(inspectionData.globalStock, item.label);
          });
          if (insufficientItems.length === 0) return null;
          return (
            <div className="mt-3 flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3">
              <ShieldAlert className="text-red-600 shrink-0 mt-0.5" size={20} />
              <div>
                <p className="text-sm font-bold text-red-800">
                  {insufficientItems.length} artigo{insufficientItems.length === 1 ? '' : 's'} com stock insuficiente
                </p>
                <p className="text-xs text-red-700 mt-0.5">
                  {insufficientItems.map((item) => item.label).join(' · ')} — quantidade substituída excede o stock disponível.
                </p>
              </div>
            </div>
          );
        })()}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-12 gap-4 bg-slate-50 px-6 py-4 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
          <div className="col-span-12 lg:col-span-4">Artigo de Emergência</div>
          <div className="col-span-6 lg:col-span-2 text-center">Obrigatório</div>
          <div className="col-span-6 lg:col-span-3 text-center">Verificado / Substituído</div>
          <div className="col-span-12 lg:col-span-3">Nova Validade / Lote</div>
        </div>

        <div className="divide-y divide-slate-100">
          {mandatoryItems.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              Configure o "Tipo de Pack" e "Capacidade" no Passo 1 para ver os itens obrigatórios.
            </div>
          ) : (
            mandatoryItems.map((item) => {
              const simpleKey = item.checklistName.replace('validade_', '').replace('foguetoes_', '').replace('_alimentares', '').replace('_mao', '').replace('_lanterna', '').replace('_enjoo', '');
              const icon = PACK_ICONS[simpleKey] || Package;
              const color = PACK_COLORS[simpleKey] || 'text-indigo-600 bg-indigo-50';
              const IconComponent = icon;

              const data = packItems[item.checklistName] || { quantidadeVerificada: 0, quantidade: 0, lote: '', validade: '' };
              const isDamaged = isDamagedItem(data);
              const blockReasonDays = getSubstitutionBlockReason(data);
              const warningStatus = checkValidityWarning(
                data.validade || '',
                inspectionData.dataProxInspecao,
                inspectionData.dataInspecao,
                inspectionData.brand,
                inspectionData.shipDetails
              );
              const isWarning = warningStatus === 'warning';
              
              return (
                <div key={item.checklistName} className="grid grid-cols-12 gap-4 px-6 py-5 items-center hover:bg-slate-50/50 transition-colors">
                  <div className="col-span-12 lg:col-span-4 flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${color}`}>
                      <IconComponent size={20} />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 flex items-center gap-2">
                        {item.label}
                        {data.quantidade > 0 && (
                          <span className="inline-flex items-center text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                            ✓ Substituído
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">{item.category}</p>
                      {data.validadeOriginal && (() => {
                        const parts = data.validadeOriginal.split('-').map(Number);
                        const vYear = parts[0] || new Date().getFullYear();
                        const vMonth = parts[1] || 1;
                        const expDate = new Date(vYear, vMonth - 1, 1);
                        const insDate = new Date(inspectionData.dataInspecao || Date.now());
                        const diffDays = Math.ceil((expDate.getTime() - insDate.getTime()) / (1000 * 60 * 60 * 24));
                        const isExpired = diffDays < 0;
                        const isNearExpiry = diffDays <= 60;
                        return (
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                            <span className={`px-2 py-0.5 rounded-md font-bold flex items-center gap-1 ${
                              isExpired ? 'bg-red-100 text-red-800 border border-red-200' :
                              isNearExpiry ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                              'bg-slate-100 text-slate-700'
                            }`}>
                              <span>Anterior: {data.validadeOriginal}</span>
                              {isExpired && <span>(Caducado)</span>}
                              {isNearExpiry && !isExpired && <span>(A caducar)</span>}
                            </span>
                            {(isExpired || isNearExpiry) && data.quantidade === 0 && (
                              <button
                                type="button"
                                onClick={() => handleItemChange(item.checklistName, 'quantidade', item.quantity || 1)}
                                className="text-[10px] font-extrabold px-2 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md shadow-sm transition"
                              >
                                Substituir Agora
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  
                  <div className="col-span-6 lg:col-span-2 flex justify-center">
                    <div className="bg-slate-100 px-3 py-1.5 rounded-lg text-slate-700 font-semibold text-sm w-fit border border-slate-200">
                      {item.quantityLabel}
                    </div>
                  </div>

                  <div className="col-span-6 lg:col-span-3 flex flex-col gap-1.5">
                    <div className="flex gap-2">
                      <div className="w-1/2">
                        <label className="text-[10px] uppercase text-slate-400 font-bold mb-1 block lg:hidden">Verificado</label>
                        <input
                          type="number"
                          min="0"
                          placeholder="Verif."
                          value={data.quantidadeVerificada || ''}
                          onChange={(e) => handleItemChange(item.checklistName, 'quantidadeVerificada', parseInt(e.target.value) || 0)}
                          className="w-full text-sm border-slate-200 rounded-xl px-2 py-2 bg-white focus:ring-2 focus:ring-indigo-100 transition-colors"
                          title="Quantidade Verificada"
                        />
                      </div>
                      <div className="w-1/2">
                        <label className="text-[10px] uppercase text-slate-400 font-bold mb-1 block lg:hidden">Substituído</label>
                        <input
                          type="number"
                          min="0"
                          placeholder="Subst."
                          value={data.quantidade || ''}
                          onChange={(e) => handleItemChange(item.checklistName, 'quantidade', parseInt(e.target.value) || 0)}
                          className={`w-full text-sm rounded-xl px-2 py-2 bg-white focus:ring-2 transition-colors ${
                            data.quantidade > 0 && (data.quantidade || 0) > getStockAvailableForLabel(inspectionData.globalStock, item.label)
                              ? 'border-red-300 ring-2 ring-red-100 bg-red-50'
                              : 'border-slate-200 focus:ring-indigo-100'
                          }`}
                          title="Quantidade Substituída"
                        />
                      </div>
                    </div>
                    <label className="flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isDamaged}
                        onChange={(e) => handleItemChange(item.checklistName, 'estado', e.target.checked ? 'DANIFICADO' : '')}
                        className="rounded border-slate-300 text-red-600 focus:ring-red-500"
                      />
                      <span className={isDamaged ? 'text-red-700' : 'text-slate-600'}>Danificado</span>
                    </label>
                    {blockReasonDays !== null && (
                      isDamaged ? (
                        <div className="flex items-start gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-800">
                          <ShieldAlert size={14} className="shrink-0 mt-0.5" />
                          <span className="leading-snug">Substituição permitida — artigo marcado como danificado.</span>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800">
                          <ShieldAlert size={14} className="shrink-0 mt-0.5" />
                          <span className="leading-snug">
                            Validade original superior a {getInspectionIntervalLabel(inspectionData.brand, inspectionData.model, inspectionData.shipDetails)} (expira em {blockReasonDays} dias). Só é possível substituir se marcar o artigo como <b>Danificado</b>.
                          </span>
                        </div>
                      )
                    )}
                    {(() => {
                      const selectedStock = data.stockId
                        ? (inspectionData.globalStock || []).find((s: any) => s.id === data.stockId)
                        : null;
                      const selectedStockAvailable = selectedStock?.quantidade || 0;
                      const totalAvailable = getStockAvailableForLabel(inspectionData.globalStock, item.label);
                      const qty = data.quantidade || 0;
                      const insufficientTotal = qty > 0 && qty > totalAvailable;
                      const insufficientSelected = selectedStock && qty > 0 && qty > selectedStockAvailable;
                      if (!insufficientTotal && !insufficientSelected) return null;
                      return (
                        <div className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-[11px] font-bold ${
                          insufficientSelected
                            ? 'border-red-300 bg-red-50 text-red-800'
                            : 'border-amber-300 bg-amber-50 text-amber-800'
                        }`}>
                          <ShieldAlert size={14} className="shrink-0 mt-0.5" />
                          <div className="leading-snug">
                            {insufficientSelected && selectedStock
                              ? <>Stock insuficiente no lote {selectedStock.lote || selectedStock.referencia}: disponível {selectedStockAvailable}, necessita {qty}.</>
                              : <>Stock insuficiente: disponível {totalAvailable}, necessita {qty}.</>}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="col-span-12 lg:col-span-3 flex flex-col gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Lote no Stock (Opcional)</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setStockDialogKey(item.checklistName)}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors border ${
                            data.stockId
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-800'
                          }`}
                        >
                          <PackageSearch size={14} />
                          {data.stockId ? 'Alterar lote' : 'Substituir do Stock'}
                        </button>
                        {data.stockId && (
                          <button
                            type="button"
                            onClick={() => clearStock(item.checklistName)}
                            title="Remover seleção de stock"
                            className="px-2 py-2 rounded-lg text-xs font-bold text-slate-400 border border-slate-200 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                      {(() => {
                        const selectedStock = data.stockId
                          ? (inspectionData.globalStock || []).find((s: any) => s.id === data.stockId)
                          : null;
                        if (!selectedStock) return null;
                        const insufficient = data.quantidade > 0 && data.quantidade > selectedStock.quantidade;
                        return (
                          <div className="mt-1.5 text-[10px] leading-relaxed">
                            <p className="text-slate-500">
                              Ref: <b className="text-slate-700">{selectedStock.referencia}</b>
                              {selectedStock.lote ? ` · Lote: ${selectedStock.lote}` : ''}
                              {selectedStock.validade ? ` · Val: ${formatValidityDisplay(selectedStock.validade)}` : ''}
                            </p>
                            <p className={insufficient ? 'text-red-700 font-bold' : 'text-emerald-700 font-semibold'}>
                              {insufficient
                                ? `⚠️ Stock insuficiente — disponível: ${selectedStock.quantidade}`
                                : `✓ Disponível: ${selectedStock.quantidade}`}
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                    
                    <div className="flex gap-2">
                      <div className="w-1/2">
                        <label className="text-[10px] uppercase text-slate-400 font-bold mb-1 block">
                          Validade (MM/AAAA) {data.validade && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 ml-1"></span>}
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="MM/AAAA"
                          maxLength={7}
                          value={data.validade}
                          onChange={(e) => handleItemChange(item.checklistName, 'validade', maskMonthYearInput(e.target.value))}
                          className={`w-full text-sm rounded-xl px-2 py-2 bg-white focus:ring-2 transition-colors border ${
                            data.quantidade > 0 && !data.validade 
                              ? 'border-red-300 ring-2 ring-red-100 bg-red-50' 
                              : isWarning
                                ? 'border-amber-300 ring-2 ring-amber-100 bg-amber-50 focus:ring-amber-200 text-amber-900'
                                : 'border-slate-200 focus:ring-indigo-100'
                          }`}
                        />
                        {data.validade && (() => {
                          const refDate = inspectionData.dataInspecao ? new Date(inspectionData.dataInspecao) : new Date();
                          const days = getDaysRemaining(data.validade, refDate);
                          if (days === null) return null;
                          if (days < 0) return <p className="text-[9px] text-red-700 font-bold mt-1">⛔ Expirado há {Math.abs(days)} dias</p>;
                          if (days <= 30) return <p className="text-[9px] text-red-700 font-bold mt-1">⚠️ Expira em {days} dias</p>;
                          if (days <= 90) return <p className="text-[9px] text-amber-700 font-semibold mt-1">Expira em {days} dias</p>;
                          return <p className="text-[9px] text-emerald-700 font-medium mt-1">✓ Válido por {days} dias</p>;
                        })()}
                        {isWarning && (
                          <p className="text-[9px] text-amber-700 font-semibold mt-1 leading-tight">
                            ⚠️ Sugere-se substituir (val. inferior a {getInspectionIntervalLabel(inspectionData.brand, inspectionData.model, inspectionData.shipDetails)})
                          </p>
                        )}
                      </div>
                      <div className="w-1/2">
                        <label className="text-[10px] uppercase text-slate-400 font-bold mb-1 block">Lote Manual</label>
                        <input
                          type="text"
                          placeholder="Ex: A23"
                          value={data.lote}
                          onChange={(e) => handleItemChange(item.checklistName, 'lote', e.target.value)}
                          className="w-full text-sm border-slate-200 rounded-xl px-2 py-2 bg-white focus:ring-2 focus:ring-indigo-100 transition-colors"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 items-start">
        <ShieldAlert className="text-amber-600 shrink-0 mt-0.5" size={20} />
        <div>
          <h4 className="text-sm font-bold text-amber-900">Atenção Crítica de Validades</h4>
          <p className="text-xs text-amber-800 mt-1">A validade global da jangada será ditada pelo artigo de emergência que expirar primeiro. Certifique-se que nenhuma validade inserida expira antes da próxima revisão agendada.</p>
        </div>
      </div>

      {stockDialogKey && (() => {
        const dialogItem = mandatoryItems.find((i) => i.checklistName === stockDialogKey);
        const candidates = getStockCandidatesForLabel(inspectionData.globalStock, dialogItem?.label || '')
          .sort((a: any, b: any) => (b.quantidade || 0) - (a.quantidade || 0));

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setStockDialogKey(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Substituir do Stock</h3>
                  <p className="text-xs text-slate-500">{dialogItem?.label} — escolha o lote a aplicar</p>
                </div>
                <button
                  type="button"
                  onClick={() => setStockDialogKey(null)}
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-4 max-h-[50vh] overflow-y-auto space-y-2">
                {candidates.length === 0 ? (
                  <div className="text-center py-10 text-slate-500 text-sm">
                    <PackageSearch size={32} className="mx-auto mb-2 text-slate-300" />
                    Sem artigos de stock disponíveis para este item.
                  </div>
                ) : (
                  candidates.map((s: any) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => applyStockItem(stockDialogKey, s)}
                      className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 text-sm truncate">{s.referencia}</p>
                          <p className="text-xs text-slate-500 truncate">{s.descricao}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            Lote: {s.lote || 'N/A'}{s.validade ? ` · Validade: ${formatValidityDisplay(s.validade)}` : ''}
                          </p>
                        </div>
                        <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-lg ${
                          s.quantidade > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                        }`}>
                          {s.quantidade} disp.
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>

              <div className="px-6 py-3 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStockDialogKey(null)}
                  className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
