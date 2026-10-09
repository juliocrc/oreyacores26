"use client";

import React, { useState } from "react";
import { InspectionEvent } from "@/modules/Calendar";
import { EVENT_STATUS_LABELS, EVENT_STATUS_COLORS } from "@/types/agenda";

type AgendaBoardProps = {
  events: InspectionEvent[];
  onStatusChange: (event: InspectionEvent, newStatus: string) => void;
};

const BOARD_COLUMNS = [
  { id: 'scheduled', label: 'Agendado' },
  { id: 'in_progress', label: 'Em curso' },
  { id: 'testing', label: 'Em Teste' },
  { id: 'waiting_parts', label: 'Aguarda Peças' },
  { id: 'completed', label: 'Concluído' }
];

export default function AgendaBoard({ events, onStatusChange }: AgendaBoardProps) {
  const [draggedEvent, setDraggedEvent] = useState<InspectionEvent | null>(null);

  const handleDragStart = (e: React.DragEvent, event: InspectionEvent) => {
    setDraggedEvent(event);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, statusId: string) => {
    e.preventDefault();
    if (draggedEvent && draggedEvent.status !== statusId) {
      onStatusChange(draggedEvent, statusId);
    }
    setDraggedEvent(null);
  };

  return (
    <div className="flex h-full min-h-[700px] gap-4 overflow-x-auto pb-4">
      {BOARD_COLUMNS.map(col => {
        const colEvents = events.filter(e => {
          if (String(e.id).startsWith("expiracao-")) return false;
          const st = String(e.status || 'scheduled').toLowerCase();
          return st === col.id
            || (col.id === 'scheduled' && st === 'confirmed')
            || (col.id === 'in_progress' && st === 'paused');
        });
        
        return (
          <div
            key={col.id}
            className="flex-shrink-0 w-[280px] bg-slate-50/80 rounded-2xl border border-slate-200 flex flex-col"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, col.id)}
          >
            <div className="p-3 border-b border-slate-200/60 bg-white/50 rounded-t-2xl flex items-center justify-between">
              <h3 className="font-semibold text-sm text-slate-700">{col.label}</h3>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
                {colEvents.length}
              </span>
            </div>
            
            <div className="flex-1 p-3 space-y-3 overflow-y-auto">
              {colEvents.map(ev => {
                const c = EVENT_STATUS_COLORS[ev.status as keyof typeof EVENT_STATUS_COLORS] || EVENT_STATUS_COLORS.scheduled;
                return (
                  <div
                    key={String(ev.id)}
                    draggable
                    onDragStart={(e) => handleDragStart(e, ev)}
                    className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 cursor-grab active:cursor-grabbing hover:shadow-md hover:-translate-y-0.5 transition-all relative overflow-hidden"
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: c.border }} />
                    <div className="pl-1">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        {new Date(ev.start).toLocaleDateString('pt-PT')}
                      </div>
                      <p className="text-sm font-bold text-slate-800 leading-tight mb-1 truncate" title={ev.title.split('•')[0]}>{ev.title.split('•')[0]}</p>
                      <p className="text-xs text-slate-500 mb-2 font-mono">{ev.raftSerial}</p>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-50">
                        <span className="text-[11px] font-semibold text-slate-600 truncate mr-2">
                          {ev.responsavel || 'Sem Técnico'}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold whitespace-nowrap" style={{ backgroundColor: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
                          {EVENT_STATUS_LABELS[ev.status as keyof typeof EVENT_STATUS_LABELS]}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {colEvents.length === 0 && (
                <div className="h-20 flex items-center justify-center border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs font-semibold">
                  Arraste para aqui
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
