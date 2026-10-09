"use client";
import React, { useEffect, useRef, useState } from 'react';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import {
  Check,
  X,
  RefreshCw,
  Minus,
  Ban,
  User,
  Search,
  Camera,
  Loader2,
  Trash2,
  Download,
  ChevronDown,
  Zap,
  CheckCheck,
  ListChecks,
  FolderOpen,
  FolderClosed,
  Keyboard,
} from 'lucide-react';
import { ABATE_MOTIVOS, ABATE_TIPOS_BARCO, getAbateMotivoCodes } from '@/lib/abate-constants';
import { appToast } from '@/lib/app-toast';
import * as XLSX from 'xlsx';
import { getStepNumberByKey } from './steps';
import { formatMonthPt, toMonthYearString } from '@/lib/date-utils';

const CHECKLIST_GROUPS = [
  {
    title: 'Exterior da Jangada',
    items: [
      { id: 'cobertura_exterior', label: 'Cobertura Exterior' },
      { id: 'saida_antena', label: 'Saída de Antena' },
      { id: 'refletores', label: 'Refletores' },
      { id: 'tubo_identificacao', label: 'Tubo de Identificação' },
      { id: 'costuras_juntas', label: 'Protectores de Juntas' },
      { id: 'camara_fundos', label: 'Câmara e Fundo' },
      { id: 'sistema_endireitar', label: 'Sistema de Endireitar' },
      { id: 'bolsas_estabilizacao', label: 'Bolsas de Estabilização' },
      { id: 'luz_exterior_bateria', label: 'Luz Exterior e Bateria' },
      { id: 'escada_borda', label: 'Rampa ou Escada' },
      { id: 'grinalda_espelhos', label: 'Grinalda e Espelhos' },
      { id: 'weak_link_painter', label: 'Ponta Fracável e Painter' },
    ]
  },
  {
    title: 'Interior da Jangada',
    items: [
      { id: 'escada_entrada', label: 'Escada de Entrada' },
      { id: 'grinalda_interior', label: 'Grinalda Interior' },
      { id: 'anel_linha', label: 'Anel com Linha' },
      { id: 'faca_seguranca', label: 'Facas de Segurança' },
      { id: 'cobertura_interior', label: 'Cobertura Interior' },
      { id: 'fecho_cobertura', label: 'Fecho da Cobertura' },
      { id: 'colectores_agua', label: 'Colectores de Água' },
      { id: 'manual_instrucoes', label: 'Manual de Instruções' },
      { id: 'tecido_camara_fundo', label: 'Tecido de Câmara e Fundo' },
      { id: 'luz_interior_bateria', label: 'Luz Interior e Bateria' },
    ]
  },
  {
    title: 'Container e Embalagem',
    items: [
      { id: 'container_estado', label: 'Contentor/Cesto de Transporte (danos, corrosão, amolgadelas)' },
      { id: 'fitas_fecho', label: 'Cintas de Fecho e Autocolante de Controlo' },
      { id: 'selo_hermetico', label: 'Selo Hermético / Vedação (Panzersure)' },
      { id: 'humidade_interior', label: 'Humidade Interior do Contentor' },
      { id: 'etiqueta_servico', label: 'Etiqueta de Serviço (data e estação da próxima vistoria)' },
      { id: 'painter_reserva', label: 'Painter e Ponta de Reserva no Cesto' },
    ]
  }
];

const STATUS_OPTIONS = [
  { value: 'OK', label: 'Bom Estado', icon: Check, color: 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border-emerald-200', active: 'bg-emerald-100 text-emerald-800 border-emerald-400 ring-1 ring-emerald-300' },
  { value: 'SUBSTITUIDO', label: 'Substituído', icon: RefreshCw, color: 'text-blue-600 bg-blue-50 hover:bg-blue-100 border-blue-200', active: 'bg-blue-100 text-blue-800 border-blue-400 ring-1 ring-blue-300' },
  { value: 'REPROVADO', label: 'Reprovado', icon: X, color: 'text-red-600 bg-red-50 hover:bg-red-100 border-red-200', active: 'bg-red-100 text-red-800 border-red-400 ring-1 ring-red-300' },
  { value: 'NA', label: 'N/A', icon: Minus, color: 'text-slate-600 bg-slate-50 hover:bg-slate-100 border-slate-200', active: 'bg-slate-200 text-slate-800 border-slate-400 ring-1 ring-slate-300' },
];

const COMMON_DEFECTS = [
  'Costuras degradadas',
  'Corrosão / dano no contentor',
  'HRU a expirar',
  'Autocolante de controlo rasgado',
  'Vedação Panzersure desgastada',
  'Etiqueta de serviço ilegível',
  'Cinta de fecho folgada',
  'Bateria da luz descarregada',
];

type ChecklistTab = 'all' | 'pending' | 'ok' | 'substituido' | 'reprovado';

const TAB_LABELS: Record<ChecklistTab, string> = {
  all: 'Todos',
  pending: 'Pendentes',
  ok: 'Bom Estado',
  substituido: 'Substituídos',
  reprovado: 'Reprovados',
};

const CYCLE_ORDER = ['OK', 'SUBSTITUIDO', 'REPROVADO', 'NA'] as const;

const requireEvidence = (status?: string) => status === 'REPROVADO' || status === 'SUBSTITUIDO';

function ExpandGroupsButton({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-600 bg-white border border-slate-300 hover:bg-slate-100 transition-colors"
    >
      {icon}
      {label}
    </button>
  );
}

export default function Step2_Checklist() {
  const { inspectionData, setInspectionData, hideOrcamento } = useJangadaWizardStore();
  const stepNo = getStepNumberByKey(inspectionData, 'checklist', { hideOrcamento });

  const [tecnicos, setTecnicos] = useState<any[]>([]);
  const [selectedTecnicoId, setSelectedTecnicoId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<ChecklistTab>('all');
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [quickMode, setQuickMode] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CHECKLIST_GROUPS.map((g) => [g.title, true]))
  );
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const detailsInputRef = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});

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
        if (inspectionData.responsavel) {
          const match = unique.find(t => t.nome?.toLowerCase() === String(inspectionData.responsavel).toLowerCase());
          if (match) setSelectedTecnicoId(String(match.id));
        }
      })
      .catch(err => console.error('Erro ao carregar técnicos:', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apenas na montagem do passo
  }, []);

  // Initialize checklist object if undefined (gera os itens em falta como OK)
  const checklist = inspectionData.checklist || {};

  useEffect(() => {
    const updatedChecklist = { ...checklist };
    let changed = false;
    CHECKLIST_GROUPS.forEach((group) => {
      group.items.forEach((item) => {
        if (!updatedChecklist[item.id] || !updatedChecklist[item.id].status) {
          updatedChecklist[item.id] = { ...(updatedChecklist[item.id] || {}), status: 'OK' };
          changed = true;
        }
      });
    });
    if (changed) setInspectionData({ checklist: updatedChecklist });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apenas na montagem do passo
  }, []);

  const handleTecnicoChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedTecnicoId(id);
    const tecnico = tecnicos.find(t => String(t.id) === String(id));
    setInspectionData({ responsavel: tecnico?.nome || 'Operador' });
  };

  const handleStatusChange = (itemId: string, status: string) => {
    setInspectionData({
      checklist: {
        ...checklist,
        [itemId]: { ...(checklist[itemId] || {}), status }
      }
    });
  };

  const cycleStatus = (itemId: string) => {
    const current = checklist[itemId]?.status || 'OK';
    const idx = CYCLE_ORDER.indexOf(current as (typeof CYCLE_ORDER)[number]);
    const next = CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length];
    handleStatusChange(itemId, next);
  };

  const handleNotesChange = (itemId: string, notes: string) => {
    setInspectionData({
      checklist: {
        ...checklist,
        [itemId]: { ...(checklist[itemId] || {}), notes }
      }
    });
  };

  const handleItemStockSelect = (itemId: string, stockId: string) => {
    const stockItem = (inspectionData.globalStock || []).find((s: any) => String(s.id) === String(stockId));
    const current = checklist[itemId] || {};
    setInspectionData({
      checklist: {
        ...checklist,
        [itemId]: {
          ...current,
          stockId: stockId || null,
          referencia: stockItem?.referencia || current.referencia || '',
          notes: stockItem ? `${stockItem.referencia ? stockItem.referencia + ' - ' : ''}${stockItem.descricao}` : current.notes,
        }
      }
    });
  };

  const handleItemRefChange = (itemId: string, referencia: string) => {
    const current = checklist[itemId] || {};
    setInspectionData({
      checklist: {
        ...checklist,
        [itemId]: { ...current, referencia }
      }
    });
  };

  const handlePhotoUpload = async (itemId: string, file: File | undefined | null) => {
    if (!file) return;
    setUploadingId(itemId);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("categoria", "documentos");
      const res = await fetch("/api/upload-documento", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro no upload");
      const fileUrl = json.url || json.path || json.fileUrl;
      if (fileUrl) {
        const current = checklist[itemId] || {};
        const fotos = Array.isArray(current.fotos) ? current.fotos : [];
        setInspectionData({
          checklist: {
            ...checklist,
            [itemId]: { ...current, status: current.status || 'OK', fotos: [...fotos, fileUrl] }
          }
        });
        appToast.success("Foto de evidência adicionada.");
      }
    } catch (err: unknown) {
      appToast.error(err instanceof Error ? err.message : "Erro ao carregar foto");
    } finally {
      setUploadingId(null);
    }
  };

  const removePhoto = (itemId: string, url: string) => {
    const current = checklist[itemId] || {};
    const fotos = Array.isArray(current.fotos) ? current.fotos : [];
    setInspectionData({
      checklist: {
        ...checklist,
        [itemId]: { ...current, fotos: fotos.filter((u: string) => u !== url) }
      }
    });
  };

  const setAllToOk = (groupItems: { id: string }[]) => {
    const updatedChecklist = { ...checklist };
    groupItems.forEach(item => {
      if (!updatedChecklist[item.id]) updatedChecklist[item.id] = {};
      updatedChecklist[item.id].status = 'OK';
    });
    setInspectionData({ checklist: updatedChecklist });
    appToast.success(`${groupItems.length} item(s) marcados como Bom Estado.`);
  };

  const setEverythingToOk = () => {
    setAllToOk(CHECKLIST_GROUPS.flatMap((g) => g.items));
  };

  const exportChecklistExcel = () => {
    const rows: Record<string, unknown>[] = [];
    CHECKLIST_GROUPS.forEach((group) => {
      group.items.forEach((item) => {
        const entry = checklist[item.id] || {};
        const statusLabel = STATUS_OPTIONS.find((s) => s.value === entry.status)?.label || '—';
        rows.push({
          Grupo: group.title,
          Item: item.label,
          Estado: statusLabel,
          Observações: entry.notes || '',
          'Evidências (fotos)': Array.isArray(entry.fotos) ? entry.fotos.length : 0,
        });
      });
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 22 }, { wch: 38 }, { wch: 14 }, { wch: 48 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Checklist');
    XLSX.writeFile(wb, `Checklist_${inspectionData.serial || 'jangada'}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    appToast.success('Checklist exportada para Excel.');
  };

  const appendDefect = (itemId: string, defect: string) => {
    const currentNotes = checklist[itemId]?.notes || '';
    const next = currentNotes.trim() ? `${currentNotes.trim()}; ${defect}` : defect;
    handleNotesChange(itemId, next);
  };

  const toggleGroup = (title: string) => {
    setExpanded((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const toggleRowDetails = (itemId: string) => {
    setExpandedRows((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const expandAllGroups = () => {
    setExpanded(Object.fromEntries(CHECKLIST_GROUPS.map((g) => [g.title, true])));
  };

  const collapseAllGroups = () => {
    setExpanded(Object.fromEntries(CHECKLIST_GROUPS.map((g) => [g.title, false])));
  };

  const isPending = (itemId: string) => {
    const s = checklist[itemId]?.status;
    return s !== 'OK' && s !== 'NA';
  };

  const matchesActiveTab = (itemId: string) => {
    const s = checklist[itemId]?.status;
    switch (activeTab) {
      case 'pending': return isPending(itemId);
      case 'ok': return s === 'OK';
      case 'substituido': return s === 'SUBSTITUIDO';
      case 'reprovado': return s === 'REPROVADO';
      default: return true;
    }
  };

  const matchesSearch = (item: { id: string; label: string }) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.label.toLowerCase().includes(q) ||
      (checklist[item.id]?.notes || '').toLowerCase().includes(q)
    );
  };

  const groupSummary = (groupItems: { id: string }[]) => {
    const counts: Record<string, number> = { OK: 0, SUBSTITUIDO: 0, REPROVADO: 0, NA: 0 };
    groupItems.forEach((item) => {
      const s = checklist[item.id]?.status;
      if (s === 'OK') counts.OK++;
      else if (s === 'SUBSTITUIDO') counts.SUBSTITUIDO++;
      else if (s === 'REPROVADO') counts.REPROVADO++;
      else if (s === 'NA') counts.NA++;
    });
    return counts;
  };

  const allSummary = groupSummary(CHECKLIST_GROUPS.flatMap((g) => g.items));
  const totalItems = CHECKLIST_GROUPS.flatMap((g) => g.items).length;
  const totalPending = totalItems - allSummary.OK - allSummary.NA;
  const overallPct = totalItems > 0 ? Math.round(((allSummary.OK + allSummary.NA) / totalItems) * 100) : 0;

  const tabs: { key: ChecklistTab; count: number }[] = [
    { key: 'all', count: totalItems },
    { key: 'pending', count: totalPending },
    { key: 'ok', count: allSummary.OK },
    { key: 'substituido', count: allSummary.SUBSTITUIDO },
    { key: 'reprovado', count: allSummary.REPROVADO },
  ];

  // Navegação por teclado dentro das linhas: setas ↑↓, 1-4 para estado,
  // Espaço/Enter cicla o estado, "n" foca as observações.
  const handleRowKeyDown = (item: { id: string; label: string }) => (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;

    const statusByKey: Record<string, string> = { 1: 'OK', 2: 'SUBSTITUIDO', 3: 'REPROVADO', 4: 'NA' };
    if (statusByKey[e.key]) {
      e.preventDefault();
      handleStatusChange(item.id, statusByKey[e.key]);
      return;
    }
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      cycleStatus(item.id);
      return;
    }
    if (e.key.toLowerCase() === 'n') {
      e.preventDefault();
      setExpandedRows((prev) => ({ ...prev, [item.id]: true }));
      window.setTimeout(() => {
        detailsInputRef.current[item.id]?.focus();
      }, 60);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-checklist-row]'));
      const idx = rows.findIndex((r) => r.dataset.checklistRow === item.id);
      if (idx === -1) return;
      const next = rows[e.key === 'ArrowDown' ? Math.min(idx + 1, rows.length - 1) : Math.max(idx - 1, 0)];
      next?.focus();
    }
  };

  const abate = inspectionData.abate || { ativo: false, tipoBarco: "", motivo: "", detalhes: "" };

  const setAbate = (patch: Partial<typeof abate>) => {
    setInspectionData({ abate: { ...abate, ...patch } });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">{stepNo > 0 ? `${stepNo}. ` : ''}Checklist Visual</h2>
        <p className="text-slate-600 mt-1">
          Verifique visualmente o estado do exterior, interior e do contentor da jangada.
          Com o Modo Rápido, usa as setas e as teclas 1–4 para registar o estado a alta velocidade.
        </p>
        <div className="mt-3 flex items-center gap-4 flex-wrap text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm">
          <div>
            <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] block">Data de Fabrico</span>
            <span className="font-bold text-slate-800">{formatMonthPt(inspectionData.dataFabrico) || 'N/D'}</span>
          </div>
        </div>
      </div>

      {/* Toolbar única — controlos globais */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border border-slate-200 rounded-2xl shadow-sm p-3 sm:p-4 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch">
          <div className="relative flex-1 min-w-0">
            <input
              type="text"
              placeholder="Pesquisar item (ex: cobertura, luz...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-9 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-indigo-100 font-medium text-slate-700"
            />
            <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2 text-xs text-slate-400 hover:text-slate-600 font-bold w-5 h-5 rounded-full hover:bg-slate-100"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200">
              <User size={15} className="text-slate-500 shrink-0" />
              <select
                value={selectedTecnicoId}
                onChange={handleTecnicoChange}
                className="bg-transparent border-0 outline-none text-sm font-medium text-slate-700 focus:ring-0 pr-6"
                title="Técnico responsável pelos registos deste checklist"
              >
                <option value="">-- Técnico --</option>
                {tecnicos.map(t => (
                  <option key={t.id} value={t.id}>{t.nome}</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => setQuickMode(!quickMode)}
              title="Modo rápido: navegação por teclado e ciclos de estado"
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-all ${
                quickMode
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
              }`}
            >
              <Zap size={13} />
              Modo Rápido
            </button>

            <button
              type="button"
              onClick={exportChecklistExcel}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors"
              title="Descarregar o checklist como folha de cálculo (registo de estação)"
            >
              <Download size={14} />
              Excel
            </button>

            <button
              type="button"
              onClick={setEverythingToOk}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors"
              title="Marca todos os itens do checklist como Bom Estado"
            >
              <CheckCheck size={14} />
              OK tudo
            </button>

            <div className="hidden xl:flex items-center gap-1.5">
              <ExpandGroupsButton onClick={expandAllGroups} icon={<FolderOpen size={12} />} label="Expandir" />
              <ExpandGroupsButton onClick={collapseAllGroups} icon={<FolderClosed size={12} />} label="Recolher" />
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Progresso global compacto */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="relative w-11 h-11 shrink-0">
              <svg viewBox="0 0 36 36" className="w-11 h-11 -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e2e8f0" strokeWidth="4" />
                <circle
                  cx="18" cy="18" r="15.5" fill="none"
                  stroke={overallPct === 100 ? "#10b981" : overallPct >= 60 ? "#6366f1" : "#f59e0b"}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={`${(overallPct / 100) * 97.4} 97.4`}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-slate-700">{overallPct}%</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                <span>Conformidade do checklist</span>
                <span>{totalPending > 0 ? `Faltam ${totalPending} item${totalPending === 1 ? '' : 's'}` : '100% conforme'}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-500"
                  style={{ width: `${overallPct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Tabs com contadores */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.key;
              const tone =
                tab.key === 'reprovado' && tab.count > 0 ? 'bg-red-100 text-red-700' :
                tab.key === 'substituido' && tab.count > 0 ? 'bg-blue-100 text-blue-700' :
                tab.key === 'ok' && tab.count > 0 ? 'bg-emerald-100 text-emerald-700' :
                'bg-white text-slate-600 border border-slate-200';
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : `${tone} hover:bg-slate-200`
                  }`}
                >
                  {TAB_LABELS[tab.key]}
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black leading-none ${
                    isActive ? 'bg-white/25 text-white' : 'bg-slate-200/70 text-slate-600'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {quickMode && (
          <div className="flex items-center gap-2 text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2 flex-wrap">
            <Keyboard size={13} className="shrink-0" />
            <span>Setas ↑↓ movem a linha · <b>1–4</b> define estado (OK/Subst/Reprov/N/A) · <b>Espaço</b> cicla · <b>N</b> observações</span>
          </div>
        )}
      </div>

      {/* Grupos do checklist (accordion) */}
      <div className="space-y-4">
        {CHECKLIST_GROUPS.map((group) => {
          const counts = groupSummary(group.items);
          const groupTotal = group.items.length;
          const doneInGroup = counts.OK + counts.NA;
          const groupPct = groupTotal > 0 ? Math.round((doneInGroup / groupTotal) * 100) : 0;
          const isExpanded = expanded[group.title] !== false;
          const hasReprovado = counts.REPROVADO > 0;
          const hasPending = counts.REPROVADO > 0 || counts.SUBSTITUIDO > 0;

          const visibleItems = group.items.filter((item) => matchesActiveTab(item.id) && matchesSearch(item));

          return (
            <section
              key={group.title}
              className={`rounded-2xl bg-white border shadow-sm overflow-hidden transition-colors ${
                hasReprovado ? 'border-red-200' : 'border-slate-200'
              }`}
            >
              <div className="flex items-center gap-4 px-4 sm:px-6 py-4 hover:bg-slate-50 transition-colors">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.title)}
                  aria-expanded={isExpanded}
                  className="flex items-center gap-4 w-full min-w-0 text-left"
                >
                  <div className="relative w-12 h-12 shrink-0">
                    <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
                      <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e2e8f0" strokeWidth="3.5" />
                      <circle
                        cx="18" cy="18" r="15.5" fill="none"
                        stroke={groupPct === 100 ? "#10b981" : hasReprovado ? "#ef4444" : "#6366f1"}
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeDasharray={`${(groupPct / 100) * 97.4} 97.4`}
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-[11px] font-black text-slate-700">{groupPct}%</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base sm:text-lg font-bold text-slate-800">{group.title}</h3>
                      <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                        {doneInGroup}/{groupTotal} verificados
                      </span>
                      {hasReprovado && (
                        <span className="text-[11px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                          {counts.REPROVADO} reprovado{counts.REPROVADO === 1 ? '' : 's'}
                        </span>
                      )}
                      {hasPending && !hasReprovado && (
                        <span className="text-[11px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                          {counts.SUBSTITUIDO} substituído{counts.SUBSTITUIDO === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden max-w-xs">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            groupPct === 100 ? 'bg-emerald-500' : hasReprovado ? 'bg-red-500' : 'bg-indigo-500'
                          }`}
                          style={{ width: `${groupPct}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-semibold text-slate-400 whitespace-nowrap">
                        {visibleItems.length} em vista
                      </span>
                    </div>
                  </div>
                </button>

                <div className="flex items-center gap-2 shrink-0">
                  {!isExpanded && (
                    <button
                      type="button"
                      onClick={() => { setAllToOk(group.items); }}
                      className="text-[11px] font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-2.5 py-1 rounded-lg transition-colors"
                    >
                      OK grupo
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.title)}
                    aria-label={isExpanded ? 'Recolher grupo' : 'Expandir grupo'}
                    className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors"
                  >
                    <ChevronDown
                      size={20}
                      className={`text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-slate-100 divide-y divide-slate-100">
                  {visibleItems.length === 0 ? (
                    <p className="px-6 py-6 text-sm text-slate-400 italic">Sem itens neste filtro.</p>
                  ) : (
                    visibleItems.map((item) => {
                      const currentStatus = checklist[item.id]?.status;
                      const currentNotes = checklist[item.id]?.notes || '';
                      const itemFotos = Array.isArray(checklist[item.id]?.fotos) ? (checklist[item.id]?.fotos as string[]) : [];
                      const isUploading = uploadingId === item.id;
                      const needsEvidence = requireEvidence(currentStatus);
                      const showDetails = expandedRows[item.id] || needsEvidence;

                      return (
                        <div
                          key={item.id}
                          data-checklist-row={item.id}
                          tabIndex={0}
                          onKeyDown={handleRowKeyDown(item)}
                          className="focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400 outline-none"
                        >
                          <div className="px-4 sm:px-6 py-3 flex flex-col lg:flex-row lg:items-center gap-3">
                            <div className="flex-1 min-w-0 flex items-start gap-2.5">
                              <span
                                className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${
                                  currentStatus === 'OK' ? 'bg-emerald-500'
                                  : currentStatus === 'SUBSTITUIDO' ? 'bg-blue-500'
                                  : currentStatus === 'REPROVADO' ? 'bg-red-500'
                                  : 'bg-slate-300'
                                }`}
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-semibold text-slate-800 leading-snug">{item.label}</p>
                                  {!currentStatus && (
                                    <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-full animate-pulse">
                                      Por avaliar
                                    </span>
                                  )}
                                </div>
                                {quickMode && (
                                  <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                                    1·2·3·4 estado · N notas · Espaço cicla
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                              {STATUS_OPTIONS.map((opt) => {
                                const isSelected = currentStatus === opt.value;
                                return (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => handleStatusChange(item.id, opt.value)}
                                    title={`${opt.label} (tecla ${opt.value === 'OK' ? '1' : opt.value === 'SUBSTITUIDO' ? '2' : opt.value === 'REPROVADO' ? '3' : '4'})`}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                      isSelected
                                        ? opt.active
                                        : `${opt.color}`
                                    }`}
                                  >
                                    <opt.icon size={14} />
                                    {opt.label}
                                  </button>
                                );
                              })}
                              <button
                                type="button"
                                onClick={() => toggleRowDetails(item.id)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors"
                                title={showDetails ? 'Recolher detalhes' : 'Observações / fotos'}
                              >
                                <ListChecks size={13} />
                                {currentNotes ? 'Notas' : 'Detalhes'}
                              </button>
                            </div>
                          </div>

                          {showDetails && (
                            <div className={`px-4 sm:px-6 pb-4 ${needsEvidence ? 'bg-red-50/40 border-t border-red-100' : 'border-t border-slate-100 bg-slate-50/40'}`}>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3">
                                 <div className="space-y-1.5">
                                   <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                     Observações
                                   </label>
                                   <input
                                     ref={(el) => { detailsInputRef.current[item.id] = el; }}
                                     type="text"
                                     placeholder="Observações (opcional)"
                                     value={currentNotes}
                                     onChange={(e) => handleNotesChange(item.id, e.target.value)}
                                     className={`w-full text-sm border-slate-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-100 transition-colors ${needsEvidence ? 'border-red-300 bg-red-50' : ''}`}
                                   />
                                   <div className="flex flex-wrap gap-1.5">
                                     {COMMON_DEFECTS.map((defect) => {
                                       const active = currentNotes.toLowerCase().includes(defect.toLowerCase());
                                       return (
                                         <button
                                           key={defect}
                                           type="button"
                                           onClick={() => appendDefect(item.id, defect)}
                                           className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
                                             active
                                               ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                                               : 'bg-white text-slate-500 border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200'
                                           }`}
                                         >
                                           {active ? '✓ ' : '+ '}{defect}
                                         </button>
                                       );
                                     })}
                                   </div>
                                 </div>

                                 {item.id === 'tubo_identificacao' && currentStatus === 'SUBSTITUIDO' && (
                                   <div className="col-span-full grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                                     <div className="space-y-1">
                                       <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Artigo de Stock (Tubo de Identificação)</label>
                                       <select
                                         value={checklist[item.id]?.stockId || ''}
                                         onChange={(e) => handleItemStockSelect(item.id, e.target.value)}
                                         className="w-full text-sm border-slate-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-100 transition-colors"
                                       >
                                         <option value="">Selecionar artigo do stock...</option>
                                         {((inspectionData.globalStock || []).filter((s: any) => {
                                           const d = String(s.descricao || "").toLowerCase();
                                           return d.includes("tubo") || d.includes("identifica") || d.includes("etiqueta");
                                         }).length > 0
                                           ? (inspectionData.globalStock || []).filter((s: any) => {
                                               const d = String(s.descricao || "").toLowerCase();
                                               return d.includes("tubo") || d.includes("identifica") || d.includes("etiqueta");
                                             })
                                           : (inspectionData.globalStock || [])
                                         ).map((s: any) => (
                                           <option key={s.id} value={s.id}>
                                             {s.referencia ? `${s.referencia} - ` : ''}{s.descricao} {s.quantidade > 0 ? `(Qtd: ${s.quantidade})` : ''}
                                           </option>
                                         ))}
                                       </select>
                                     </div>
                                     <div className="space-y-1">
                                       <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Referência (P/N)</label>
                                       <input
                                         type="text"
                                         placeholder="Ex: REF-TUBO-01"
                                         value={checklist[item.id]?.referencia || ''}
                                         onChange={(e) => handleItemRefChange(item.id, e.target.value)}
                                         className="w-full text-sm border-slate-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-100 transition-colors"
                                       />
                                     </div>
                                   </div>
                                 )}

                                <div className="space-y-1.5">
                                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                    Evidências (fotos)
                                    {needsEvidence && <span className="text-red-600 ml-1.5">· exigida</span>}
                                  </label>
                                  <div className="flex flex-wrap items-center gap-2">
                                    {itemFotos.map((url: string, i: number) => (
                                      <div key={i} className="relative group">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          src={url}
                                          alt={`Evidência ${i + 1}`}
                                          className="w-14 h-14 rounded-lg object-cover border border-slate-200 shadow-sm"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => removePhoto(item.id, url)}
                                          title="Remover foto"
                                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                          <Trash2 size={10} />
                                        </button>
                                      </div>
                                    ))}
                                    {needsEvidence && (
                                      <label
                                        className={`w-14 h-14 rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer transition-colors ${
                                          currentStatus === 'REPROVADO' ? 'border-red-300 hover:border-red-400 bg-red-50/40' : 'border-slate-300 hover:border-indigo-400 bg-white hover:bg-indigo-50/40'
                                        }`}
                                      >
                                        {isUploading ? (
                                          <Loader2 size={16} className="animate-spin text-indigo-500" />
                                        ) : (
                                          <span className="flex flex-col items-center text-slate-400">
                                            <Camera size={15} />
                                            <span className="text-[8px] font-bold uppercase mt-0.5">Foto</span>
                                          </span>
                                        )}
                                        <input
                                          type="file"
                                          accept="image/*"
                                          capture="environment"
                                          className="hidden"
                                          disabled={isUploading}
                                          onChange={(e) => handlePhotoUpload(item.id, e.target.files?.[0])}
                                        />
                                      </label>
                                    )}
                                    {itemFotos.length === 0 && needsEvidence && (
                                      <span className="text-[10px] font-bold text-red-600">Sem evidência ainda</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* Abate de Jangada — Ficha de Abate (IM.049/00) */}
      <div className={`border rounded-2xl overflow-hidden bg-white shadow-sm transition-colors ${abate.ativo ? 'border-red-300 ring-2 ring-red-100' : 'border-slate-200'}`}>
        <div className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Ban className={`${abate.ativo ? 'text-red-600' : 'text-slate-400'}`} size={20} />
            <div>
              <h3 className="text-lg font-bold text-slate-800">Abate da Jangada</h3>
              <p className="text-xs text-slate-500">Assinala a jangada para abate e emite a Ficha de Abate de Jangadas Salva-Vidas no final.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-600">{abate.ativo ? 'Assinalada para Abate' : 'Em Serviço'}</span>
            <button
              role="switch"
              aria-checked={abate.ativo}
              onClick={() => setAbate({ ativo: !abate.ativo })}
              className={`relative w-12 h-7 rounded-full transition-colors ${abate.ativo ? 'bg-red-500' : 'bg-slate-300'}`}
            >
              <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${abate.ativo ? 'left-6' : 'left-1'}`} />
            </button>
          </div>
        </div>

        {abate.ativo && (
          <div className="border-t border-slate-100 px-6 py-5 grid grid-cols-1 lg:grid-cols-2 gap-5 bg-red-50/30">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Motivos de Abate (código 13–27) — pode escolher vários</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 border border-slate-200 rounded-xl bg-white p-2">
                {ABATE_MOTIVOS.map((m) => {
                  const selected = getAbateMotivoCodes(abate.motivo).includes(m.codigo);
                  return (
                    <label
                      key={m.codigo}
                      className={`flex items-start gap-2 px-2.5 py-1.5 rounded-lg border cursor-pointer text-xs transition-all ${
                        selected
                          ? "border-red-300 bg-red-50 text-slate-800"
                          : "border-transparent hover:bg-slate-50 text-slate-600"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => {
                          const codes = getAbateMotivoCodes(abate.motivo);
                          const next = codes.includes(m.codigo)
                            ? codes.filter((c) => c !== m.codigo)
                            : [...codes, m.codigo];
                          setAbate({ motivo: next.sort((a, b) => a - b).join(";") });
                        }}
                        className="mt-0.5 shrink-0 rounded border-slate-300 text-red-600 focus:ring-red-200"
                      />
                      <span>{m.codigo}. {m.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Tipo de Barco (código 1–12)</label>
              <select
                value={abate.tipoBarco}
                onChange={(e) => setAbate({ tipoBarco: e.target.value })}
                className="w-full border-slate-200 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-red-200 font-medium text-slate-700"
              >
                <option value="">-- Selecione o tipo de barco --</option>
                {ABATE_TIPOS_BARCO.map((t) => (
                  <option key={t.codigo} value={t.label}>
                    {t.codigo}. {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 lg:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Campo 28 — Detalhes do Abate</label>
              <textarea
                value={abate.detalhes}
                onChange={(e) => setAbate({ detalhes: e.target.value })}
                rows={3}
                placeholder="Ex: Jangada abatida de acordo com o SB 18/08 Ver.2 — inspeção reforçada das costuras adesivas reprovada."
                className="w-full border-slate-200 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-red-200 font-medium text-slate-700"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}