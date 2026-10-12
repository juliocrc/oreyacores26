import React from 'react';

type PanelRaft = {
  id?: number;
  serial: string;
  label: string;
  shipName: string;
  expiryFlag?: string;
  dueDate?: Date | null;
  dataInspecao?: string | null;
  dataProxInspecao?: string | null;
  receivedAt?: string | null;
  scheduledAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
};

type AgendaPanels = {
  expiringToday: PanelRaft[];
  expiringNext30Days: PanelRaft[];
  expiringCurrentMonth: PanelRaft[];
  expiringNextMonth: PanelRaft[];
  expiredWithoutInspection: PanelRaft[];
  expiringByDay: Record<string, { label: string; shipName: string; expiryFlag: string }[]>;
  currentMonthLabel: string;
  nextMonthLabel: string;
};

type AgendaSidebarProps = {
  agendaPanels: AgendaPanels;
  scheduledSerials: Set<string>;
  handlePanelDragStart: (raft: PanelRaft, prefix: string) => void;
  setQuickScheduleTarget: (target: any) => void;
  showAdvancedPanels: boolean;
};

export default function AgendaSidebar({
  agendaPanels,
  scheduledSerials,
  handlePanelDragStart,
  setQuickScheduleTarget,
  showAdvancedPanels
}: AgendaSidebarProps) {

  const renderPanelRaft = (raft: PanelRaft, prefix: string) => {
    const isScheduled = scheduledSerials.has(raft.serial);
    return (
      <div
        key={`${prefix}-${raft.serial}`}
        draggable={!isScheduled}
        onDragStart={() => {
          if (!isScheduled) handlePanelDragStart(raft, prefix);
        }}
        className={`relative p-3 mb-2 rounded border text-sm transition-all shadow-sm ${
          isScheduled 
            ? 'bg-gray-50 border-gray-200 opacity-60 cursor-not-allowed' 
            : 'bg-white border-gray-200 hover:border-indigo-400 hover:shadow-md cursor-move'
        }`}
      >
        <div className="flex justify-between items-start mb-1 gap-2">
          <div className="font-semibold text-gray-900 break-all">{raft.label}</div>
          {raft.expiryFlag && (
            <span className={`shrink-0 px-2 py-0.5 text-[10px] font-bold uppercase rounded-full tracking-wider ${
              raft.expiryFlag === 'hidraulico' ? 'bg-blue-100 text-blue-700' :
              raft.expiryFlag === 'gi' ? 'bg-purple-100 text-purple-700' :
              'bg-red-100 text-red-700'
            }`}>
              {raft.expiryFlag}
            </span>
          )}
        </div>
        <div className="text-gray-600 text-xs mb-2 line-clamp-1" title={raft.shipName}>
          Navio: <span className="font-medium text-gray-800">{raft.shipName}</span>
        </div>
        
        {isScheduled && (
          <div className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md inline-block">
            ✓ Agendado no calendário
          </div>
        )}

        {!isScheduled && (
          <button
            onClick={() => setQuickScheduleTarget(raft)}
            className="w-full mt-1 text-center text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 py-1.5 rounded transition-colors"
          >
            Agendar Rápido
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* 30 Days Panel */}
      <div className="bg-white rounded-xl border border-orange-300 shadow-sm overflow-hidden flex flex-col max-h-[400px]">
        <div className="bg-orange-50 px-4 py-3 border-b border-orange-200 flex justify-between items-center shrink-0">
          <h3 className="font-bold text-orange-900 flex items-center gap-2">
            <span className="text-lg">⏰</span> Caducam hoje
          </h3>
          <span className="bg-orange-200 text-orange-900 text-xs font-bold px-2.5 py-1 rounded-full">
            {agendaPanels.expiringToday.length}
          </span>
        </div>
        <div className="p-3 overflow-y-auto bg-orange-50/30 flex-1 min-h-[100px]">
          {agendaPanels.expiringToday.map((raft) => renderPanelRaft(raft, "today"))}
          {agendaPanels.expiringToday.length === 0 && (
            <div className="text-sm text-gray-500 italic text-center py-4 bg-white/50 rounded-lg border border-dashed border-gray-200">
              Nenhuma jangada caduca hoje.
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden flex flex-col h-auto max-h-[500px]">
        <div className="bg-amber-50 px-4 py-3 border-b border-amber-200 flex justify-between items-center shrink-0">
          <h3 className="font-bold text-amber-900 flex items-center gap-2">
            <span className="text-lg">⚠</span> Expira nos próximos 30 dias
          </h3>
          <span className="bg-amber-200 text-amber-800 text-xs font-bold px-2.5 py-1 rounded-full">
            {agendaPanels.expiringNext30Days.length}
          </span>
        </div>
        <div className="p-3 overflow-y-auto bg-amber-50/30 flex-1 min-h-[100px]">
          {agendaPanels.expiringNext30Days.map((raft) => renderPanelRaft(raft, "30d"))}
          {agendaPanels.expiringNext30Days.length === 0 && (
            <div className="text-sm text-gray-500 italic text-center py-4 bg-white/50 rounded-lg border border-dashed border-gray-200">
              Nenhuma jangada expira nos próximos 30 dias.
            </div>
          )}
        </div>
      </div>

      {showAdvancedPanels && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col max-h-[400px]">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-gray-800">Expira neste mês</h3>
              <span className="bg-gray-200 text-gray-700 text-xs font-bold px-2.5 py-1 rounded-full">
                {agendaPanels.expiringCurrentMonth.length}
              </span>
            </div>
            <div className="p-3 overflow-y-auto flex-1 bg-gray-50/50 min-h-[100px]">
              <p className="text-xs text-gray-500 mb-3">{agendaPanels.currentMonthLabel}</p>
              {agendaPanels.expiringCurrentMonth.map((raft) => renderPanelRaft(raft, "cm"))}
              {agendaPanels.expiringCurrentMonth.length === 0 && (
                <div className="text-sm text-gray-400 italic text-center py-4">Nenhuma.</div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col max-h-[400px]">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-gray-800">Expira no próximo mês</h3>
              <span className="bg-gray-200 text-gray-700 text-xs font-bold px-2.5 py-1 rounded-full">
                {agendaPanels.expiringNextMonth.length}
              </span>
            </div>
            <div className="p-3 overflow-y-auto flex-1 bg-gray-50/50 min-h-[100px]">
              <p className="text-xs text-gray-500 mb-3">{agendaPanels.nextMonthLabel}</p>
              {agendaPanels.expiringNextMonth.map((raft) => renderPanelRaft(raft, "nm"))}
              {agendaPanels.expiringNextMonth.length === 0 && (
                <div className="text-sm text-gray-400 italic text-center py-4">Nenhuma.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Expired without inspection */}
      <div className="bg-white rounded-xl border border-red-200 shadow-sm overflow-hidden flex flex-col max-h-[400px]">
        <div className="bg-red-50 px-4 py-3 border-b border-red-200 flex justify-between items-center shrink-0">
          <h3 className="font-bold text-red-900 flex items-center gap-2">
            <span className="text-lg">❌</span> Caducadas s/ Inspeção
          </h3>
          <span className="bg-red-200 text-red-800 text-xs font-bold px-2.5 py-1 rounded-full">
            {agendaPanels.expiredWithoutInspection.length}
          </span>
        </div>
        <div className="p-3 overflow-y-auto flex-1 bg-red-50/30 min-h-[100px]">
          {agendaPanels.expiredWithoutInspection.map((raft) => renderPanelRaft(raft, "exp"))}
          {agendaPanels.expiredWithoutInspection.length === 0 && (
            <div className="text-sm text-gray-500 italic text-center py-4 bg-white/50 rounded-lg border border-dashed border-gray-200">
              Excelente! Sem pendentes caducados.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
