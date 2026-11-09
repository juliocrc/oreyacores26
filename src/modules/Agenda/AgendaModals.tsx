import React, { useEffect, useRef, useState } from 'react';
import { useAgendaStore } from '@/lib/store/useAgendaStore';
import { normalizeTechnicianName } from '@/lib/agenda-technicians';
import type { InspectionEvent, StaffTechnician } from '@/types/agenda-page';
import { getInspectionDefaults, normalizeInspectionType, resolveAgendaDuration, type InspectionType } from '@/types/agenda';
import AgendaAvailability from './AgendaAvailability';
import AgendaWorkTime from './AgendaWorkTime';
import { agendaDateTime, parseAgendaDateTime, agendaOperationalEnd as computeOperationalEnd } from './agenda-ui-dates';

type AgendaModalsProps = {
  stationId?: number | null;
  onWorkTimeChange?: () => void;
  handleQuickSchedule: () => boolean | Promise<boolean>;
  editingEvent?: InspectionEvent | null;
  onSaveEdit: (event: InspectionEvent) => boolean | Promise<boolean>;
  onDeleteEdit?: (event: InspectionEvent) => void;
  onCloseEdit: () => void;
  technicians?: StaffTechnician[];
};

export default function AgendaModals({ stationId, onWorkTimeChange, handleQuickSchedule, editingEvent, onSaveEdit, onDeleteEdit, onCloseEdit, technicians = [] }: AgendaModalsProps) {
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
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const pending = useRef(false);

  async function save(action: () => boolean | Promise<boolean>, close?: () => void) {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setSaveError('');
    try {
      if (await action()) close?.();
      else setSaveError('Não foi possível guardar. Reveja o conflito indicado e tente novamente; os campos foram mantidos.');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Não foi possível guardar. Os campos foram mantidos.');
    } finally { pending.current = false; setSaving(false); }
  }

  useEffect(() => { setShowSuggestions(false); setSaveError(''); }, [editingEvent?.id, quickScheduleTarget?.serial, stationId]);

  useEffect(() => {
    if (!editingEvent) return;
    setEditDateTime(agendaDateTime(editingEvent.start));
    setEditResponsavel(editingEvent.responsavel || '');
    setEditType(normalizeInspectionType(editingEvent.inspectionType));
  }, [editingEvent]);

  if (editingEvent) {
    const saveEdit = () => {
      const start = parseAgendaDateTime(editDateTime);
      if (Number.isNaN(start.getTime())) return;
      const defaults = getInspectionDefaults(editType);
      const sameType = editType === normalizeInspectionType(editingEvent.inspectionType);
      const durationMinutes = sameType ? resolveAgendaDuration(editingEvent) : defaults.durationMinutes;
      return save(() => onSaveEdit({
        ...editingEvent,
        start,
        end: computeOperationalEnd(start, durationMinutes),
        responsavel: normalizeTechnicianName(editResponsavel),
        inspectionType: editType,
        durationMinutes,
        bufferBeforeMinutes: sameType ? editingEvent.bufferBeforeMinutes ?? defaults.bufferBeforeMinutes : defaults.bufferBeforeMinutes,
        bufferAfterMinutes: sameType ? editingEvent.bufferAfterMinutes ?? defaults.bufferAfterMinutes : defaults.bufferAfterMinutes,
      }), onCloseEdit);
    };

    const deleteEdit = () => {
      if (!onDeleteEdit) return;
      if (!window.confirm("Eliminar este agendamento? Esta ação não pode ser desfeita.")) return;
      onDeleteEdit(editingEvent);
      onCloseEdit();
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { if (!pending.current) onCloseEdit(); }}>
        <div role="dialog" aria-modal="true" aria-label="Editar agendamento" className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90dvh] overflow-y-auto mx-4 p-5" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900">Editar agendamento</h3>
            <button disabled={saving} onClick={onCloseEdit} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
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
              {technicians.map(tech => <option key={tech.id} value={tech.nome}>{tech.nome}{tech.role ? ` · ${tech.role}` : ''}</option>)}
            </select>
          </label>
          <p className="mt-3 text-xs text-gray-600">Duração estimada: {editType === normalizeInspectionType(editingEvent.inspectionType) ? resolveAgendaDuration(editingEvent) : getInspectionDefaults(editType).durationMinutes} min, sem buffers.</p>
          <p className="mt-2 text-xs text-amber-800">As sugestões usam buffers de 15 min antes e depois. Os buffers personalizados são preservados se mantiver o tipo e podem tornar uma sugestão inválida ao guardar.</p>
          <button type="button" className="mt-3 min-h-11 text-sm text-indigo-700 underline" aria-expanded={showSuggestions} onClick={() => setShowSuggestions(value => !value)}>Sugerir próximo horário disponível</button>
          {showSuggestions && <AgendaAvailability stationId={stationId} date={editDateTime.slice(0, 10)} durationMinutes={editType === normalizeInspectionType(editingEvent.inspectionType) ? resolveAgendaDuration(editingEvent) : getInspectionDefaults(editType).durationMinutes} responsavel={editResponsavel} raftSerial={editingEvent.raftSerial} excludeId={editingEvent.id} onSelect={suggestion => { setEditDateTime(agendaDateTime(suggestion.start)); setEditResponsavel(suggestion.responsavel); }} />}
          {/^[1-9]\d*$/.test(String(editingEvent.id)) && <AgendaWorkTime key={String(editingEvent.id)} eventId={Number(editingEvent.id)} onChange={onWorkTimeChange} />}
          <div className="flex gap-2 mt-4">
            {onDeleteEdit && (
              <button disabled={saving} onClick={deleteEdit} className="px-3 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50">Eliminar</button>
            )}
            <button onClick={saveEdit} disabled={!editDateTime || saving} className="flex-1 bg-indigo-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">Guardar</button>
            <button disabled={saving} onClick={onCloseEdit} className="px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50">Cancelar</button>
          </div>
          {saveError && <p role="alert" className="mt-3 text-sm text-red-700">{saveError}</p>}
        </div>
      </div>
    );
  }

  if (!quickScheduleTarget) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { if (!pending.current) setQuickScheduleTarget(null); }}>
      <div role="dialog" aria-modal="true" aria-label="Agendar inspeção" className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90dvh] overflow-y-auto mx-4 p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Agendar inspeção</h3>
          <button disabled={saving} onClick={() => setQuickScheduleTarget(null)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
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
            {technicians.map((tech) => (
              <option key={tech.id} value={tech.nome}>{tech.nome}{tech.role ? ` · ${tech.role}` : ''}</option>
            ))}
          </select>
          <div className="mt-2 flex flex-wrap gap-2">
            {technicians.map((tech) => {
              const isActive = quickScheduleResponsavel === tech.nome;
              return (
                <button
                  key={tech.id}
                  type="button"
                  onClick={() => setQuickScheduleResponsavel(tech.nome)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${isActive ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'}`}
                >
                  {tech.nome.split(' ')[0]}
                </button>
              );
            })}
          </div>
        </label>
        <p className="mt-3 text-xs text-gray-600">Duração estimada: {getInspectionDefaults(quickScheduleTarget.expiryFlag === 'hidraulico' ? 'hidraulico' : quickScheduleTarget.expiryFlag === 'gi' ? 'anual_gi' : 'anual').durationMinutes} min, sem buffers. Duração real apenas após registo de tempos numa OT explicitamente associada.</p>
        <button type="button" className="mt-3 min-h-11 text-sm text-indigo-700 underline" aria-expanded={showSuggestions} onClick={() => setShowSuggestions(value => !value)}>Sugerir próximo horário disponível</button>
        {showSuggestions && <AgendaAvailability stationId={stationId} date={quickScheduleDateTime.slice(0, 10)} durationMinutes={getInspectionDefaults(quickScheduleTarget.expiryFlag === 'hidraulico' ? 'hidraulico' : quickScheduleTarget.expiryFlag === 'gi' ? 'anual_gi' : 'anual').durationMinutes} responsavel={quickScheduleResponsavel} raftSerial={quickScheduleTarget.serial} onSelect={suggestion => { setQuickScheduleDateTime(agendaDateTime(suggestion.start)); setQuickScheduleResponsavel(suggestion.responsavel); }} />}
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => save(handleQuickSchedule)}
            disabled={!quickScheduleDateTime || saving}
            className="flex-1 bg-indigo-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >Agendar</button>
          <button
            disabled={saving}
            onClick={() => setQuickScheduleTarget(null)}
            className="px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50"
          >Cancelar</button>
        </div>
        {saveError && <p role="alert" className="mt-3 text-sm text-red-700">{saveError}</p>}
      </div>
    </div>
  );
}
