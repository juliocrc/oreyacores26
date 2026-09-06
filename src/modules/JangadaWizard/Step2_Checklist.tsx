"use client";
import React, { useEffect, useState } from 'react';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import { Check, X, RefreshCw, Minus, Ban, User } from 'lucide-react';
import { ABATE_MOTIVOS, ABATE_TIPOS_BARCO } from '@/lib/abate-constants';

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
  }
];

const STATUS_OPTIONS = [
  { value: 'OK', label: 'Bom Estado', icon: Check, color: 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border-emerald-200' },
  { value: 'SUBSTITUIDO', label: 'Substituído', icon: RefreshCw, color: 'text-blue-600 bg-blue-50 hover:bg-blue-100 border-blue-200' },
  { value: 'REPROVADO', label: 'Reprovado', icon: X, color: 'text-red-600 bg-red-50 hover:bg-red-100 border-red-200' },
  { value: 'NA', label: 'N/A', icon: Minus, color: 'text-slate-600 bg-slate-50 hover:bg-slate-100 border-slate-200' },
];

export default function Step2_Checklist() {
  const { inspectionData, setInspectionData } = useJangadaWizardStore();

  const [tecnicos, setTecnicos] = useState<any[]>([]);
  const [selectedTecnicoId, setSelectedTecnicoId] = useState<string>('');

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
  }, [inspectionData.responsavel]);

  // Initialize checklist object if undefined
  const checklist = inspectionData.checklist || {};

  // Marca por defeito todos os itens do checklist (Exterior e Interior) como OK
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

  const handleNotesChange = (itemId: string, notes: string) => {
    setInspectionData({
      checklist: {
        ...checklist,
        [itemId]: { ...(checklist[itemId] || {}), notes }
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
  };

  const abate = inspectionData.abate || { ativo: false, tipoBarco: "", motivo: "", detalhes: "" };

  const setAbate = (patch: Partial<typeof abate>) => {
    setInspectionData({ abate: { ...abate, ...patch } });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">2. Checklist Visual</h2>
        <p className="text-slate-600 mt-1">Verifique visualmente o estado do exterior e interior da jangada.</p>
      </div>

      <div className="space-y-10">
        {CHECKLIST_GROUPS.map((group) => (
          <div key={group.title} className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h3 className="text-lg font-bold text-slate-800">{group.title}</h3>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <User size={16} className="text-slate-500 shrink-0" />
                  <select
                    value={selectedTecnicoId}
                    onChange={handleTecnicoChange}
                    className="border-slate-200 rounded-xl px-3 py-1.5 bg-white text-sm focus:ring-2 focus:ring-indigo-100 font-medium text-slate-700"
                  >
                    <option value="">-- Técnico --</option>
                    {tecnicos.map(t => (
                      <option key={t.id} value={t.id}>{t.nome}</option>
                    ))}
                  </select>
                </div>
                <button 
                  onClick={() => setAllToOk(group.items)}
                  className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-3 py-1.5 rounded-lg hover:bg-emerald-200 transition-colors"
                >
                  Marcar tudo como Bom Estado (OK)
                </button>
              </div>
            </div>
            
            <div className="divide-y divide-slate-100">
              {group.items.map((item) => {
                const currentStatus = checklist[item.id]?.status;
                const currentNotes = checklist[item.id]?.notes || '';
                
                return (
                  <div key={item.id} className="p-4 sm:px-6 hover:bg-slate-50/50 transition-colors flex flex-col xl:flex-row gap-4 xl:items-center justify-between">
                    <div className="w-full xl:w-1/3">
                      <p className="font-semibold text-slate-800">{item.label}</p>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 xl:w-auto shrink-0">
                      {STATUS_OPTIONS.map((opt) => {
                        const isSelected = currentStatus === opt.value;
                        return (
                          <button
                            key={opt.value}
                            onClick={() => handleStatusChange(item.id, opt.value)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                              isSelected 
                                ? `${opt.color} ring-2 ring-offset-1 ring-opacity-50 ${opt.color.split(' ')[0].replace('text', 'ring')}` 
                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <opt.icon size={16} />
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="w-full xl:w-1/3">
                      <input
                        type="text"
                        placeholder="Observações (opcional)"
                        value={currentNotes}
                        onChange={(e) => handleNotesChange(item.id, e.target.value)}
                        className={`w-full text-sm border-slate-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-100 transition-colors ${currentStatus === 'REPROVADO' ? 'border-red-300 bg-red-50' : ''}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

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
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Motivo de Abate (código 13–27)</label>
                <select
                  value={abate.motivo}
                  onChange={(e) => setAbate({ motivo: e.target.value })}
                  className="w-full border-slate-200 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-red-200 font-medium text-slate-700"
                >
                  <option value="">-- Selecione o motivo --</option>
                  {ABATE_MOTIVOS.map((m) => (
                    <option key={m.codigo} value={String(m.codigo)}>
                      {m.codigo}. {m.label}
                    </option>
                  ))}
                </select>
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
    </div>
  );
}
