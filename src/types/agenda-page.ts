import type { InspectionType } from "./agenda";

export type RecurrenceRule = {
  freq: 'daily' | 'weekly' | 'monthly';
  interval?: number;
  count?: number;
  until?: Date;
  byweekday?: number[];
};

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
  durationMinutes?: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  recurrence?: RecurrenceRule | null;
};

export type ExpiringRaftInfo = { label: string; shipName: string; expiryFlag: string };

export type StaffTechnician = { id: number | string; nome: string; role?: string };

export type InspectionCalendarProps = {
  events: InspectionEvent[];
  onSchedule: (event: InspectionEvent) => void;
  onEventDrop: (payload: CalendarMutationPayload) => void;
  onEventResize: (payload: CalendarMutationPayload) => void;
  externalDragEvent: InspectionEvent | null;
  onExternalEventConsumed: () => void;
  expiringByDay?: Record<string, ExpiringRaftInfo[]>;
  onDeleteEvent?: (event: InspectionEvent) => void;
  onEditEvent?: (event: InspectionEvent) => void;
  technicians?: StaffTechnician[];
};

export type NavioItem = { id: number; nome: string };

export type AgendaMetrics = {
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  completionRate: number;
  averageDuration: number;
  upcomingNext7Days: number;
  overdueCount: number;
  topResponsavel: { name: string; count: number }[];
};

export type CalendarMutationPayload = {
  event?: InspectionEvent;
  start?: Date | string;
  end?: Date | string;
};

export type AgendaExportRow = {
  id: string;
  data: string;
  hora: string;
  estado: string;
  jangada: string;
  navio: string;
  tipo: string;
  responsavel: string;
  duracao: number | null;
};

export type AgendaRaft = {
  id?: number;
  serial: string;
  model?: string | null;
  shipId?: number | null;
  shipNameManual?: string | null;
  dataInspecao?: string | null;
  dataProxInspecao?: string | null;
  cylinderDataProxTeste?: string | null;
  cylinderSistema?: string | null;
  artigos?: Array<{ name?: string; item?: string; referencia?: string }> | null;
  status?: string | null;
  receivedAt?: string | null;
  scheduledAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
};

export type PanelRaft = {
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
