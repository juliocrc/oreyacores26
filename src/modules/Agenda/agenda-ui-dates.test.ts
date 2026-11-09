import { agendaDateTime, agendaWallDate, parseAgendaDateTime, wallDateTime, agendaOperationalEnd } from './agenda-ui-dates';

it.each([
  ['2030-01-07T09:00', '2030-01-07T10:00:00.000Z'],
  ['2030-07-08T09:00', '2030-07-08T09:00:00.000Z'],
  ['2030-01-07T23:30', '2030-01-08T00:30:00.000Z'],
])('converts station wall time %s without browser timezone assumptions', (wall, instant) => {
  expect(parseAgendaDateTime(wall).toISOString()).toBe(instant);
  expect(agendaDateTime(instant)).toBe(wall);
  expect(wallDateTime(agendaWallDate(instant))).toBe(wall);
});

it('rejects missing, invalid and nonexistent DST wall times', () => {
  for (const value of ['', '2030-02-30T09:00', '2030-03-31T00:30']) expect(Number.isNaN(parseAgendaDateTime(value).getTime())).toBe(true);
});

it('keeps the existing lunch rule in station time', () => {
  expect(agendaDateTime(agendaOperationalEnd(parseAgendaDateTime('2030-01-07T11:00'), 180))).toBe('2030-01-07T15:30');
});
