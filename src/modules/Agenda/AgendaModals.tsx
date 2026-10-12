import React, { useEffect, useState } from 'react';
import { useAgendaStore } from '@/lib/store/useAgendaStore';
import { AZORES_TECHNICIANS, normalizeTechnicianName } from '@/lib/agenda-technicians';
import type { InspectionEvent } from '@/types/agenda-page';
import { getInspectionDefaults, normalizeInspectionType, type InspectionType } from '@/types/agenda';

type AgendaModalsProps = {
  handleQuickSchedule: () => void;
  editingEvent?: InspectionEvent | null;
  onSaveEdit: (event: InspectionEvent) => void;
  onCloseEdit: () => void;
};

export default function AgendaModals({ handleQuickSchedule, editingEvent, onSaveEdit, onCloseEdit }: AgendaModalsProps) {
  const { 
    quickScheduleTarget, 
    setQuickScheduleTarget, 
    quickScheduleDateTime, 
    setQuickScheduleDateTime, 
    quickScheduleResponsavel, 
    setQuickScheduleResponsavel 
  } = useAgendaStore();

  const [editDateTime, setEditDateTime] = useState('');
  const [editResponsavel, setEditResponsavel] = useState('');
  const [editType, setEditType] = useState<InspectionType>('anual');

  useEffect(() => {
    if (!editingEvent) return;
    const date = new Date(editingEvent.start);
    const pad = (value: number) => String(value).padStart(2, '0');
    setEditDateTime(`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`);
    setEditResponsavel(editingEvent.responsavel || '');
    setEditType(normalizeInspectionType(editingEvent.inspectionType));
  }, [editingEvent]);

  if (editingEvent) {
    const saveEdit = () => {
      const start = new Date(editDateTime);
      if (Number.isNaN(start.getTime())) return;
      const defaults = getInspectionDefaults(editType);
      onSaveEdit({
        ...editingEvent,
        start,
        end: new Date(start.getTime() + defaults.durationMinutes * 60000),
        responsavel: normalizeTechnicianName(editResponsavel),
        inspectionType: editType,
        durationMinutes: defaults.durationMinutes,
        bufferBeforeMinutes: defaults.bufferBeforeMinutes,
        bufferAfterMinutes: defaults.bufferAfterMinutes,
      });
      onCloseEdit();
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCloseEdit}>
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-5" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900">Editar agendamento</h3>
            <button onClick={onCloseEdit} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
          </div>
          <div className="mb-3 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
            <p className="text-sm font-medium text-indigo-900">{editingEvent.title.split(' • ')[0].replace('Navio:', '').trim()}</p>
            <p className="text-xs text-indigo-600">Jangada: {editingEvent.raftSerial}</p>
          </div>
          <label className="block text-sm font-medium text-gray-700 mb-3">Data e hora
            <input type="datetime-local" value={editDateTime} onChange={e => setEditDateTime(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
          </label>
          <label className="block text-sm font-medium text-gray-700 mb-3">Tipo
            <select value={editType} onChange={e => setEditType(e.target.value as InspectionType)} className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
              <option value="anual">Inspeção anual</option>
              <option value="anual_gi">Inspeção anual + GI</option>
              <option value="hidraulico">Teste hidráulico</option>
              <option value="reinspecao">Reinspeção</option>
              <option value="outro">Outro</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-gray-700">Responsável
            <select value={editResponsavel} onChange={e => setEditResponsavel(normalizeTechnicianName(e.target.value))} className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
              <option value="">Sem responsável definido</option>
              {AZORES_TECHNICIANS.map(tech => <option key={tech.id} value={tech.name}>{tech.name} · {tech.role}</option>)}
            </select>
          </label>
          <div className="flex gap-2 mt-4">
            <button onClick={saveEdit} disabled={!editDateTime} className="flex-1 bg-indigo-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">Guardar</button>
            <button onClick={onCloseEdit} className="px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50">Cancelar</button>
          </div>
        </div>
      </div>
    );
  }

  if (!quickScheduleTarget) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setQuickScheduleTarget(null)}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Agendar inspeção</h3>
          <button onClick={() => setQuickScheduleTarget(null)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
        </div>
        <div className="mb-3 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
          <p className="text-sm font-medium text-blue-900">{quickScheduleTarget.shipName}</p>
          <p className="text-xs text-blue-600">Jangada: {quickScheduleTarget.label}</p>
          {quickScheduleTarget.dataProxInspecao && (
            <p className="text-xs text-blue-500">Validade: {new Date(quickScheduleTarget.dataProxInspecao).toLocaleDateString('pt-PT')}</p>
          )}
        </div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Data e Hora
          <input
            type="datetime-local"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={quickScheduleDateTime}
            onChange={e => setQuickScheduleDateTime(e.target.value)}
          />
        </label>
        <label className="block text-sm font-medium text-gray-700 mt-3 mb-1">
          Responsável
          <select
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={quickScheduleResponsavel}
            onChange={e => setQuickScheduleResponsavel(normalizeTechnicianName(e.target.value))}
          >
            <option value="">Sem responsável definido</option>
            {AZORES_TECHNICIANS.map((tech) => (
              <option key={tech.id} value={tech.name}>{tech.name} · {tech.role}</option>
            ))}
          </select>
          <div className="mt-2 flex flex-wrap gap-2">
            {AZORES_TECHNICIANS.map((tech) => {
              const isActive = quickScheduleResponsavel === tech.name;
              return (
                <button
                  key={tech.id}
                  type="button"
                  onClick={() => setQuickScheduleResponsavel(tech.name)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${isActive ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'}`}
                >
                  {tech.name.split(' ')[0]}
                </button>
              );
            })}
          </div>
        </label>
        <div className="flex gap-2 mt-4">
          <button
            onClick={handleQuickSchedule}
            disabled={!quickScheduleDateTime}
            className="flex-1 bg-indigo-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >Agendar</button>
          <button
            onClick={() => setQuickScheduleTarget(null)}
            className="px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50"
          >Cancelar</button>
        </div>
      </div>
    </div>
  );
}
