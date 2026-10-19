"use client";

import { useState, useMemo } from "react";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { pt } from "date-fns/locale/pt";
import { EVENT_STATUS_COLORS, normalizeEventStatus, type InspectionType } from "@/types/agenda";
import type { StaffTechnician } from "@/types/agenda-page";
import { ChevronLeft, ChevronRight } from "lucide-react";

const locales = { pt: pt };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

export type InspectionEvent = {
  id: string | number;
  title: string;
  start: Date;
  end: Date;
  raftSerial: string;
  status: string;
  color?: string;
  responsavel?: string;
  inspectionType?: InspectionType;
  type?: string;
};

type CalendarMutationPayload = {
  event?: InspectionEvent;
  start?: Date | string;
  end?: Date | string;
  resourceId?: string;
};

type InspectionCalendarProps = {
  events: InspectionEvent[];
  onSchedule: (event: InspectionEvent) => void;
  onEventResize?: (data: CalendarMutationPayload) => void;
  onEventDrop?: (data: CalendarMutationPayload) => void;
  externalDragEvent?: InspectionEvent | null;
  onExternalEventConsumed?: () => void;
  onDeleteEvent?: (event: InspectionEvent) => void;
  onEditEvent?: (event: InspectionEvent) => void;
  expiringByDay?: Record<string, any[]>;
  technicians?: StaffTechnician[];
};

const TECHNICIAN_PALETTE = [
  { bg: "#0369a1", border: "#075985", text: "#ffffff" },
  { bg: "#6d28d9", border: "#5b21b6", text: "#ffffff" },
  { bg: "#047857", border: "#065f46", text: "#ffffff" },
  { bg: "#b45309", border: "#92400e", text: "#ffffff" },
  { bg: "#be185d", border: "#9d174d", text: "#ffffff" },
  { bg: "#1d4ed8", border: "#1e40af", text: "#ffffff" },
];

const DnDCalendar = withDragAndDrop(Calendar) as any;

const CustomEvent = ({ event }: any) => {
  if (event.type === "expiracao") {
    const [main, ship] = String(event.title).split(" · ");
    const label = main.replace(/^⚠\s*/, "");
    return (
      <div className="flex flex-col h-full overflow-hidden text-xs leading-tight" title={event.title}>
        <span className="font-bold block truncate">{label}</span>
        {ship ? <span className="opacity-90 block truncate">{ship}</span> : null}
      </div>
    );
  }

  const parts = event.title.split(' • ');
  const ship = parts[0]?.replace('Navio:', '').trim() || '';
  const raft = parts[1]?.replace('Jangada:', '').trim() || event.raftSerial;
  
  return (
    <div className="flex flex-col h-full overflow-hidden text-xs leading-tight">
      <span className="font-bold block truncate">{ship}</span>
      <span className="opacity-90 block truncate">{raft}</span>
    </div>
  );
};

const CustomMonthEvent = ({ event }: any) => {
  if (event.type === "expiracao") {
    const [main, ship] = String(event.title).split(" · ");
    const detail = main.split(" — ")[1] || main.replace(/^⚠\s*/, "");
    return (
      <div className="text-[10px] leading-tight font-bold truncate px-1" title={event.title}>
        {[detail, ship].filter(Boolean).join(" · ")}
      </div>
    );
  }

  const parts = event.title.split(' • ');
  const ship = parts[0]?.replace('Navio:', '').trim() || '';
  return (
    <div className="text-[10px] leading-tight font-bold truncate px-1" title={event.title}>
      {ship}
    </div>
  );
};

const CustomToolbar = (toolbar: any) => {
  const goToBack = () => toolbar.onNavigate('PREV');
  const goToNext = () => toolbar.onNavigate('NEXT');
  const goToCurrent = () => toolbar.onNavigate('TODAY');

  return (
    <div className="flex flex-wrap items-center justify-between mb-4 gap-4 bg-slate-50 p-2 rounded-2xl border border-slate-200">
      <div className="flex items-center gap-1">
        <button onClick={goToBack} className="p-2 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-slate-300 hover:shadow-sm text-slate-600">
          <ChevronLeft size={18} />
        </button>
        <button onClick={goToCurrent} className="px-4 py-2 font-semibold text-sm hover:bg-white rounded-lg transition-colors border border-transparent hover:border-slate-300 hover:shadow-sm text-slate-700">
          Hoje
        </button>
        <button onClick={goToNext} className="p-2 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-slate-300 hover:shadow-sm text-slate-600">
          <ChevronRight size={18} />
        </button>
        <span className="ml-4 font-bold text-slate-800 text-lg capitalize">{toolbar.label}</span>
      </div>

      <div className="flex bg-slate-200/50 p-1 rounded-xl">
        {['month', 'week', 'day'].map(v => (
          <button
            key={v}
            onClick={() => toolbar.onView(v)}
            className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-all ${toolbar.view === v ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            {v === 'month' ? 'Mês' : v === 'week' ? 'Semana' : 'Dia'}
          </button>
        ))}
      </div>
    </div>
  );
};

export default function InspectionCalendar({
  events,
  onSchedule,
  onEventResize,
  onEventDrop,
  externalDragEvent,
  onExternalEventConsumed,
  onDeleteEvent,
  onEditEvent,
  technicians = [],
}: InspectionCalendarProps) {
  const [view, setView] = useState<"month" | "week" | "day">("week");
  const [date, setDate] = useState(new Date());

  const rosterNames = useMemo(() => technicians.map((t) => t.nome), [technicians]);

  const resourceMap = useMemo(() => {
    return [
      ...rosterNames.map((name) => ({ resourceId: name, resourceTitle: name })),
      { resourceId: 'Sem Responsável', resourceTitle: 'Sem Responsável' }
    ];
  }, [rosterNames]);

  const mappedEvents = useMemo(() => {
    return events.map(e => ({
      ...e,
      resourceId: e.responsavel || 'Sem Responsável'
    }));
  }, [events]);

  const formats = useMemo(
    () => ({
      timeGutterFormat: (d: Date, culture: string, loc: any) => loc.format(d, "HH:mm", culture),
      eventTimeRangeFormat: ({ start, end }: any, culture: string, loc: any) =>
        `${loc.format(start, "HH:mm", culture)} - ${loc.format(end, "HH:mm", culture)}`,
      agendaTimeRangeFormat: ({ start, end }: any, culture: string, loc: any) =>
        `${loc.format(start, "HH:mm", culture)} - ${loc.format(end, "HH:mm", culture)}`,
      dayFormat: (d: Date, culture: string, loc: any) => loc.format(d, "EEEE, d MMM", culture),
    }),
    []
  );

  const isHoliday = (date: Date) => {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    // Typical fixed Portuguese holidays
    const holidays = ["1-1", "25-4", "1-5", "10-6", "15-8", "5-10", "1-11", "1-12", "8-12", "25-12"];
    return holidays.includes(`${day}-${month}`);
  };

  const isWeekend = (date: Date) => {
    const day = date.getDay();
    return day === 0 || day === 6;
  };

  const dayPropGetter = (date: Date) => {
    if (isWeekend(date) || isHoliday(date)) {
      return {
        className: 'bg-slate-200',
        style: {
          pointerEvents: 'none' as const,
          cursor: 'not-allowed',
        },
      };
    }
    return {};
  };

  const slotPropGetter = (date: Date) => {
    if (isWeekend(date) || isHoliday(date)) {
      return {
        className: 'bg-slate-200/60',
        style: {
          pointerEvents: 'none' as const,
          cursor: 'not-allowed',
        },
      };
    }
    return {};
  };

  const eventStyleGetter = (event: any) => {
    let backgroundColor = "#cbd5e1"; // slate-300 default
    let borderColor = "#94a3b8";
    let textColor = "#ffffff";

    // Distinguish expirations in Calendar view with orange color and dashed border
    if (event.type === "expiracao" || String(event.title).startsWith("⚠")) {
      return {
        style: {
          backgroundColor: "#f97316", // orange-500
          borderColor: "#c2410c", // orange-700
          borderLeft: "4px solid #9a3412",
          color: "#ffffff",
          borderRadius: "8px",
          display: "block",
          border: "1px dashed #c2410c",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          padding: "2px 4px",
        },
      };
    }

    const statusKey = normalizeEventStatus(event.status);
    const statusColors = EVENT_STATUS_COLORS[statusKey];
    if (statusColors) {
      backgroundColor = statusColors.bg;
      borderColor = statusColors.border;
      textColor = statusColors.text;
    }

    if (event.responsavel) {
      const resp = String(event.responsavel).toLowerCase();
      const idx = rosterNames.findIndex((name) => {
        const normalized = name.toLowerCase();
        return resp === normalized || resp.includes(normalized);
      });
      if (idx >= 0) {
        const color = TECHNICIAN_PALETTE[idx % TECHNICIAN_PALETTE.length];
        backgroundColor = color.bg;
        borderColor = color.border;
        textColor = color.text;
      }
    }

    // Distinguish vacations and absences in Calendar view with rose-500 color
    if (event.title.startsWith("[FÉRIAS]") || event.title.startsWith("[AUSÊNCIA]")) {
      backgroundColor = "#e11d48"; // rose-600
      borderColor = "#9f1239"; // rose-800
      textColor = "#ffffff";
    }

    const isInactive = statusKey === "cancelled" || statusKey === "no_show";
    const isCompleted = statusKey === "completed";

    return {
      style: {
        backgroundColor,
        borderColor,
        borderLeft: `4px solid ${statusColors?.border ?? borderColor}`,
        color: textColor,
        borderRadius: "8px",
        display: "block",
        border: `1px solid ${borderColor}`,
        boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
        padding: "2px 4px",
        opacity: isInactive ? 0.55 : isCompleted ? 0.85 : 1,
      },
    };
  };

  const onDropFromOutside = ({ start }: { start: string | Date }) => {
    if (!externalDragEvent) return;
    const startDate = new Date(start);
    const durationMs = externalDragEvent?.end && externalDragEvent?.start
      ? Math.max(60 * 60 * 1000, new Date(externalDragEvent.end).getTime() - new Date(externalDragEvent.start).getTime())
      : 60 * 60 * 1000;
    const endDate = new Date(startDate.getTime() + durationMs);
    onSchedule({ ...externalDragEvent, start: startDate, end: endDate });
    if (onExternalEventConsumed) onExternalEventConsumed();
  };

  return (
    <div className="flex h-full min-h-[700px] flex-col gap-4 rounded-3xl bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">Planeamento de Inspeções</h2>
          <p className="text-sm text-slate-500 mt-1">Gere a agenda da equipa desta estação</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm font-medium">
          {technicians.map((tech, index) => {
            const color = TECHNICIAN_PALETTE[index % TECHNICIAN_PALETTE.length];
            return (
              <div
                key={tech.id}
                className="flex items-center gap-2 rounded-full px-3 py-1"
                style={{ color: color.border, backgroundColor: `${color.bg}1a`, border: `1px solid ${color.bg}55` }}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color.bg }}></span> {tech.nome}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-hidden h-[700px]">
        {/* react-big-calendar typings can be tricky with addons */}
        <DnDCalendar
          key={view === 'day' ? 'with-resources' : 'no-resources'}
          localizer={localizer}
          events={mappedEvents}
          resources={view === "day" ? resourceMap : undefined}
          resourceIdAccessor="resourceId"
          resourceTitleAccessor="resourceTitle"
          date={date}
          view={view}
          onNavigate={(newDate: Date) => setDate(newDate)}
          onView={(newView: "month" | "week" | "day") => setView(newView)}
          onEventDrop={(args: any) => onEventDrop?.(args)}
          onEventResize={(args: any) => onEventResize?.(args)}
          resizable
          selectable
          draggableAccessor={(ev: any) => String(ev?.id || "").startsWith("expiracao-") ? false : true}
          formats={formats}
          eventPropGetter={eventStyleGetter}
          dayPropGetter={dayPropGetter}
          slotPropGetter={slotPropGetter}
          step={30}
          timeslots={2}
          min={new Date(1970, 0, 1, 8, 0, 0)} // Start at 8 AM
          max={new Date(1970, 0, 1, 19, 0, 0)} // End at 7 PM
          culture="pt"
          onSelectSlot={() => {
            alert("Para agendar uma inspeção, arraste uma jangada do painel lateral para o calendário.");
          }}
          onSelectEvent={(event: any) => {
             if (String(event.id).startsWith("expiracao-")) {
               alert(`${event.title}\n\nEste registo indica a caducidade da inspeção de uma jangada. Arraste a jangada do painel lateral para o calendário para agendar a inspeção.`);
               return;
             }
             if (String(event.id).startsWith("ausencia-")) {
               alert("Este evento refere-se a férias ou ausência de um técnico. Pode gerir este registo na página de Técnicos.");
               return;
             }
              if (onEditEvent) {
                onEditEvent(event as InspectionEvent);
              } else if (window.confirm("Desejas cancelar este agendamento?\n\nClica OK para DESMARCAR o agendamento.\nClica Cancelar para o manter.")) {
                if (onDeleteEvent) onDeleteEvent(event as InspectionEvent);
              }
          }}
          dragFromOutsideItem={externalDragEvent ? () => externalDragEvent : undefined}
          onDropFromOutside={onDropFromOutside}
          className="font-sans"
          style={{ height: '100%', minHeight: '600px' }}
          components={{
            event: CustomEvent,
            month: { event: CustomMonthEvent },
            toolbar: CustomToolbar,
          }}
          messages={{
            next: "Próximo",
            previous: "Anterior",
            today: "Hoje",
            month: "Mês",
            week: "Semana",
            day: "Dia",
            agenda: "Lista",
            noEventsInRange: "Sem marcações neste período.",
            showMore: (total: number) => `+${total} mais`,
          }}
        />
      </div>
    </div>
  );
}
