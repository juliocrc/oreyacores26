'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { appToast } from '@/lib/app-toast';
import { getRecognizedPackTypeOptions } from '@/config/packTemplates';
import { findRaftTechnicalModel, raftModelData } from '@/modules/rafts/raftModelData';
import {
  getMandatoryPackItemsForRaft,
  type MandatoryPackItem,
} from '@/modules/rafts/mandatoryPack';
import { QrCode, X, Calendar, AlertTriangle, Building2, MapPin } from 'lucide-react';
import DataTable, { type ColumnDef } from '@/components/shared/DataTable';
// Html5QrcodeScanner é carregado sob demanda dentro do efeito do scanner.
import { matchesSearch as matchesSearchTermo } from '@/lib/search';
import type {
  Jangada,
  JangadaCatalogOption,
  JangadaListColumnKey,
  PausedInspectionDraftMeta,
} from '@/types/jangadas-page';
import {
  INITIAL_FORM,
  FALLBACK_INFLATION_SYSTEM_OPTIONS,
  FIRING_HEAD_KEYWORDS,
  JANGADA_LIST_COLUMNS,
  JANGADA_LIST_COLUMNS_KEY,
} from '@/types/jangadas-page';
import {
  normalizeTechnicalSearchValue,
  buildDefaultJangadaColumns,
  getShortBulletinLabels,
  formatMonthYear,
  formatInspectionDate,
  isInspectionOverdue,
  isInspectionDueWithin30Days,
  isHydroTestOverdue,
  isHydroTestDueWithin30Days,
  isHruOverdue,
  isHruDueWithin30Days,
  isHruCritical,
  getArticleStatusSummary,
  calculateComplianceSummary,
  normalizeMonthYearValue,
  parseArticleValidityDate,
  addMonths,
  getUpcomingReplacementArticles,
  aggregateUpcomingReplacementArticles,
  getInspectionUrgencyRank,
  getPausedInspectionRank,
  loadPausedInspectionDraftsByRaft,
  formatPausedInspectionLabel,
  getInflationSystemLabel,
  hasAssociationValue,
  getJangadaAssociationTone,
  normalizeModelFilterKey,
  normalizeModelMatchKey,
  canonicalizeRaftModelLabel,
  uniqueNormalizedLabels,
  getArtigosStatus,
  normalizeLaunchTypeValue,
  normalizeCapacityValue,
  formatCapacityValue,
  getSuggestedLaunchType,
  getSuggestedPackType,
  getSuggestedCapacity,
} from '@/lib/jangadas-page-helpers';

const MONTH_NAMES_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

function getMonthKey(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(monthKey: string): string {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) return monthKey;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return monthKey;
  return `${MONTH_NAMES_PT[monthIndex]} ${year}`;
}

function renderBulletinBadges(jangada: Jangada, limit?: number) {
  const labels = getShortBulletinLabels(jangada, limit);
  if (!jangada.applicableServiceBulletinsCount) {
    return <span className="text-gray-400">—</span>;
  }

  return (
    <div className="space-y-1">
      <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
        {jangada.applicableServiceBulletinsCount} aplicável
        {jangada.applicableServiceBulletinsCount === 1 ? '' : 'eis'}
      </span>
      {labels.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {labels.map(label => (
            <span
              key={`${jangada.id}-${label}`}
              className="inline-flex rounded-full border border-amber-200 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-900"
            >
              {label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function renderHruUrgencyBadge(value?: string) {
  if (isHruOverdue(value)) {
    return (
      <span className="inline-flex rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
        HRU vencido
      </span>
    );
  }

  if (isHruDueWithin30Days(value)) {
    return (
      <span className="inline-flex rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
        HRU ≤ 30 dias
      </span>
    );
  }

  return null;
}

function renderConsumablesAlertBadge(j: Jangada) {
  const { expiredCount, upcomingCount } = getArticleStatusSummary(j);
  if (expiredCount === 0 && upcomingCount === 0) return null;

  return (
    <div className="flex flex-col gap-0.5 mt-0.5">
      {expiredCount > 0 && (
        <span className="inline-flex rounded-full border border-red-350 bg-red-50 px-2 py-0.5 text-[9px] font-bold text-red-700 uppercase">
          {expiredCount} expirado{expiredCount !== 1 ? 's' : ''}
        </span>
      )}
      {upcomingCount > 0 && (
        <span className="inline-flex rounded-full border border-amber-305 bg-amber-50 px-2 py-0.5 text-[9px] font-bold text-amber-700 uppercase">
          {upcomingCount} ≤ 12m
        </span>
      )}
    </div>
  );
}

function renderSemaforoStatus(j: Jangada) {
  const { expiredCount, upcomingCount } = getArticleStatusSummary(j);
  const totalArtigos = j.artigos?.length || 0;

  if (totalArtigos === 0) {
    return (
      <div className="flex items-center justify-center" title="Sem consumíveis registados">
        <span className="h-3.5 w-3.5 rounded-full bg-slate-200 border border-slate-300 inline-block shadow-inner" />
      </div>
    );
  }

  if (expiredCount > 0) {
    return (
      <div
        className="flex items-center justify-center"
        title={`${expiredCount} consumível(eis) expirado(s)`}
      >
        <span className="h-3.5 w-3.5 rounded-full bg-rose-500 border border-rose-600 inline-block shadow-md shadow-rose-200 animate-pulse" />
      </div>
    );
  }

  if (upcomingCount > 0) {
    return (
      <div
        className="flex items-center justify-center"
        title={`${upcomingCount} consumível(eis) a expirar em breve`}
      >
        <span className="h-3.5 w-3.5 rounded-full bg-amber-400 border border-amber-500 inline-block shadow-md shadow-amber-200" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center" title="Todos os consumíveis em dia">
      <span className="h-3.5 w-3.5 rounded-full bg-emerald-500 border border-emerald-600 inline-block shadow-md shadow-emerald-200" />
    </div>
  );
}

function renderInspectionUrgencyBadge(value?: string) {
  if (isInspectionOverdue(value)) {
    return (
      <span className="inline-flex rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
        GI vencida
      </span>
    );
  }

  if (isInspectionDueWithin30Days(value)) {
    return (
      <span className="inline-flex rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
        GI ≤ 30 dias
      </span>
    );
  }

  return null;
}

function renderHydroTestUrgencyBadge(value?: string) {
  if (isHydroTestOverdue(value)) {
    return (
      <span className="inline-flex rounded-full border border-rose-300 bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
        TH vencido
      </span>
    );
  }

  if (isHydroTestDueWithin30Days(value)) {
    return (
      <span className="inline-flex rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
        TH ≤ 30 dias
      </span>
    );
  }

  return null;
}

function renderPausedInspectionBadge(meta?: PausedInspectionDraftMeta) {
  if (!meta?.savedAt) return null;

  return (
    <span
      className="inline-flex rounded-full border border-sky-200 bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-800"
      title={`Inspeção pausada em ${formatPausedInspectionLabel(meta.savedAt)}`}
    >
      Inspeção pausada · {formatPausedInspectionLabel(meta.savedAt)}
      {typeof meta.inspectionWizardStep === 'number'
        ? ` · passo ${meta.inspectionWizardStep + 1}`
        : ''}
    </span>
  );
}

function renderAssociationDot(j: Jangada) {
  const tone = getJangadaAssociationTone(j);
  const cls =
    tone === 'green'
      ? 'bg-emerald-500'
      : tone === 'yellow'
        ? 'bg-yellow-400'
        : tone === 'red'
          ? 'bg-red-500'
          : 'bg-gray-300';
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${cls}`}
      title={
        tone === 'green'
          ? 'Cliente + Navio + Jangada'
          : tone === 'yellow'
            ? 'Jangada + Navio (sem cliente)'
            : tone === 'red'
              ? 'Jangada sem Navio e sem Cliente'
              : 'Associação indefinida'
      }
    />
  );
}

const NovaJangadaModal = React.memo(function NovaJangadaModal({
  form,
  setForm,
  editId,
  showWizard,
  onClose,
  onSubmit,
  wizardTab,
  setWizardTab,
  artigoValidades,
  setArtigoValidades,
  brandOptions,
  modelOptions,
  launchTypeOptions,
  packTypeOptions,
  capacityOptions,
  wizardPackItems,
  selectedTechnicalModel,
  handleChange,
  handleBatchFillValidade,
  handleClearValidades,
}: {
  form: Jangada;
  setForm: React.Dispatch<React.SetStateAction<Jangada>>;
  editId: number | null;
  showWizard: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  wizardTab: 'dados' | 'artigos';
  setWizardTab: (tab: 'dados' | 'artigos') => void;
  artigoValidades: Record<string, string>;
  setArtigoValidades: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  brandOptions: string[];
  modelOptions: string[];
  launchTypeOptions: string[];
  packTypeOptions: string[];
  capacityOptions: number[];
  wizardPackItems: MandatoryPackItem[];
  selectedTechnicalModel: any;
  handleChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  handleBatchFillValidade: (years: number) => void;
  handleClearValidades: () => void;
}) {
  if (!showWizard) return null;

  const artigoValidadesCount = Object.keys(artigoValidades).filter(label =>
    Boolean(artigoValidades[label]),
  ).length;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">
            {editId ? 'Editar Jangada' : 'Nova Jangada'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 font-bold p-1"
          >
            ✕
          </button>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          {!editId && (
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setWizardTab('dados')}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition ${wizardTab === 'dados' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Dados
              </button>
              <button
                type="button"
                onClick={() => setWizardTab('artigos')}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition ${wizardTab === 'artigos' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Validades dos artigos
                {artigoValidadesCount > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold px-1.5 py-0.5">
                    {artigoValidadesCount}
                  </span>
                )}
              </button>
            </div>
          )}
          {wizardTab === 'dados' || editId ? (
            <>
              <label className="block text-xs font-semibold text-gray-700">
                Marca
                <input
                  type="text"
                  list="jangada-brands-list"
                  name="brand"
                  value={form.brand}
                  onChange={e => {
                    const nextBrand = e.target.value;
                    setForm(prev => {
                      if (prev.brand === nextBrand) return prev;
                      return {
                        ...prev,
                        brand: nextBrand,
                        model: '',
                        launchType: '',
                        packType: '',
                        capacity: 0,
                      };
                    });
                  }}
                  placeholder="Ex: Survitec"
                  className="mt-1 border rounded-lg px-3 py-2 w-full bg-white"
                  required
                />
                <datalist id="jangada-brands-list">
                  {brandOptions.map(brand => (
                    <option key={brand} value={brand} />
                  ))}
                </datalist>
              </label>
              <label className="block text-xs font-semibold text-gray-700">
                Modelo
                <input
                  type="text"
                  list="jangada-models-list"
                  name="model"
                  value={form.model}
                  onChange={e => {
                    const nextModel = e.target.value;
                    setForm(prev => {
                      if (prev.model === nextModel) return prev;
                      return {
                        ...prev,
                        model: nextModel,
                        ...(editId
                          ? {}
                          : {
                              launchType: '',
                              packType: '',
                              capacity: 0,
                            }),
                      };
                    });
                  }}
                  placeholder={form.brand ? 'Ex: DL-25' : 'Selecione primeiro a marca'}
                  className="mt-1 border rounded-lg px-3 py-2 w-full bg-white"
                  required
                  disabled={!form.brand}
                />
                <datalist id="jangada-models-list">
                  {modelOptions.map(model => (
                    <option key={model} value={model} />
                  ))}
                </datalist>
              </label>
              <label className="block text-xs font-semibold text-gray-700">
                Nº de série
                <input
                  name="serial"
                  value={form.serial || ''}
                  onChange={handleChange}
                  placeholder="Serial da jangada"
                  className="mt-1 border rounded-lg px-3 py-2 w-full bg-white"
                  required
                />
              </label>
              <label className="block text-xs font-semibold text-gray-700">
                Tipo de lançamento
                <input
                  type="text"
                  list="jangada-launch-types-list"
                  name="launchType"
                  value={form.launchType || ''}
                  onChange={handleChange}
                  placeholder="Selecionar ou digitar tipo"
                  className="mt-1 border rounded-lg px-3 py-2 w-full bg-white"
                />
                <datalist id="jangada-launch-types-list">
                  {launchTypeOptions.map(launchType => (
                    <option key={launchType} value={launchType} />
                  ))}
                </datalist>
              </label>
              <label className="block text-xs font-semibold text-gray-700">
                Tipo de pack
                <input
                  type="text"
                  list="jangada-pack-types-list"
                  name="packType"
                  value={form.packType || ''}
                  onChange={handleChange}
                  placeholder="Selecionar ou digitar pack"
                  className="mt-1 border rounded-lg px-3 py-2 w-full bg-white"
                  required
                />
                <datalist id="jangada-pack-types-list">
                  {packTypeOptions.map(packType => (
                    <option key={packType} value={packType} />
                  ))}
                </datalist>
              </label>
              <label className="block text-xs font-semibold text-gray-700">
                Data de fabrico
                <input
                  name="dataFabrico"
                  type="month"
                  value={normalizeMonthYearValue(form.dataFabrico || '')}
                  onChange={handleChange}
                  className="mt-1 border rounded-lg px-3 py-2 w-full bg-white"
                  required
                />
              </label>
              <label className="block text-xs font-semibold text-gray-700">
                Lotação
                <input
                  type="number"
                  list="jangada-capacities-list"
                  name="capacity"
                  value={normalizeCapacityValue(form.capacity) ?? ''}
                  onChange={handleChange}
                  placeholder="Ex: 25"
                  className="mt-1 border rounded-lg px-3 py-2 w-full bg-white"
                  required
                />
                <datalist id="jangada-capacities-list">
                  {capacityOptions.map(capacity => (
                    <option key={capacity} value={capacity} />
                  ))}
                </datalist>
                {!editId &&
                selectedTechnicalModel &&
                normalizeCapacityValue(form.capacity) ? (
                  <p className="mt-1 text-[11px] font-medium text-emerald-700">
                    Sugestão técnica aplicada automaticamente para este modelo.
                  </p>
                ) : null}
              </label>
            </>
          ) : (
            <div className="space-y-3">
              {!form.brand ||
              !form.model ||
              !String(form.packType || '').trim() ||
              !normalizeCapacityValue(form.capacity) ? (
                <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  Preencha os dados (marca, modelo, tipo de pack e lotação) para ver os
                  artigos obrigatórios do pack.
                </p>
              ) : wizardPackItems.length === 0 ? (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Não foi possível determinar os artigos obrigatórios para este pack.
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between flex-wrap gap-2 pb-1">
                    <p className="text-xs font-semibold text-slate-600">
                      {wizardPackItems.length} artigo(s) obrigatórios do pack
                    </p>
                    <div className="flex items-center gap-1 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleBatchFillValidade(1)}
                        className="px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-[10px]"
                      >
                        +1 Ano
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBatchFillValidade(2)}
                        className="px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-[10px]"
                      >
                        +2 Anos
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBatchFillValidade(3)}
                        className="px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-[10px]"
                      >
                        +3 Anos
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBatchFillValidade(5)}
                        className="px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-[10px]"
                      >
                        +5 Anos
                      </button>
                      <button
                        type="button"
                        onClick={handleClearValidades}
                        className="px-2 py-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 font-bold text-[10px]"
                      >
                        Limpar
                      </button>
                    </div>
                  </div>
                  <div className="max-h-[46vh] overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                    {wizardPackItems.map(item => (
                      <PackItemRow
                        key={item.label}
                        item={item}
                        value={artigoValidades[item.label] || ''}
                        onChange={(label, val) =>
                          setArtigoValidades(prev => ({ ...prev, [label]: val }))
                        }
                      />
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    As validades definidas aqui são registadas nos artigos da jangada e ficam
                    visíveis na ficha técnica.
                  </p>
                </>
              )}
            </div>
          )}

          <div className="flex gap-2 justify-end pt-3">
            <button
              type="button"
              className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 font-semibold text-sm"
              onClick={onClose}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-bold text-sm shadow-sm"
            >
              {editId ? 'Salvar alterações' : 'Criar Jangada'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});

const PackItemRow = React.memo(function PackItemRow({
  item,
  value,
  onChange,
}: {
  item: MandatoryPackItem;
  value: string;
  onChange: (label: string, val: string) => void;
}) {
  const expirable = Boolean(item.validityFieldName);
  const [localVal, setLocalVal] = useState(value || '');

  useEffect(() => {
    if (value !== localVal) {
      setLocalVal(value || '');
    }
  }, [value, localVal]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setLocalVal(v);
      onChange(item.label, v);
    },
    [item.label, onChange],
  );

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{item.label}</p>
        <p className="text-[11px] text-slate-400 truncate">
          {item.quantityLabel}
          {item.reference ? ` · ${item.reference}` : ''}
        </p>
      </div>
      {expirable ? (
        <div className="flex shrink-0 items-center gap-2">
          <input
            type="month"
            value={localVal}
            onChange={handleInputChange}
            className="border rounded-lg px-2 py-1.5 text-sm w-[9.5rem] bg-white"
          />
          {localVal ? (
            <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">
              validade
            </span>
          ) : null}
        </div>
      ) : (
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Sem validade
        </span>
      )}
    </div>
  );
}, (prev, next) => prev.item === next.item && prev.value === next.value && prev.onChange === next.onChange);

export default function JangadasPage() {
  const router = useRouter();
  const { status: sessionStatus } = useSession();

  const handleRowClick = (id: number, e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'BUTTON' ||
      target.tagName === 'A' ||
      target.closest('button') ||
      target.closest('a') ||
      target.closest('input')
    ) {
      return;
    }
    router.push(`/jangadas/${id}`);
  };

  const [isMounted, setIsMounted] = useState(false);
  const [jangadas, setJangadas] = useState<Jangada[]>([]);
  const [catalogOptions, setCatalogOptions] = useState<JangadaCatalogOption[]>([]);
  const [availablePackTypeOptions, setAvailablePackTypeOptions] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterModel, setFilterModel] = useState('');
  const [filterPackType, setFilterPackType] = useState('');
  const [filterCapacity, setFilterCapacity] = useState('');
  const [filterShip, setFilterShip] = useState('');
  const [filterInspecaoMes, setFilterInspecaoMes] = useState('');
  const [filterProximaInspecaoMes, setFilterProximaInspecaoMes] = useState('');
  const [onlyExpiring30Days, setOnlyExpiring30Days] = useState(false);
  const [onlyHruCritical, setOnlyHruCritical] = useState(false);
  const filterUrlSynced = useRef(false);
  const firstRender = useRef(true);
  const [form, setForm] = useState<Jangada>(INITIAL_FORM);
  const [editId, setEditId] = useState<number | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [wizardTab, setWizardTab] = useState<'dados' | 'artigos'>('dados');
  const [artigoValidades, setArtigoValidades] = useState<Record<string, string>>({});

  const handleBatchFillValidade = (years: number) => {
    const baseDate = form.dataFabrico ? new Date(`${form.dataFabrico}-01`) : new Date();
    const targetYear = baseDate.getFullYear() + years;
    const targetMonth = String(baseDate.getMonth() + 1).padStart(2, '0');
    const targetStr = `${targetYear}-${targetMonth}`;

    const nextValidades: Record<string, string> = {};
    for (const item of wizardPackItems) {
      if (item.validityFieldName) {
        nextValidades[item.label] = targetStr;
      }
    }
    setArtigoValidades(nextValidades);
  };

  const handleClearValidades = () => {
    setArtigoValidades({});
  };

  useEffect(() => {
    if (!showScanner) return;
    // A lib do scanner (com ZXing) pesa ~280 KB: só a descarregamos quando o
    // utilizador abre a câmara, e não no carregamento inicial da página.
    let cancelled = false;
    let scanner: import('html5-qrcode').Html5QrcodeScanner | null = null;

    void (async () => {
      const { Html5QrcodeScanner } = await import('html5-qrcode');
      if (cancelled) return;
      const s = new Html5QrcodeScanner(
        'qr-reader',
        { fps: 10, qrbox: { width: 250, height: 250 } },
        false,
      );
      scanner = s;

      scanner.render(
        decodedText => {
          try {
            s.clear()
              .then(() => {
                setShowScanner(false);
                // Validar URL antes de redirecionar — prevenir open redirect
                if (decodedText.includes('/jangadas/')) {
                  const pathIndex = decodedText.indexOf('/jangadas/');
                  const subPath = decodedText.substring(pathIndex);
                  // Garantir que o subPath é um caminho válido e não contém caracteres perigosos
                  if (/^\/jangadas\/\d+$/.test(subPath)) {
                    router.push(subPath);
                  } else {
                    console.warn('QR code com caminho inválido:', subPath);
                  }
                } else {
                  // Apenas permitir URLs do mesmo domínio
                  try {
                    const qrUrl = new URL(decodedText, window.location.origin);
                    if (qrUrl.origin === window.location.origin) {
                      router.push(qrUrl.pathname + qrUrl.search);
                    } else {
                      console.warn('QR code com domínio externo bloqueado:', decodedText);
                    }
                  } catch {
                    // Se não for URL válida, tratar como serial de jangada e procurar
                    fetch(`/api/jangadas/serial/${encodeURIComponent(decodedText.trim())}`)
                      .then(r => r.json())
                      .then(foundRaft => {
                        if (foundRaft && foundRaft.id) {
                          router.push(`/jangadas/${foundRaft.id}`);
                        } else {
                          setSearch(decodedText.trim());
                          appToast.info(
                            `Pesquisa rápida iniciada para Série: ${decodedText.trim()}`,
                          );
                        }
                      })
                      .catch(() => {
                        setSearch(decodedText.trim());
                      });
                  }
                }
              })
              .catch(err => {
                console.error('Error clearing scanner:', err);
              });
          } catch (e) {
            console.error('Error processing QR code:', e);
          }
        },
        error => {
          // Ignore scanner warnings
        },
      );
    })();

    return () => {
      cancelled = true;
      scanner?.clear().catch(e => console.error('Error cleaning qr scanner:', e));
    };
  }, [showScanner, router]);
  const [loading, setLoading] = useState(false);
  // Seleção em lote
  const [selectedJangadas, setSelectedJangadas] = useState<number[]>([]);
  const [deletingBatch, setDeletingBatch] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<JangadaListColumnKey, boolean>>(
    buildDefaultJangadaColumns(),
  );
  // Novo: modo de visualização
  const [viewMode, setViewMode] = useState<'lista' | 'detalhes' | 'quadros' | 'conformidade'>(
    'lista',
  );
  const [pausedInspectionDrafts, setPausedInspectionDrafts] = useState<
    Record<number, PausedInspectionDraftMeta>
  >({});
  const [draftsFound, setDraftsFound] = useState<
    Array<{ id: string; serial: string; savedAt: string }>
  >([]);

  useEffect(() => {
    async function checkDrafts() {
      if (typeof window === 'undefined') return;
      const found = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('jangada-wizard-draft-')) {
          try {
            const val = JSON.parse(localStorage.getItem(key) || '{}');
            const id = key.replace('jangada-wizard-draft-', '');
            const res = await fetch(`/api/inspecoes?jangadaId=${id}`);
            const inspList = await res.json().catch(() => []);
            const latest = Array.isArray(inspList) && inspList.length > 0 ? inspList[0] : null;
            if (latest && (latest.status === 'Concluída' || latest.status === 'Condenada')) {
              localStorage.removeItem(key);
              continue;
            }
            found.push({
              id,
              serial: val.inspectionData?.serial || `ID ${id}`,
              savedAt: val.savedAt || new Date().toISOString(),
            });
          } catch {}
        }
      }
      setDraftsFound(found);
    }
    checkDrafts();
  }, []);

  // Sync filters to URL
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (filterUrlSynced.current) return;
    filterUrlSynced.current = true;

    try {
      const params = new URLSearchParams(window.location.search);
      const s = params.get('pesquisa');
      if (s) setSearch(s);
      const b = params.get('marca');
      if (b) setFilterBrand(b);
      const m = params.get('modelo');
      if (m) setFilterModel(m);
      const pt = params.get('pack');
      if (pt) setFilterPackType(pt);
      const cap = params.get('lotacao');
      if (cap) setFilterCapacity(cap);
      const sh = params.get('navio');
      if (sh) setFilterShip(sh);
      const im = params.get('mesInspecao');
      if (im) setFilterInspecaoMes(im);
      const pm = params.get('mesProxima');
      if (pm) setFilterProximaInspecaoMes(pm);
      if (params.get('exp30') === '1') setOnlyExpiring30Days(true);
      if (params.get('hru') === '1') setOnlyHruCritical(true);
      const vm = params.get('vista');
      if (vm === 'lista' || vm === 'detalhes' || vm === 'quadros' || vm === 'conformidade')
        setViewMode(vm);
    } catch {}
  }, []);

  // Sync filter changes to URL
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams();
      if (search) params.set('pesquisa', search);
      if (filterBrand) params.set('marca', filterBrand);
      if (filterModel) params.set('modelo', filterModel);
      if (filterPackType) params.set('pack', filterPackType);
      if (filterCapacity) params.set('lotacao', filterCapacity);
      if (filterShip) params.set('navio', filterShip);
      if (filterInspecaoMes) params.set('mesInspecao', filterInspecaoMes);
      if (filterProximaInspecaoMes) params.set('mesProxima', filterProximaInspecaoMes);
      if (onlyExpiring30Days) params.set('exp30', '1');
      if (onlyHruCritical) params.set('hru', '1');
      if (viewMode !== 'lista') params.set('vista', viewMode);
      const qs = params.toString();
      window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
    } catch {}
  }, [
    search,
    filterBrand,
    filterModel,
    filterPackType,
    filterCapacity,
    filterShip,
    filterInspecaoMes,
    filterProximaInspecaoMes,
    onlyExpiring30Days,
    onlyHruCritical,
    viewMode,
  ]);

  async function handleDeleteBatch() {
    if (selectedJangadas.length === 0) return;
    if (!window.confirm(`Tem certeza que deseja excluir ${selectedJangadas.length} jangadas?`))
      return;
    setDeletingBatch(true);
    try {
      const response = await fetch('/api/jangadas', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedJangadas }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Erro ao excluir jangadas.');
      }
      setSelectedJangadas([]);
      await fetchJangadas();
      appToast.success('Jangadas excluídas com sucesso.');
    } catch (err) {
      appToast.error(err instanceof Error ? err.message : 'Erro ao excluir jangadas.');
    } finally {
      setDeletingBatch(false);
    }
  }

  useEffect(() => {
    if (sessionStatus !== 'authenticated') return;

    setIsMounted(true);
    fetchJangadas();
    fetchJangadaCatalogOptions();
    fetchAvailablePackTypeOptions();
    setPausedInspectionDrafts(loadPausedInspectionDraftsByRaft());
  }, [sessionStatus]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const refreshPausedDrafts = () => {
      setPausedInspectionDrafts(loadPausedInspectionDraftsByRaft());
    };

    window.addEventListener('focus', refreshPausedDrafts);
    window.addEventListener('storage', refreshPausedDrafts);

    return () => {
      window.removeEventListener('focus', refreshPausedDrafts);
      window.removeEventListener('storage', refreshPausedDrafts);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(JANGADA_LIST_COLUMNS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Record<JangadaListColumnKey, boolean>>;
      const defaults = buildDefaultJangadaColumns();
      const merged = { ...defaults };
      for (const col of JANGADA_LIST_COLUMNS) {
        if (typeof parsed[col.key] === 'boolean') {
          merged[col.key] = Boolean(parsed[col.key]);
        }
      }
      setVisibleColumns(merged);
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(JANGADA_LIST_COLUMNS_KEY, JSON.stringify(visibleColumns));
    } catch {}
  }, [visibleColumns]);

  useEffect(() => {
    if (!filterModel) return;

    const selectedBrandKey = normalizeModelFilterKey(filterBrand);
    const selectedModelKey = normalizeModelMatchKey(filterModel);

    const hasModelInCatalog = Object.entries(
      raftModelData as Record<string, Array<{ name: string }>>,
    ).some(([catalogBrand, entries]) => {
      if (selectedBrandKey && normalizeModelFilterKey(catalogBrand) !== selectedBrandKey)
        return false;
      return (entries || []).some(
        entry => normalizeModelMatchKey(entry?.name) === selectedModelKey,
      );
    });

    const hasModelInData = jangadas.some(j => {
      const matchesBrand =
        !selectedBrandKey || normalizeModelFilterKey(j.brand) === selectedBrandKey;
      return matchesBrand && normalizeModelMatchKey(j.model) === selectedModelKey;
    });

    const hasModelInCatalogOptions = catalogOptions.some(entry => {
      const matchesBrand =
        !selectedBrandKey || normalizeModelFilterKey(entry.marca) === selectedBrandKey;
      return matchesBrand && normalizeModelMatchKey(entry.modelo) === selectedModelKey;
    });

    if (!hasModelInCatalog && !hasModelInData && !hasModelInCatalogOptions) {
      setFilterModel('');
    }
  }, [catalogOptions, filterBrand, filterModel, jangadas]);

  const dataTableVisibleKeys = useMemo(
    () =>
      JANGADA_LIST_COLUMNS.filter(col => col.key !== 'indice' && visibleColumns[col.key])
        .map(col => col.key),
    [visibleColumns],
  );

  const handleDataTableColumnsChange = useCallback(
    (keys: string[]) => {
      setVisibleColumns(prev => {
        const next = { ...prev };
        for (const col of JANGADA_LIST_COLUMNS) {
          if (col.key === 'indice') continue;
          next[col.key] = keys.includes(col.key);
        }
        const anyEnabled = Object.values(next).some(Boolean);
        const first = JANGADA_LIST_COLUMNS.find(col => col.key !== 'indice')?.key;
        if (!anyEnabled && first) next[first] = true;
        return next;
      });
    },
    [],
  );

  async function fetchJangadas() {
    setLoading(true);
    try {
      const res = await fetch('/api/jangadas?scope=all&page=1&paginated=1&limit=5000');
      const raw = await res.text();
      const data = raw ? JSON.parse(raw) : [];
      if (!res.ok) {
        throw new Error((data && (data.error || data.message)) || `Erro HTTP ${res.status}`);
      }
      const jangadasList = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : (Array.isArray(data?.data) ? data.data : []));
      setJangadas(jangadasList);
    } catch (err) {
      console.error('Error fetching jangadas:', err);
      // Nao engolir o erro: uma lista vazia sem aviso e indistinguivel de
      // "nao ha jangadas" e esconde a causa real (403 de permissao, 500 da
      // base de dados, sessao expirada).
      setJangadas([]);
      appToast.error(
        `Falha ao carregar jangadas: ${err instanceof Error ? err.message : 'erro desconhecido'}`
      );
    } finally {
      setLoading(false);
    }
  }

  async function fetchJangadaCatalogOptions() {
    try {
      const res = await fetch('/api/jangadas/catalog-options');
      const raw = await res.text();
      const data = raw ? JSON.parse(raw) : {};
      if (!res.ok) {
        throw new Error((data && (data.error || data.message)) || `Erro HTTP ${res.status}`);
      }

      const nextOptions = Array.isArray(data?.options)
        ? data.options.filter((item: unknown): item is JangadaCatalogOption => {
            if (!item || typeof item !== 'object') return false;
            const candidate = item as Partial<JangadaCatalogOption>;
            return (
              Boolean(String(candidate.marca || '').trim()) &&
              Boolean(String(candidate.modelo || '').trim())
            );
          })
        : [];

      setCatalogOptions(nextOptions);
    } catch (err) {
      console.error('Error fetching jangada catalog options:', err);
      setCatalogOptions([]);
    }
  }

  async function fetchAvailablePackTypeOptions() {
    try {
      const res = await fetch('/api/jangadas/pack-types', { cache: 'no-store' });
      const raw = await res.text();
      const data = raw ? JSON.parse(raw) : {};
      if (!res.ok) {
        throw new Error((data && (data.error || data.message)) || `Erro HTTP ${res.status}`);
      }

      setAvailablePackTypeOptions(
        Array.isArray(data?.options)
          ? data.options.map((item: unknown) => String(item || '').trim()).filter(Boolean)
          : [],
      );
    } catch (err) {
      console.error('Error fetching available pack type options:', err);
      setAvailablePackTypeOptions([]);
    }
  }

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm(f => {
      if (name === 'capacity') {
        const normalized = normalizeCapacityValue(value);
        if (normalized === null) return { ...f, capacity: 0 };
        return { ...f, capacity: normalized };
      }
      return { ...f, [name]: value };
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.brand || !form.model) {
      appToast.error('Preencha a marca e o modelo.');
      return;
    }
    if (!String(form.packType || '').trim()) {
      appToast.error('Selecione o tipo de pack.');
      return;
    }

    if (!normalizeCapacityValue(form.capacity)) {
      appToast.error('Indique uma lotação válida.');
      return;
    }
    setLoading(true);
    const isEditing = Boolean(editId);
    const payload: Record<string, unknown> = {
      ...form,
      serial: String(form.serial || '').trim() || `SN-${Date.now().toString().slice(-6)}`,
      capacity: Number(form.capacity),
    };
    if (!isEditing) {
      const artigos = wizardPackItems
        .filter(item => artigoValidades[item.label])
        .map(item => ({
          name: item.label,
          quantidade: item.quantity,
          validade: artigoValidades[item.label]
            ? `${artigoValidades[item.label]}-01T00:00:00.000Z`
            : null,
          referencia: item.reference || null,
          codigoFabricante: item.reference || null,
        }));
      if (artigos.length > 0) {
        payload.artigos = { create: artigos };
      }
    }
    let response: Response;
    try {
      if (editId) {
        response = await fetch(`/api/jangadas?id=${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        setEditId(null);
      } else {
        response = await fetch('/api/jangadas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
    } catch (err) {
      console.error('Erro ao salvar jangada:', err);
      appToast.error('Não foi possível contactar o servidor. Tente novamente.');
      setLoading(false);
      return;
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      appToast.error(payload?.error || payload?.details || 'Erro ao salvar jangada.');
      setLoading(false);
      return;
    }
    const savedJangada = await response.json().catch(() => null);
    setForm(INITIAL_FORM);
    setShowWizard(false);
    setWizardTab('dados');
    setArtigoValidades({});
    await fetchJangadas();
    appToast.success(isEditing ? 'Jangada atualizada com sucesso.' : 'Jangada criada com sucesso.');
    setLoading(false);

    if (!isEditing && savedJangada?.id) {
      router.push(`/jangadas/${savedJangada.id}`);
    }
  }

  async function handleEdit(j: Jangada) {
    setForm(j);
    setEditId(j.id);
    setShowWizard(true);
    setWizardTab('dados');
    setArtigoValidades({});
  }

  async function handleDelete(id: number) {
    if (!window.confirm('Tem certeza que deseja excluir esta jangada?')) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/jangadas?id=${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Erro ao excluir jangada.');
      }
      await fetchJangadas();
      appToast.success('Jangada excluída com sucesso.');
    } catch (err) {
      appToast.error(err instanceof Error ? err.message : 'Erro ao excluir jangada.');
    } finally {
      setLoading(false);
    }
  }

  function openCreateWizard() {
    setForm(INITIAL_FORM);
    setEditId(null);
    setShowWizard(true);
    setWizardTab('dados');
    setArtigoValidades({});
  }

  const filteredJangadas = jangadas.filter(j => {
    // Pesquisa tolerante: acentos, separadores e erros de dedo.
    const matchesTermo = matchesSearchTermo(
      search,
      j.brand,
      j.model,
      j.serial,
      j.owner,
      j.navio?.nome,
      j.navio?.cliente?.nome,
      j.shipNameManual,
      (j as { linkedShipName?: string | null }).linkedShipName,
    );

    const matchesBrand =
      !filterBrand || normalizeModelFilterKey(j.brand) === normalizeModelFilterKey(filterBrand);
    const matchesModel =
      !filterModel || normalizeModelMatchKey(j.model) === normalizeModelMatchKey(filterModel);
    const matchesPack =
      !filterPackType ||
      normalizeModelFilterKey(j.packType || '') === normalizeModelFilterKey(filterPackType);
    const matchesCapacity = !filterCapacity || String(j.capacity) === filterCapacity;
    const matchesShip =
      !filterShip ||
      matchesSearchTermo(
        filterShip,
        j.shipNameManual,
        j.navio?.nome,
        (j as { linkedShipName?: string | null }).linkedShipName,
      );
    const matchesInspecaoMes =
      !filterInspecaoMes || getMonthKey(j.dataInspecao) === filterInspecaoMes;
    const matchesProximaMes =
      !filterProximaInspecaoMes || getMonthKey(j.dataProxInspecao) === filterProximaInspecaoMes;

    let matchesExpiring = true;
    if (onlyExpiring30Days) {
      const now = Date.now();
      const limit = now + 30 * 24 * 60 * 60 * 1000;
      const nextGiDate = Date.parse(j.dataProxInspecao || '');
      const nextThDate = Date.parse(j.cylinderDataProxTeste || '');
      const giSoon = !Number.isNaN(nextGiDate) && nextGiDate >= now && nextGiDate <= limit;
      const thSoon = !Number.isNaN(nextThDate) && nextThDate >= now && nextThDate <= limit;
      matchesExpiring = giSoon || thSoon;
    }

    let matchesHruCritical = true;
    if (onlyHruCritical) {
      matchesHruCritical = isHruCritical(j.hruValidade);
    }

    return (
      matchesTermo &&
      matchesBrand &&
      matchesModel &&
      matchesPack &&
      matchesCapacity &&
      matchesShip &&
      matchesInspecaoMes &&
      matchesProximaMes &&
      matchesExpiring &&
      matchesHruCritical
    );
  });

  const sortedFilteredJangadas = [...filteredJangadas].sort((a, b) => {
    const pausedDiff =
      getPausedInspectionRank(pausedInspectionDrafts[a.id]) -
      getPausedInspectionRank(pausedInspectionDrafts[b.id]);
    if (pausedDiff !== 0) return pausedDiff;

    if (pausedInspectionDrafts[a.id]?.savedAt && pausedInspectionDrafts[b.id]?.savedAt) {
      const savedAtDiff =
        (pausedInspectionDrafts[b.id]?.savedAt || 0) - (pausedInspectionDrafts[a.id]?.savedAt || 0);
      if (savedAtDiff !== 0) return savedAtDiff;
    }

    const urgencyDiff =
      getInspectionUrgencyRank(a.dataProxInspecao) - getInspectionUrgencyRank(b.dataProxInspecao);
    if (urgencyDiff !== 0) return urgencyDiff;

    const dateA = Date.parse(String(a.dataProxInspecao || ''));
    const dateB = Date.parse(String(b.dataProxInspecao || ''));
    const safeDateA = Number.isNaN(dateA) ? Number.POSITIVE_INFINITY : dateA;
    const safeDateB = Number.isNaN(dateB) ? Number.POSITIVE_INFINITY : dateB;
    if (safeDateA !== safeDateB) return safeDateA - safeDateB;

    return `${a.brand} ${a.model} ${a.serial}`.localeCompare(`${b.brand} ${b.model} ${b.serial}`);
  });

  const uniqueBrands = uniqueNormalizedLabels([
    ...jangadas.map(j => j.brand),
    ...catalogOptions.map(entry => entry.marca),
  ]);
  const uniqueModels = Array.from(
    [
      ...jangadas.map(j => ({ brand: j.brand, model: j.model })),
      ...catalogOptions.map(entry => ({ brand: entry.marca, model: entry.modelo })),
    ]
      .filter(
        item =>
          !filterBrand ||
          normalizeModelFilterKey(item.brand) === normalizeModelFilterKey(filterBrand),
      )
      .reduce((acc, item) => {
        const canonical = canonicalizeRaftModelLabel(item.brand, item.model) || item.model;
        const key = normalizeModelMatchKey(canonical);
        if (!key || acc.has(key)) return acc;
        acc.set(key, canonical);
        return acc;
      }, new Map<string, string>())
      .values(),
  ).sort();
  const uniquePackTypes = useMemo(
    () =>
      getRecognizedPackTypeOptions([...availablePackTypeOptions, ...jangadas.map(j => j.packType)]),
    [availablePackTypeOptions, jangadas],
  );
  const uniqueLaunchTypes = Array.from(
    new Set(jangadas.map(j => normalizeLaunchTypeValue(j.launchType)).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, 'pt-PT'));

  const raftCatalogByBrand = raftModelData as Record<
    string,
    Array<{
      name: string;
      specifications?: Array<{ capacity: number }>;
      packTypes?: string[];
      configuration?: string[];
    }>
  >;

  const catalogBrandLabelByKey = new Map<string, string>();
  const catalogModelsByBrandKey = new Map<string, string[]>();
  for (const [catalogBrand, entries] of Object.entries(raftCatalogByBrand)) {
    const brandLabel = String(catalogBrand || '').trim();
    if (!brandLabel) continue;
    const brandKey = normalizeModelFilterKey(brandLabel);
    if (!brandKey) continue;
    if (!catalogBrandLabelByKey.has(brandKey)) {
      catalogBrandLabelByKey.set(brandKey, brandLabel);
    }
    const currentModels = catalogModelsByBrandKey.get(brandKey) || [];
    const mergedModels = currentModels.concat(
      (entries || []).map(item => String(item?.name || '').trim()).filter(Boolean),
    );
    catalogModelsByBrandKey.set(brandKey, mergedModels);
  }

  for (const entry of catalogOptions) {
    const brandLabel = String(entry.marca || '').trim();
    const modelLabel = String(entry.modelo || '').trim();
    if (!brandLabel || !modelLabel) continue;

    const brandKey = normalizeModelFilterKey(brandLabel);
    if (!brandKey) continue;

    if (!catalogBrandLabelByKey.has(brandKey)) {
      catalogBrandLabelByKey.set(brandKey, brandLabel);
    }

    const currentModels = catalogModelsByBrandKey.get(brandKey) || [];
    catalogModelsByBrandKey.set(brandKey, currentModels.concat(modelLabel));
  }

  const brandLabelByKey = new Map<string, string>(catalogBrandLabelByKey);
  for (const dbBrand of uniqueBrands) {
    const key = normalizeModelFilterKey(dbBrand);
    if (!key || brandLabelByKey.has(key)) continue;
    brandLabelByKey.set(key, dbBrand);
  }

  const currentFormBrand = String(form.brand || '').trim();
  if (currentFormBrand) {
    const key = normalizeModelFilterKey(currentFormBrand);
    if (key && !brandLabelByKey.has(key)) {
      brandLabelByKey.set(key, currentFormBrand);
    }
  }

  const debouncedForm = useDebounce(form, 200);
  const debouncedBrand = debouncedForm.brand;
  const debouncedModel = debouncedForm.model;
  const debouncedPackType = debouncedForm.packType;
  const debouncedCapacity = debouncedForm.capacity;
  const debouncedLaunchType = debouncedForm.launchType;

  const brandOptions = useMemo(() => {
    const brands = Object.keys(raftModelData);
    const set = new Set(brands);
    if (debouncedBrand) set.add(debouncedBrand);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-PT'));
  }, [debouncedBrand]);

  const filterBrandOptions = useMemo(() => brandOptions, [brandOptions]);

  const modelOptions = useMemo(() => {
    const brandKey = normalizeModelFilterKey(debouncedBrand);
    if (!brandKey) return [];
    for (const [brand, models] of Object.entries(raftModelData)) {
      if (normalizeModelFilterKey(brand) === brandKey) {
        const list = (models || []).map(m => m.name).filter(Boolean);
        if (debouncedModel) list.push(debouncedModel);
        return uniqueNormalizedLabels(list).sort();
      }
    }
    return debouncedModel ? [debouncedModel] : [];
  }, [debouncedBrand, debouncedModel]);

  const filterSelectedBrandKey = normalizeModelFilterKey(filterBrand);
  const filterSelectedBrandLabel = filterSelectedBrandKey
    ? brandLabelByKey.get(filterSelectedBrandKey) || filterBrand || filterSelectedBrandKey
    : '';
  const filterModelsFromCatalogByBrand = filterSelectedBrandKey
    ? (catalogModelsByBrandKey.get(filterSelectedBrandKey) || []).map(
        m => canonicalizeRaftModelLabel(filterSelectedBrandLabel, m) || m,
      )
    : Array.from(catalogModelsByBrandKey.entries()).flatMap(([brandKey, models]) => {
        const brandLabel = brandLabelByKey.get(brandKey) || brandKey;
        return models.map(m => canonicalizeRaftModelLabel(brandLabel, m) || m);
      });
  const filterModelsFromDataByBrand = jangadas
    .filter(
      j => !filterSelectedBrandKey || normalizeModelFilterKey(j.brand) === filterSelectedBrandKey,
    )
    .map(j => canonicalizeRaftModelLabel(j.brand, j.model) || j.model);

  const filterModelOptions = uniqueNormalizedLabels([
    ...filterModelsFromCatalogByBrand,
    ...filterModelsFromDataByBrand,
    ...uniqueModels,
  ]);

  


  const selectedTechnicalModel = useMemo(
    () => findRaftTechnicalModel(debouncedBrand, debouncedModel),
    [debouncedBrand, debouncedModel],
  );

  const capacityOptions = useMemo(() => {
    const base = new Set<number>([4, 6, 8, 10, 12, 16, 20, 25, 50]);
    const current = normalizeCapacityValue(debouncedCapacity);
    if (current !== null) base.add(current);

    if (selectedTechnicalModel?.specifications) {
      for (const spec of selectedTechnicalModel.specifications) {
        const v = normalizeCapacityValue(spec.capacity);
        if (v !== null) base.add(v);
      }
    }

    return Array.from(base).sort((a, b) => a - b);
  }, [debouncedCapacity, selectedTechnicalModel]);

  const launchTypeOptions = useMemo(() => {
    const base = new Set<string>(uniqueLaunchTypes);
    const fromTech = (selectedTechnicalModel?.configuration || [])
      .map(config => normalizeLaunchTypeValue(config))
      .filter(Boolean);
    for (const v of fromTech) if (v) base.add(v);
    const fromForm = normalizeLaunchTypeValue(debouncedLaunchType);
    if (fromForm) base.add(fromForm);
    return Array.from(base).sort((a, b) => a.localeCompare(b, 'pt-PT'));
  }, [debouncedLaunchType, selectedTechnicalModel, uniqueLaunchTypes]);

  const packTypeOptions = useMemo(() => {
    return getRecognizedPackTypeOptions([
      ...(selectedTechnicalModel?.packTypes || [])
        .map(pack => String(pack || '').trim())
        .filter(Boolean),
      ...uniquePackTypes,
      String(debouncedPackType || '').trim(),
    ]);
  }, [debouncedPackType, selectedTechnicalModel, uniquePackTypes]);

  const ownerOptions = uniqueNormalizedLabels(
    jangadas
      .map(j => String(j.owner || '').trim())
      .filter(Boolean)
      .concat(String(form.owner || '').trim()),
  );

  useEffect(() => {
    if (!showWizard || Boolean(editId) || !selectedTechnicalModel) return;

    const suggestedLaunchType = getSuggestedLaunchType(selectedTechnicalModel.configuration);
    const suggestedPackType = getSuggestedPackType(selectedTechnicalModel.packTypes);
    const suggestedCapacity = getSuggestedCapacity(selectedTechnicalModel.specifications);

    setForm(current => {
      const next = { ...current };
      let changed = false;

      if (!String(current.launchType || '').trim() && suggestedLaunchType) {
        next.launchType = suggestedLaunchType;
        changed = true;
      }

      if (!String(current.packType || '').trim() && suggestedPackType) {
        next.packType = suggestedPackType;
        changed = true;
      }

      if (!normalizeCapacityValue(current.capacity) && suggestedCapacity) {
        next.capacity = suggestedCapacity;
        changed = true;
      }

      return changed ? next : current;
    });
  }, [editId, selectedTechnicalModel, showWizard]);

  const wizardPackItems = useMemo<MandatoryPackItem[]>(() => {
    if (editId) return [];
    if (!debouncedBrand || !debouncedModel || !String(debouncedPackType || '').trim()) return [];
    const cap = normalizeCapacityValue(debouncedCapacity);
    if (cap === null) return [];
    return getMandatoryPackItemsForRaft({
      brand: debouncedBrand,
      model: debouncedModel,
      packType: debouncedPackType,
      capacity: cap,
    });
  }, [editId, debouncedBrand, debouncedModel, debouncedPackType, debouncedCapacity]);

  const artigoValidadesCount = Object.keys(artigoValidades).filter(label =>
    Boolean(artigoValidades[label]),
  ).length;

  const clearFilters = () => {
    setSearch('');
    setFilterBrand('');
    setFilterModel('');
    setFilterPackType('');
    setFilterCapacity('');
    setFilterShip('');
    setFilterInspecaoMes('');
    setFilterProximaInspecaoMes('');
    setOnlyExpiring30Days(false);
    setOnlyHruCritical(false);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', window.location.pathname);
    }
  };

  const filterCapacityOptions = useMemo(() => {
    const caps = jangadas.map(j => j.capacity).filter(Boolean);
    return Array.from(new Set(caps)).sort((a, b) => a - b);
  }, [jangadas]);

  const filterShipOptions = useMemo(() => {
    const ships = jangadas
      .map(j => j.shipNameManual || j.navio?.nome)
      .filter((s): s is string => !!s);
    return Array.from(new Set(ships)).sort((a, b) => a.localeCompare(b, 'pt-PT'));
  }, [jangadas]);

  const filterInspecaoMesOptions = useMemo(() => {
    const months = jangadas.map(j => getMonthKey(j.dataInspecao)).filter((m): m is string => !!m);
    return Array.from(new Set(months)).sort((a, b) => b.localeCompare(a));
  }, [jangadas]);

  const filterProximaInspecaoMesOptions = useMemo(() => {
    const months = jangadas
      .map(j => getMonthKey(j.dataProxInspecao))
      .filter((m): m is string => !!m);
    return Array.from(new Set(months)).sort((a, b) => b.localeCompare(a));
  }, [jangadas]);

  const sortedQuadrosJangadas = sortedFilteredJangadas;

  const jangadaStats = useMemo(
    () => ({
      total: jangadas.length,
      visiveis: sortedFilteredJangadas.length,
      pausadas: sortedFilteredJangadas.filter(j => Boolean(pausedInspectionDrafts[j.id]?.savedAt))
        .length,
      inspeccao30d: jangadas.filter(j => isInspectionDueWithin30Days(j.dataProxInspecao)).length,
      th30d: jangadas.filter(j => isHydroTestDueWithin30Days(j.cylinderDataProxTeste)).length,
      hruCritico: jangadas.filter(j => isHruCritical(j.hruValidade)).length,
    }),
    [jangadas, sortedFilteredJangadas, pausedInspectionDrafts],
  );

  const pausedVisibleJangadas = useMemo(
    () => sortedFilteredJangadas.filter(j => Boolean(pausedInspectionDrafts[j.id]?.savedAt)),
    [sortedFilteredJangadas, pausedInspectionDrafts],
  );

  const jangadaListColumns: ColumnDef<Jangada>[] = [
    {
      key: 'marca',
      header: 'Marca',
      sortable: true,
      filterable: true,
      accessor: j => j.brand,
      render: j => (
        <span className="inline-flex items-center gap-1.5">
          {renderAssociationDot(j)}
          <Link
            href={`/jangadas/${j.id}`}
            className="text-blue-700 hover:underline font-medium"
            onClick={e => e.stopPropagation()}
          >
            {j.brand || '—'}
          </Link>
        </span>
      ),
    },
    {
      key: 'modelo',
      header: 'Modelo',
      sortable: true,
      filterable: true,
      accessor: j => j.model,
      render: j => (
        <Link
          href={`/jangadas/${j.id}`}
          className="text-blue-700 hover:underline font-medium"
          onClick={e => e.stopPropagation()}
        >
          {j.model || '—'}
        </Link>
      ),
    },
    {
      key: 'tipo',
      header: 'Tipo',
      sortable: true,
      accessor: j => j.launchType,
      render: j => j.launchType || '—',
    },
    {
      key: 'boletins',
      header: 'Boletins',
      sortable: true,
      accessor: j => j.applicableServiceBulletinsCount ?? 0,
      render: j => renderBulletinBadges(j, 2),
    },
    {
      key: 'serial',
      header: 'Nº Série',
      sortable: true,
      filterable: true,
      accessor: j => j.serial,
      render: j => (
        <div className="flex flex-col gap-1">
          <Link
            href={`/jangadas/${j.id}`}
            className="text-blue-700 hover:underline font-semibold"
            onClick={e => e.stopPropagation()}
          >
            {j.serial || '—'}
          </Link>
          {renderPausedInspectionBadge(pausedInspectionDrafts[j.id])}
        </div>
      ),
    },
    {
      key: 'dataFabrico',
      header: 'Data Fabrico',
      sortable: true,
      accessor: j => j.dataFabrico,
      render: j => formatMonthYear(j.dataFabrico),
    },
    {
      key: 'lotacao',
      header: 'Lotação',
      sortable: true,
      accessor: j => j.capacity ?? 0,
      render: j => formatCapacityValue(j.capacity),
    },
    {
      key: 'packType',
      header: 'Tipo de Pack',
      sortable: true,
      filterable: true,
      filterType: 'select',
      filterOptions: uniquePackTypes.map(p => ({ label: p, value: p })),
      accessor: j => j.packType || '',
      render: j => j.packType || '—',
    },
    {
      key: 'navio',
      header: 'Navio/Embarcação',
      sortable: true,
      filterable: true,
      accessor: j => j.shipNameManual || j.navio?.nome || '',
      render: j => {
        const nome = j.shipNameManual || j.navio?.nome || '—';
        if (j.shipId) {
          return (
            <Link
              href={`/navios/${j.shipId}`}
              className="text-blue-700 hover:underline font-medium"
              onClick={e => e.stopPropagation()}
            >
              {nome}
            </Link>
          );
        }
        return nome;
      },
    },
    {
      key: 'armador',
      header: 'Armador',
      sortable: true,
      filterable: true,
      accessor: j => {
        const nome = String(j.owner || j.navio?.cliente?.nome || '').trim();
        return nome;
      },
      render: j => {
        const nome = String(j.owner || j.navio?.cliente?.nome || '').trim();
        if (!nome) return <span className="text-slate-400">—</span>;
        return (
          <span className="inline-flex items-center gap-1.5 text-slate-700">
            <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span className="truncate max-w-[200px]">{nome}</span>
          </span>
        );
      },
    },
    {
      key: 'ilha',
      header: 'Ilha',
      sortable: true,
      filterable: true,
      accessor: j => j.island || j.ilha || '',
      render: j => {
        const ilha = j.island || j.ilha;
        if (!ilha) return <span className="text-slate-400">—</span>;
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 rounded text-xs font-medium text-slate-600">
            <MapPin className="h-3 w-3" />
            {ilha}
          </span>
        );
      },
    },
    {
      key: 'estacao',
      header: 'Estação',
      sortable: true,
      filterable: true,
      accessor: j => j.serviceStationName || '',
      render: j => {
        if (!j.serviceStationName) return <span className="text-slate-400">—</span>;
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[10px] font-medium">
            <Building2 className="h-2.5 w-2.5" />
            {j.serviceStationName}
          </span>
        );
      },
    },
    {
      key: 'numeroObra',
      header: 'Nº Obra',
      sortable: true,
      filterable: true,
      accessor: j => j.numeroObra || '',
      render: j => j.numeroObra || <span className="text-slate-400">—</span>,
    },
    {
      key: 'dataInspecao',
      header: 'Data Inspeção',
      sortable: true,
      accessor: j => j.dataInspecao,
      render: j => formatInspectionDate(j.dataInspecao),
    },
    {
      key: 'dataProxInspecao',
      header: 'Próx. Inspeção',
      sortable: true,
      accessor: j => j.dataProxInspecao,
      render: j => (
        <div className="flex flex-col gap-1">
          <span
            className={
              isInspectionDueWithin30Days(j.dataProxInspecao)
                ? 'font-medium text-red-600'
                : 'text-gray-700'
            }
          >
            {formatInspectionDate(j.dataProxInspecao)}
          </span>
          {renderInspectionUrgencyBadge(j.dataProxInspecao)}
          {renderHydroTestUrgencyBadge(j.cylinderDataProxTeste)}
          {renderHruUrgencyBadge(j.hruValidade)}
          {renderConsumablesAlertBadge(j)}
        </div>
      ),
    },
    {
      key: 'semaforo',
      header: 'Consumíveis',
      sortable: true,
      accessor: j => j.artigos?.length ?? 0,
      className: 'text-center',
      render: j => renderSemaforoStatus(j),
    },
  ];

  if (!isMounted) {
    return <div className="min-h-screen bg-gray-50 py-8" suppressHydrationWarning />;
  }

  const inflationSystemOptions = (() => {
    const options = new Set<string>();
    const currentValue = String(form.cylinderSistema || '').trim();
    const keyValue = String(selectedTechnicalModel?.keyTechnicalData?.inflationSystem || '').trim();

    if (currentValue) options.add(currentValue);
    if (keyValue) options.add(keyValue);

    for (const item of selectedTechnicalModel?.inflationSystem || []) {
      const value = String(item || '').trim();
      if (value) options.add(value);
    }

    for (const fallback of FALLBACK_INFLATION_SYSTEM_OPTIONS) {
      if (options.size >= 12) break;
      options.add(fallback);
    }

    return Array.from(options);
  })();

  const firingHeadOptions = (() => {
    const options = new Map<string, { referencia: string; descricao: string }>();
    const currentRef = String(form.cylinderCabecaDisparoRef || '').trim();
    const currentDesc = String(form.cylinderCabecaDisparoDescricao || '').trim();

    if (currentRef) {
      options.set(currentRef, { referencia: currentRef, descricao: currentDesc || currentRef });
    }

    for (const item of selectedTechnicalModel?.serviceItems || []) {
      const referencia = String(item.reference || '').trim();
      if (!referencia) continue;
      const haystack = normalizeTechnicalSearchValue(
        `${item.name} ${item.reference || ''} ${item.notes || ''}`,
      );
      if (!FIRING_HEAD_KEYWORDS.some(keyword => haystack.includes(keyword))) continue;
      options.set(referencia, { referencia, descricao: item.name });
    }

    return Array.from(options.values());
  })();

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8">
        {draftsFound.length > 0 && (
          <div className="mb-6 rounded-2xl bg-amber-50 border border-amber-200 p-4 text-amber-900 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <AlertTriangle className="text-amber-600 shrink-0" size={24} />
              <div>
                <p className="font-bold text-sm">
                  Rascunhos de inspeção por concluir detectados neste dispositivo
                </p>
                <p className="text-xs text-amber-700">
                  Encontrámos {draftsFound.length} inspeção(ões) em rascunho guardadas localmente.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {draftsFound.map(d => (
                <button
                  key={d.id}
                  onClick={() => router.push(`/jangadas/${d.id}?startInspection=1`)}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
                >
                  Retomar ({d.serial})
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="app-hero-panel mb-6 flex flex-col gap-4 rounded-2xl p-6 text-white">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-base font-semibold uppercase tracking-[0.2em] text-sky-100">
                Orey Técnica
              </p>
              <h1 className="mt-2 text-4xl font-bold">Jangadas</h1>
              <p className="mt-2 max-w-4xl text-base text-sky-100">
                Diretório operacional de jangadas com inspeções pausadas, urgências, boletins e
                gestão técnica no mesmo padrão visual de navios e clientes.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <button
                className="flex items-center gap-2 rounded-lg bg-white/10 border border-white/20 px-4 py-2 text-base font-semibold text-white shadow-sm transition hover:bg-white/20"
                onClick={() => {
                  window.open('/api/calendario');
                  appToast.success('A descarregar calendário de vistorias (iCal)...');
                }}
                suppressHydrationWarning
              >
                <Calendar className="w-5 h-5 text-white" />
                <span>Exportar Calendário</span>
              </button>
              <button
                className="flex items-center gap-2 rounded-lg bg-white/10 border border-white/20 px-4 py-2 text-base font-semibold text-white shadow-sm transition hover:bg-white/20"
                onClick={() => setShowScanner(true)}
                suppressHydrationWarning
              >
                <QrCode className="w-5 h-5 text-white" />
                <span>Escanear QR</span>
              </button>
              <button
                className="rounded-lg bg-blue-600 px-4 py-2 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700"
                onClick={openCreateWizard}
                suppressHydrationWarning
              >
                + Nova Jangada
              </button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              { label: 'Total', value: jangadaStats.total },
              { label: 'Em vista', value: jangadaStats.visiveis },
              { label: 'Inspeções pausadas', value: jangadaStats.pausadas },
              { label: 'Próx. inspeção ≤ 30 dias', value: jangadaStats.inspeccao30d },
              { label: 'Próx. TH ≤ 30 dias', value: jangadaStats.th30d },
              { label: 'HRU vencido / ≤ 30 dias', value: jangadaStats.hruCritico },
            ].map(item => (
              <div key={item.label} className="app-hero-card rounded-xl p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-sky-100">{item.label}</p>
                <p className="mt-2 text-2xl font-bold">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
        {/* Seletor de visualização */}
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 items-end">
            <label className="block text-xs font-semibold text-gray-700 lg:col-span-2">
              Pesquisa
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Marca, série, proprietário..."
                className="mt-1 border rounded-lg px-3 py-2 w-full"
                suppressHydrationWarning
              />
            </label>
            <label className="block text-xs font-semibold text-gray-700">
              Marca
              <select
                className="mt-1 border rounded-lg px-2 py-2 text-sm w-full"
                value={filterBrand}
                onChange={e => setFilterBrand(e.target.value)}
                title="Filtrar por marca"
              >
                <option value="">Todas as marcas</option>
                {filterBrandOptions.map(brand => (
                  <option key={brand} value={brand}>
                    {brand}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-gray-700">
              Modelo
              <select
                className="mt-1 border rounded-lg px-2 py-2 text-sm w-full"
                value={filterModel}
                onChange={e => setFilterModel(e.target.value)}
                title="Filtrar por modelo"
              >
                <option value="">Todos os modelos</option>
                {filterModelOptions.map(model => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-gray-700">
              Tipo de pack
              <select
                className="mt-1 border rounded-lg px-2 py-2 text-sm w-full"
                value={filterPackType}
                onChange={e => setFilterPackType(e.target.value)}
                title="Filtrar por tipo de pack"
              >
                <option value="">Todos os packs</option>
                {uniquePackTypes.map(pack => (
                  <option key={pack} value={pack}>
                    {pack}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-gray-700">
              Lotação
              <select
                className="mt-1 border rounded-lg px-2 py-2 text-sm w-full"
                value={filterCapacity}
                onChange={e => setFilterCapacity(e.target.value)}
                title="Filtrar por lotação"
              >
                <option value="">Todas</option>
                {filterCapacityOptions.map(cap => (
                  <option key={cap} value={cap}>
                    {cap}P
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-gray-700">
              Navio
              <select
                className="mt-1 border rounded-lg px-2 py-2 text-sm w-full"
                value={filterShip}
                onChange={e => setFilterShip(e.target.value)}
                title="Filtrar por navio"
              >
                <option value="">Todos</option>
                {filterShipOptions.map(ship => (
                  <option key={ship} value={ship}>
                    {ship}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-gray-700">
              Mês da Inspeção
              <select
                className="mt-1 border rounded-lg px-2 py-2 text-sm w-full"
                value={filterInspecaoMes}
                onChange={e => setFilterInspecaoMes(e.target.value)}
                title="Filtrar pelo mês da última inspeção"
              >
                <option value="">Todos os meses</option>
                {filterInspecaoMesOptions.map(monthKey => (
                  <option key={monthKey} value={monthKey}>
                    {formatMonthLabel(monthKey)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-gray-700">
              Mês da Próxima Inspeção
              <select
                className="mt-1 border rounded-lg px-2 py-2 text-sm w-full"
                value={filterProximaInspecaoMes}
                onChange={e => setFilterProximaInspecaoMes(e.target.value)}
                title="Filtrar pelo mês da próxima inspeção"
              >
                <option value="">Todos os meses</option>
                {filterProximaInspecaoMesOptions.map(monthKey => (
                  <option key={monthKey} value={monthKey}>
                    {formatMonthLabel(monthKey)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-gray-700">
              Visualização
              <select
                className="mt-1 border rounded-lg px-2 py-2 text-sm w-full"
                value={viewMode}
                onChange={e =>
                  setViewMode(e.target.value as 'lista' | 'detalhes' | 'quadros' | 'conformidade')
                }
                title="Modo de visualização"
              >
                <option value="lista">Lista</option>
                <option value="detalhes">Detalhes</option>
                <option value="quadros">Quadros</option>
                <option value="conformidade">Relatório de Conformidade</option>
              </select>
            </label>
            <div className="lg:col-span-8 md:col-span-7 flex justify-end">
              <button
                type="button"
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                onClick={clearFilters}
              >
                Limpar filtros
              </button>
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-700 md:col-span-6">
              <input
                type="checkbox"
                checked={onlyExpiring30Days}
                onChange={e => setOnlyExpiring30Days(e.target.checked)}
              />
              Mostrar apenas jangadas com GI ou TH nos próximos 30 dias
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-700 md:col-span-6">
              <input
                type="checkbox"
                checked={onlyHruCritical}
                onChange={e => setOnlyHruCritical(e.target.checked)}
              />
              Mostrar apenas jangadas com HRU vencido ou ≤ 30 dias
            </label>
          </div>
        </div>
        {pausedVisibleJangadas.length > 0 && (
          <div className="mb-4 rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 to-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex rounded-full border border-sky-300 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                    Inspeções pausadas
                  </span>
                  <span className="text-sm font-semibold text-sky-900">
                    {pausedVisibleJangadas.length} jangada
                    {pausedVisibleJangadas.length === 1 ? '' : 's'} em curso
                  </span>
                </div>
                <p className="mt-1 text-sm text-sky-900/80">
                  Retome diretamente as inspeções pendentes sem andar à caça delas pela lista —
                  porque a caça deve ficar para os bugs.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {pausedVisibleJangadas.slice(0, 4).map(j => (
                  <Link
                    key={`paused-top-${j.id}`}
                    href={`/jangadas/${j.id}?continueInspection=1`}
                    className="inline-flex items-center gap-2 rounded-full border border-sky-300 bg-white px-3 py-2 text-xs font-semibold text-sky-700 transition hover:border-sky-400 hover:bg-sky-50"
                    title={`Continuar inspeção de ${j.brand} ${j.model} (${j.serial})`}
                  >
                    <span>
                      {j.brand} {j.model}
                    </span>
                    <span className="text-sky-500">·</span>
                    <span>{j.serial}</span>
                  </Link>
                ))}
                {pausedVisibleJangadas.length > 4 && (
                  <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-100 px-3 py-2 text-xs font-medium text-sky-700">
                    +{pausedVisibleJangadas.length - 4} inspeções pausadas
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
        <NovaJangadaModal
          form={form}
          setForm={setForm}
          editId={editId}
          showWizard={showWizard}
          onClose={() => {
            setShowWizard(false);
            setEditId(null);
            setWizardTab('dados');
            setArtigoValidades({});
          }}
          onSubmit={handleSubmit}
          wizardTab={wizardTab}
          setWizardTab={setWizardTab}
          artigoValidades={artigoValidades}
          setArtigoValidades={setArtigoValidades}
          brandOptions={brandOptions}
          modelOptions={modelOptions}
          launchTypeOptions={launchTypeOptions}
          packTypeOptions={packTypeOptions}
          capacityOptions={capacityOptions}
          wizardPackItems={wizardPackItems}
          selectedTechnicalModel={selectedTechnicalModel}
          handleChange={handleChange}
          handleBatchFillValidade={handleBatchFillValidade}
          handleClearValidades={handleClearValidades}
        />

        {showScanner && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-md border border-gray-200 relative">
              <button
                type="button"
                className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 transition"
                onClick={() => setShowScanner(false)}
                aria-label="Fechar scanner"
              >
                <X className="w-6 h-6" />
              </button>
              <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
                <QrCode className="w-5 h-5 text-blue-600" />
                <span>Escanear QR Code</span>
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Aponte a câmara do dispositivo para o QR Code da jangada no dossier impresso ou na
                etiqueta física.
              </p>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-2">
                <div id="qr-reader" className="w-full mx-auto rounded-lg overflow-hidden" />
              </div>
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => setShowScanner(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg transition"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-2 sm:p-4">
          {loading ? (
            <div className="text-center py-8 text-gray-600">Carregando...</div>
          ) : (
            <>
              {viewMode === 'lista' && (
                <div className="w-full max-w-full">
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] sm:text-xs">
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-1 font-semibold text-emerald-800">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      Cliente + Navio + Jangada
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-yellow-300 bg-yellow-50 px-2 py-1 font-semibold text-yellow-800">
                      <span className="h-2 w-2 rounded-full bg-yellow-500" />
                      Jangada + Navio (sem cliente)
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-2 py-1 font-semibold text-red-800">
                      <span className="h-2 w-2 rounded-full bg-red-500" />
                      Jangada sem Navio e sem Cliente
                    </span>
                  </div>
                  <DataTable<Jangada>
                    data={sortedFilteredJangadas}
                    columns={jangadaListColumns}
                    keyExtractor={j => j.id}
                    searchPlaceholder="Pesquisar jangadas..."
                    searchKeys={['marca', 'modelo', 'serial', 'navio', 'packType', 'armador', 'ilha', 'estacao', 'numeroObra']}
                    pageSize={50}
                    pageSizeOptions={[25, 50, 100, 250]}
                    emptyMessage="Nenhuma jangada encontrada"
                    exportFileName="jangadas"
                    compact
                    selectable
                    onSelectionChange={rows => setSelectedJangadas(rows.map(r => r.id))}
                    bulkActions={rows => (
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded bg-red-600 text-white text-xs font-semibold disabled:opacity-50"
                        disabled={deletingBatch}
                        onClick={handleDeleteBatch}
                      >
                        {deletingBatch
                          ? 'A eliminar...'
                          : `Excluir selecionadas (${rows.length})`}
                      </button>
                    )}
                    visibleColumnsKeys={dataTableVisibleKeys}
                    onVisibleColumnsChange={handleDataTableColumnsChange}
                    onRowClick={j => {
                      window.location.href = `/jangadas/${j.id}`;
                    }}
                    rowActions={j => (
                      <div className="flex flex-wrap justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                        {pausedInspectionDrafts[j.id] ? (
                          <Link
                            href={`/jangadas/${j.id}?continueInspection=1`}
                            className="bg-sky-600 px-2 py-1 rounded text-xs text-white hover:bg-sky-700"
                            onClick={e => e.stopPropagation()}
                          >
                            Continuar
                          </Link>
                        ) : null}
                        <Link
                          href={`/jangadas/${j.id}`}
                          className="bg-indigo-600 hover:bg-indigo-700 px-2 py-1 rounded text-xs text-white font-medium flex items-center justify-center"
                          onClick={e => e.stopPropagation()}
                        >
                          Dossier
                        </Link>
                        <button
                          type="button"
                          className="bg-yellow-400 px-2 py-1 rounded text-xs font-medium"
                          onClick={() => handleEdit(j)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="bg-red-500 px-2 py-1 rounded text-xs text-white font-medium"
                          onClick={() => handleDelete(j.id)}
                        >
                          Excluir
                        </button>
                      </div>
                    )}
                  />
                </div>
              )}
              {viewMode === 'detalhes' && (
                <div className="space-y-4">
                  {sortedFilteredJangadas.length === 0 ? (
                    <div className="text-center text-gray-500">Nenhuma jangada encontrada.</div>
                  ) : (
                    sortedFilteredJangadas.map(j => (
                      <div
                        key={j.id}
                        className={`border rounded-lg p-4 shadow-sm cursor-pointer hover:bg-slate-100/30 transition-colors ${pausedInspectionDrafts[j.id] ? 'border-sky-300 bg-sky-50' : 'bg-white hover:border-gray-300'}`}
                        onClick={e => handleRowClick(j.id, e)}
                      >
                        {(() => {
                          const upcomingReplacementArticles = getUpcomingReplacementArticles(j);
                          const upcomingReplacementArticlesGrouped =
                            aggregateUpcomingReplacementArticles(upcomingReplacementArticles);

                          return (
                            <>
                              <div className="font-bold text-lg mb-1 flex flex-wrap items-center gap-2">
                                <Link
                                  href={`/jangadas/${j.id}`}
                                  className="text-blue-700 hover:underline"
                                >
                                  {j.brand} {j.model}
                                </Link>{' '}
                                <span className="text-gray-400">
                                  (
                                  <Link href={`/jangadas/${j.id}`} className="hover:underline">
                                    {j.serial}
                                  </Link>
                                  )
                                </span>
                                {pausedInspectionDrafts[j.id] ? (
                                  <span className="inline-flex rounded-full border border-sky-300 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
                                    Em curso
                                  </span>
                                ) : null}
                              </div>
                              <div className="mb-2">
                                <div className="flex flex-wrap gap-2">
                                  {renderPausedInspectionBadge(pausedInspectionDrafts[j.id])}
                                </div>
                              </div>
                              <div className="text-sm text-gray-700 mb-2">
                                Proprietário: {j.navio?.cliente?.nome || j.owner || '—'} | Navio:{' '}
                                {j.shipId ? (
                                  <Link
                                    href={`/navios/${j.shipId}`}
                                    className="text-blue-700 hover:underline font-medium"
                                  >
                                    {j.shipNameManual || j.navio?.nome || '—'}
                                  </Link>
                                ) : (
                                  j.shipNameManual || j.navio?.nome || '—'
                                )}{' '}
                                | Capacidade: {formatCapacityValue(j.capacity)} | Tipo:{' '}
                                {j.launchType || '—'} | Tipo de Pack: {j.packType || '—'}
                              </div>
                              <div className="mb-2">{renderBulletinBadges(j)}</div>
                              <div className="text-xs text-gray-500 mb-1">
                                Data Fabrico: {formatMonthYear(j.dataFabrico)} | Data Inspeção:{' '}
                                {formatInspectionDate(j.dataInspecao)} | Próx. Inspeção:{' '}
                                <span
                                  className={
                                    isInspectionDueWithin30Days(j.dataProxInspecao)
                                      ? 'font-medium text-red-600'
                                      : 'text-gray-600'
                                  }
                                >
                                  {formatInspectionDate(j.dataProxInspecao)}
                                </span>
                              </div>
                              <div className="mb-2">
                                <div className="flex flex-wrap gap-1">
                                  {renderInspectionUrgencyBadge(j.dataProxInspecao)}
                                  {renderHydroTestUrgencyBadge(j.cylinderDataProxTeste)}
                                  {renderHruUrgencyBadge(j.hruValidade)}
                                </div>
                              </div>
                              {upcomingReplacementArticles.length > 0 ? (
                                <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="inline-flex rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                                      Substituir na próxima inspeção
                                    </span>
                                    <span className="text-sm font-semibold text-amber-900">
                                      {upcomingReplacementArticlesGrouped.length} artigo
                                      {upcomingReplacementArticlesGrouped.length === 1 ? '' : 's'}{' '}
                                      com validade inferior a 12 meses na data da próxima inspeção
                                    </span>
                                  </div>
                                  <ul className="mt-2 space-y-1 text-sm text-amber-900">
                                    {upcomingReplacementArticlesGrouped.map(artigo => (
                                      <li
                                        key={`${j.id}-${artigo.key}`}
                                        className="rounded-lg border border-amber-100 bg-white/80 px-3 py-2"
                                      >
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                          <div className="font-medium">
                                            {artigo.name || 'Artigo sem nome'}
                                          </div>
                                          <div className="text-xs font-medium text-amber-800">
                                            Validade:{' '}
                                            {formatInspectionDate(
                                              artigo.validadeDate.toISOString(),
                                            )}
                                          </div>
                                        </div>
                                        <div className="mt-1 flex flex-wrap gap-3 text-xs text-amber-800">
                                          <span>Qtd: {artigo.quantidadeTotal}</span>
                                          {artigo.referencia ? (
                                            <span>Ref: {artigo.referencia}</span>
                                          ) : null}
                                          {artigo.hasMultipleValidityDates ? (
                                            <span>Múltiplas validades (mostra a mais próxima)</span>
                                          ) : null}
                                          {artigo.expiresBeforeInspection ? (
                                            <span className="font-semibold text-red-700">
                                              Expira antes da próxima inspeção
                                            </span>
                                          ) : (
                                            <span>Validade &lt; 12 meses na próxima inspeção</span>
                                          )}
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}
                              <div className="flex gap-2 mt-2">
                                {pausedInspectionDrafts[j.id] ? (
                                  <Link
                                    href={`/jangadas/${j.id}?continueInspection=1`}
                                    className="bg-sky-600 px-2 py-1 rounded text-xs text-white hover:bg-sky-700"
                                  >
                                    Continuar
                                  </Link>
                                ) : null}
                                <Link
                                  href={`/jangadas/${j.id}`}
                                  className="bg-indigo-600 hover:bg-indigo-700 px-2 py-1 rounded text-xs text-white font-medium flex items-center justify-center"
                                >
                                  Dossier
                                </Link>
                                <button
                                  className="bg-yellow-400 px-2 py-1 rounded text-xs font-medium"
                                  onClick={() => handleEdit(j)}
                                >
                                  Editar
                                </button>
                                <button
                                  className="bg-red-500 px-2 py-1 rounded text-xs text-white font-medium"
                                  onClick={() => handleDelete(j.id)}
                                >
                                  Excluir
                                </button>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    ))
                  )}
                </div>
              )}
              {viewMode === 'quadros' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {sortedQuadrosJangadas.length === 0 ? (
                    <div className="col-span-full text-center text-gray-500">
                      Nenhuma jangada encontrada.
                    </div>
                  ) : (
                    sortedQuadrosJangadas.map(j => (
                      <div
                        key={j.id}
                        className={`border rounded-xl shadow-md p-4 flex flex-col cursor-pointer hover:shadow-lg transition-all ${pausedInspectionDrafts[j.id] ? 'border-sky-300 ring-1 ring-sky-200 bg-sky-50' : 'bg-blue-50 hover:bg-blue-100/40'}`}
                        onClick={e => handleRowClick(j.id, e)}
                      >
                        <div className="font-bold text-lg mb-1">
                          <Link
                            href={`/jangadas/${j.id}`}
                            className="text-blue-700 hover:underline"
                          >
                            {j.brand} {j.model}
                          </Link>
                        </div>
                        <div className="mb-2">
                          <div className="flex flex-wrap gap-2">
                            {renderPausedInspectionBadge(pausedInspectionDrafts[j.id])}
                          </div>
                        </div>
                        <div className="text-xs text-gray-500 mb-1">
                          Série:{' '}
                          <Link
                            href={`/jangadas/${j.id}`}
                            className="text-blue-700 hover:underline font-medium"
                          >
                            {j.serial}
                          </Link>
                        </div>
                        <div className="text-sm text-gray-700 mb-2">
                          Proprietário: {j.navio?.cliente?.nome || j.owner || '—'}
                        </div>
                        <div className="text-xs text-gray-500 mb-1">
                          Capacidade: {formatCapacityValue(j.capacity)} | Tipo:{' '}
                          {j.launchType || '—'} | Pack: {j.packType || '—'}
                        </div>
                        <div className="text-xs text-gray-500 mb-1">
                          Sistema insuflação: {getInflationSystemLabel(j)}
                        </div>
                        <div className="text-xs text-gray-500 mb-1">
                          Navio:{' '}
                          {j.shipId ? (
                            <Link
                              href={`/navios/${j.shipId}`}
                              className="text-blue-700 hover:underline font-medium"
                            >
                              {j.shipNameManual || j.navio?.nome || '—'}
                            </Link>
                          ) : (
                            j.shipNameManual || j.navio?.nome || '—'
                          )}
                        </div>
                        <div
                          className={`mb-1 text-xs font-medium ${isInspectionDueWithin30Days(j.dataProxInspecao) ? 'text-red-600' : 'text-gray-600'}`}
                        >
                          Próx. inspeção: {formatInspectionDate(j.dataProxInspecao)}
                        </div>
                        <div className="mb-2">
                          <div className="flex flex-wrap gap-1">
                            {renderInspectionUrgencyBadge(j.dataProxInspecao)}
                            {renderHydroTestUrgencyBadge(j.cylinderDataProxTeste)}
                            {renderHruUrgencyBadge(j.hruValidade)}
                            {renderConsumablesAlertBadge(j)}
                          </div>
                        </div>
                        <div className="mb-2">{renderBulletinBadges(j, 2)}</div>
                        <div className="flex gap-2 mt-2">
                          {pausedInspectionDrafts[j.id] ? (
                            <Link
                              href={`/jangadas/${j.id}?continueInspection=1`}
                              className="bg-sky-600 px-2 py-1 rounded text-xs text-white hover:bg-sky-700"
                            >
                              Continuar
                            </Link>
                          ) : null}
                          <Link
                            href={`/jangadas/${j.id}`}
                            className="bg-indigo-600 hover:bg-indigo-700 px-2 py-1 rounded text-xs text-white font-medium flex items-center justify-center"
                          >
                            Dossier
                          </Link>
                          <button
                            className="bg-yellow-400 px-2 py-1 rounded text-xs font-medium"
                            onClick={() => handleEdit(j)}
                          >
                            Editar
                          </button>
                          <button
                            className="bg-red-500 px-2 py-1 rounded text-xs text-white font-medium"
                            onClick={() => handleDelete(j.id)}
                          >
                            Excluir
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
              {viewMode === 'conformidade' && (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
                  <table className="min-w-[900px] w-full text-xs sm:text-sm text-left">
                    <thead>
                      <tr className="bg-indigo-50/50 border-b border-indigo-100 text-indigo-950 font-bold">
                        <th className="p-3">Jangada</th>
                        <th className="p-3">Nº Série</th>
                        <th className="p-3">Navio/Cliente</th>
                        <th className="p-3">Pack & Capacidade</th>
                        <th className="p-3 text-center">Progresso Pack</th>
                        <th className="p-3 text-center">Estado Geral</th>
                        <th className="p-3 text-center">Itens em Falta</th>
                        <th className="p-3 text-center">Itens Expirados</th>
                        <th className="p-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sortedFilteredJangadas.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-6 text-center text-gray-500">
                            Nenhuma jangada encontrada.
                          </td>
                        </tr>
                      ) : (
                        sortedFilteredJangadas.map(j => {
                          const { total, complete, incomplete, missing, expired, percent } =
                            calculateComplianceSummary(j);

                          let complianceState = (
                            <span className="bg-red-100 text-red-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                              Inconforme
                            </span>
                          );
                          if (missing === 0 && expired === 0) {
                            if (incomplete === 0) {
                              complianceState = (
                                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                                  Conforme
                                </span>
                              );
                            } else {
                              complianceState = (
                                <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                                  Qtd Insuficiente
                                </span>
                              );
                            }
                          }

                          return (
                            <tr key={j.id} className="hover:bg-slate-50/55 transition-colors">
                              <td className="p-3 font-semibold text-slate-800">
                                <Link
                                  href={`/jangadas/${j.id}`}
                                  className="text-blue-700 hover:underline font-bold"
                                >
                                  {j.brand} {j.model}
                                </Link>
                              </td>
                              <td className="p-3 font-mono text-slate-650">{j.serial}</td>
                              <td className="p-3 text-slate-650">
                                <div className="font-semibold text-slate-800">
                                  {j.shipId ? (
                                    <Link
                                      href={`/navios/${j.shipId}`}
                                      className="text-blue-700 hover:underline"
                                    >
                                      {j.shipNameManual || j.navio?.nome || '—'}
                                    </Link>
                                  ) : (
                                    j.shipNameManual || j.navio?.nome || '—'
                                  )}
                                </div>
                                <div className="text-xs text-slate-450">
                                  {j.navio?.cliente?.nome || j.owner || '—'}
                                </div>
                              </td>
                              <td className="p-3 text-slate-600">
                                <span className="font-bold text-slate-700">
                                  {j.packType || '—'}
                                </span>{' '}
                                ({formatCapacityValue(j.capacity)})
                              </td>
                              <td className="p-3">
                                <div className="flex items-center gap-2 max-w-[150px] mx-auto">
                                  <div className="w-full bg-slate-100 rounded-full h-2">
                                    <div
                                      className={`h-2 rounded-full ${
                                        percent === 100
                                          ? 'bg-emerald-500'
                                          : percent > 50
                                            ? 'bg-amber-500'
                                            : 'bg-red-500'
                                      }`}
                                      style={{ width: `${percent}%` }}
                                    ></div>
                                  </div>
                                  <span className="text-xs font-bold text-slate-700">
                                    {percent}%
                                  </span>
                                </div>
                              </td>
                              <td className="p-3 text-center">{complianceState}</td>
                              <td className="p-3 text-center">
                                {missing > 0 ? (
                                  <span className="bg-red-50 text-red-700 text-xs font-bold px-2.5 py-0.5 rounded-xl border border-red-200">
                                    {missing} itens
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="p-3 text-center">
                                {expired > 0 ? (
                                  <span className="bg-amber-50 text-amber-700 text-xs font-bold px-2.5 py-0.5 rounded-xl border border-amber-200">
                                    {expired} itens
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="p-3 text-right">
                                <div className="flex gap-2 justify-end">
                                  <Link
                                    href={`/jangadas/${j.id}`}
                                    className="bg-indigo-600 hover:bg-indigo-700 px-3 py-1 rounded text-xs text-white font-semibold shadow-sm"
                                  >
                                    Dossier
                                  </Link>
                                  <button
                                    onClick={async e => {
                                      e.stopPropagation();
                                      if (
                                        !confirm(
                                          `Sincronizar artigos da jangada série ${j.serial}?`,
                                        )
                                      )
                                        return;
                                      try {
                                        const res = await fetch(`/api/jangadas/${j.id}/sync-pack`, {
                                          method: 'POST',
                                        });
                                        if (!res.ok) throw new Error();
                                        const json = await res.json();
                                        if (json.warning) {
                                          alert(`Aviso: ${json.warning}`);
                                        } else {
                                          alert(
                                            `Sincronizado!\nAdicionados: ${json.summary?.added}\nAtualizados: ${json.summary?.updated}`,
                                          );
                                        }
                                        window.location.reload();
                                      } catch {
                                        alert('Erro ao sincronizar.');
                                      }
                                    }}
                                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 px-3 py-1 rounded text-xs font-semibold"
                                  >
                                    Sincronizar
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          <div className="mt-4 px-2 sm:px-0">
            <p className="text-xs text-gray-500">Jangadas carregadas: {jangadas.length}</p>
          </div>
        </div>
      </div>
    </div>
  );
}