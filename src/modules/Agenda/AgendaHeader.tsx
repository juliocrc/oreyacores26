import React from 'react';
import { CalendarDays, KanbanSquare, List } from 'lucide-react';
import { useAgendaStore } from '@/lib/store/useAgendaStore';
import ExpiringJangadas from '@/modules/Agenda/ExpiringJangadas';

type AgendaHeaderProps = {
  handleExportCSV: () => void;
  handleExportExcel: () => void;
  handleExportPDF: () => void;
  handleDesmarcarTodos: () => void;
};

const VIEWS = [
  { id: 'calendar', label: 'Calendário', Icon: CalendarDays },
  { id: 'list', label: 'Lista', Icon: List },
  { id: 'board', label: 'Quadro', Icon: KanbanSquare },
] as const;

export default function AgendaHeader({
  handleExportCSV,
  handleExportExcel,
  handleExportPDF,
  handleDesmarcarTodos,
}: AgendaHeaderProps) {
  const { viewMode, setViewMode, exportingFormat, showAdvancedPanels, setShowAdvancedPanels } = useAgendaStore();

  const ocupado = exportingFormat !== null;

  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="ds-kicker mb-1">Planeamento operacional</p>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          Agenda de Inspeções
        </h1>
        <div className="mt-2">
          <ExpiringJangadas />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Segmented control: vista */}
        <div
          role="tablist"
          aria-label="Modo de visualização"
          className="flex rounded-xl border border-line bg-surface p-1 shadow-xs"
        >
          {VIEWS.map(({ id, label, Icon }, i) => {
            const ativo = viewMode === id;
            return (
              <button
                key={id}
                role="tab"
                aria-selected={ativo}
                onClick={() => setViewMode(id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold
                            transition-all duration-150 ${
                              ativo
                                ? 'bg-brand text-white shadow-xs'
                                : 'text-ink-muted hover:bg-surface-3 hover:text-ink'
                            } ${i > 0 ? 'ml-0.5' : ''}`}
              >
                <Icon size={14} aria-hidden />
                {label}
              </button>
            );
          })}
        </div>

        <button onClick={handleExportCSV} disabled={ocupado} className="ds-btn ds-btn-sm ds-btn-secondary">
          {exportingFormat === 'csv' ? 'A exportar…' : 'CSV'}
        </button>

        <button onClick={handleExportExcel} disabled={ocupado} className="ds-btn ds-btn-sm ds-btn-secondary">
          {exportingFormat === 'excel' ? 'A exportar…' : 'Excel'}
        </button>

        <button onClick={handleExportPDF} disabled={ocupado} className="ds-btn ds-btn-sm ds-btn-secondary">
          {exportingFormat === 'pdf' ? 'A exportar…' : 'PDF'}
        </button>

        <button
          onClick={handleDesmarcarTodos}
          className="ds-btn ds-btn-sm border border-danger-line bg-danger-soft text-danger hover:brightness-95"
        >
          Cancelar todos
        </button>

        <button
          onClick={() => setShowAdvancedPanels(!showAdvancedPanels)}
          className="ds-btn ds-btn-sm ds-btn-ghost"
        >
          {showAdvancedPanels ? 'Ocultar avançado' : 'Ver avançado'}
        </button>
      </div>
    </div>
  );
}
