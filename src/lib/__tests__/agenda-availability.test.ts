import { agendaZonedTime, calculateAgendaAvailability, isAgendaCivilDate, unionAgendaIntervals } from "../agenda-availability";

const technicians = [{ id: 1, nome: "Ana" }];
const at = (date: string, minutes: number) => new Date(agendaZonedTime(date, minutes));
const base = { date: "2026-10-12", technicians, events: [], absences: [] };
const event = (id: number, minutes = 540, extra = {}) => ({ id, date: at(base.date, minutes), responsavel: "Ana", status: "scheduled", durationMinutes: 60, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, ...extra });

it("calculates ISO week 42 and 35 nominal hours, including zero-capacity weekends", () => {
  const result = calculateAgendaAvailability(base);
  expect(result).toMatchObject({ timeZone: "Atlantic/Azores", weekStart: "2026-10-12", weekEnd: "2026-10-18", unassignedMinutes: 0 });
  expect(result.technicians[0].totals).toEqual({ availableMinutes: 2100, occupiedMinutes: 0, freeMinutes: 2100, overbookedMinutes: 0 });
  expect(result.technicians[0].days[5].availableMinutes).toBe(0);
  expect(result.suggestions).toHaveLength(3);
  expect(result.suggestions[0]).toEqual({ start: "2026-10-12T09:15:00.000Z", end: "2026-10-12T12:15:00.000Z", responsavel: "Ana" });
});

it("does not depend on the host timezone and observes Azores DST", () => {
  expect(at("2026-01-12", 540).toISOString()).toBe("2026-01-12T10:00:00.000Z");
  expect(at("2026-07-13", 540).toISOString()).toBe("2026-07-13T09:00:00.000Z");
  expect(calculateAgendaAvailability({ ...base, date: "2026-10-25" }).weekStart).toBe("2026-10-19");
});

it("unions overlaps but reports simultaneous demand separately as overload", () => {
  const result = calculateAgendaAvailability({ ...base, events: [event(1), event(2, 570)] });
  expect(result.technicians[0].days[0]).toMatchObject({ occupiedMinutes: 90, freeMinutes: 330, overbookedMinutes: 30 });
  expect(unionAgendaIntervals([[1, 3], [3, 4], [2, 5], [8, 7]])).toEqual([[1, 5]]);
});

it("clips full multi-day absence intervals, unions duplicates and signals work during absence", () => {
  const result = calculateAgendaAvailability({ ...base, events: [event(1)], absences: [
    { tecnicoId: 1, start: at("2026-10-11", 0), end: at("2026-10-13", 600) },
    { tecnicoId: 1, start: at("2026-10-12", 540), end: at("2026-10-12", 600) },
  ] });
  expect(result.technicians[0].days[0]).toMatchObject({ availableMinutes: 0, occupiedMinutes: 60, freeMinutes: 0, overbookedMinutes: 60 });
  expect(result.technicians[0].days[1].availableMinutes).toBe(360);
  expect(result.suggestions[0].start).toBe("2026-10-13T14:15:00.000Z");
});

it("includes crossing events, buffers and active states, not inactive states", () => {
  const result = calculateAgendaAvailability({ ...base, events: [
    event(1, 480, { durationMinutes: 120, bufferAfterMinutes: 15, status: "paused" }),
    event(2, 840, { status: "testing" }),
    ...["cancelled", "completed", "no_show"].map((status, i) => event(3 + i, 600, { status })),
  ] });
  expect(result.technicians[0].days[0].occupiedMinutes).toBe(135);
  expect(result.suggestions[0].start).toBe("2026-10-13T09:15:00.000Z");
});

it("does not cross lunch or closing, including buffers; alternatives do not reserve capacity", () => {
  const result = calculateAgendaAvailability({ ...base, durationMinutes: 181 });
  expect(result.suggestions).toEqual([]);
  expect(result.warnings).toBeDefined();
  expect(result.technicians[0].totals.freeMinutes).toBe(2100);
});

it("uses the shared legacy duration resolver and counts unassigned demand without allocating it", () => {
  const result = calculateAgendaAvailability({ ...base, events: [event(1, 540, { durationMinutes: 210, raftSerial: "R1", type: "Inspeção", bufferBeforeMinutes: 15, bufferAfterMinutes: 15, responsavel: "" })] });
  expect(result.unassignedMinutes).toBe(195);
  expect(result.technicians[0].totals.occupiedMinutes).toBe(0);
  expect(result.warnings).toBeDefined();
});

it("filters technician suggestions, excludes edits and blocks the requested raft across technicians", () => {
  const result = calculateAgendaAvailability({ ...base, technicians: [...technicians, { id: 2, nome: "Bia" }], responsavel: "Ana", raftSerial: "R1",
    events: [event(1, 540, { responsavel: "Bia", raftSerial: "R1", durationMinutes: 210 }), event(2, 840, { durationMinutes: 210 })], excludeId: 2 });
  expect(result.technicians).toHaveLength(1);
  expect(result.suggestions[0].start).toBe("2026-10-12T14:15:00.000Z");
});

it.each(["2026-02-30", "2026-99-99", "2026-1-01", "1999-12-31", "2101-01-01", ""])('rejects invalid civil date %s', date => {
  expect(isAgendaCivilDate(date)).toBe(false);
});

it("includes events starting before the week and partial absences at exact half-open boundaries", () => {
  const result = calculateAgendaAvailability({ ...base, events: [event(1, 540, { date: at("2026-10-11", 540), durationMinutes: 1500 })],
    absences: [{ tecnicoId: 1, start: at(base.date, 600), end: at(base.date, 630) }] });
  expect(result.technicians[0].days[0]).toMatchObject({ availableMinutes: 390, occupiedMinutes: 60, freeMinutes: 330, overbookedMinutes: 0 });
});

it("keeps an overloaded technician distinct from a free colleague", () => {
  const result = calculateAgendaAvailability({ ...base, technicians: [...technicians, { id: 2, nome: "Bia" }], events: [event(1), event(2)] });
  expect(result.technicians[0].totals.overbookedMinutes).toBe(60);
  expect(result.technicians[1].totals).toMatchObject({ occupiedMinutes: 0, freeMinutes: 2100, overbookedMinutes: 0 });
});
