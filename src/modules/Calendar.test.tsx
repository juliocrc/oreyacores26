import React from 'react';
import InspectionCalendar from './Calendar';
import { agendaDateTime } from './Agenda/agenda-ui-dates';

jest.mock('react-big-calendar', () => ({ Calendar: 'calendar', dateFnsLocalizer: () => ({}) }));
jest.mock('react-big-calendar/lib/addons/dragAndDrop', () => ({ __esModule: true, default: () => 'dnd-calendar' }));
jest.mock('react-big-calendar/lib/css/react-big-calendar.css', () => ({}));
jest.mock('react-big-calendar/lib/addons/dragAndDrop/styles.css', () => ({}));

afterEach(() => jest.restoreAllMocks());
it.each([['Ana', 'Ana'], ['Sem Responsável', ''], [undefined, 'Original']])('external drop uses resource %s', (resourceId, expected) => {
  jest.spyOn(React, 'useMemo').mockImplementation(fn => fn());
  const onSchedule = jest.fn();
  const tree = InspectionCalendar({
    date: new Date(2030, 0, 7), view: 'day', onDateChange: jest.fn(), onViewChange: jest.fn(),
    events: [], onSchedule, externalDragEvent: { id: 'drag', title: 'Raft', raftSerial: 'R', status: 'alert', responsavel: 'Original', start: new Date('2030-01-07T10:00:00Z'), end: new Date('2030-01-07T13:00:00Z') },
  });
  const calendar = (tree.props.children[1] as React.ReactElement<any>).props.children;
  calendar.props.onDropFromOutside({ start: new Date(2030, 0, 7, 9), resourceId });
  expect(onSchedule.mock.calls[0][0].responsavel).toBe(expected);
  expect(agendaDateTime(onSchedule.mock.calls[0][0].start)).toBe('2030-01-07T09:00');
});

it('preserves estimated working minutes across lunch on an external drop', () => {
  jest.spyOn(React, 'useMemo').mockImplementation(fn => fn());
  const onSchedule = jest.fn();
  const tree = InspectionCalendar({
    date: new Date(2030, 0, 7), view: 'day', onDateChange: jest.fn(), onViewChange: jest.fn(),
    events: [], onSchedule, externalDragEvent: { id: 'drag', title: 'Raft', raftSerial: 'R', status: 'alert', durationMinutes: 180, start: new Date('2030-01-07T12:00:00Z'), end: new Date('2030-01-07T16:30:00Z') },
  });
  const calendar = (tree.props.children[1] as React.ReactElement<any>).props.children;
  calendar.props.onDropFromOutside({ start: new Date(2030, 0, 7, 11), resourceId: 'Ana' });
  expect(agendaDateTime(onSchedule.mock.calls[0][0].end)).toBe('2030-01-07T15:30');
  expect(calendar.props.date).toEqual(new Date(2030, 0, 7));
  expect(calendar.props.view).toBe('day');
  expect(calendar.props.resources).toEqual(expect.arrayContaining([{ resourceId: 'Sem Responsável', resourceTitle: 'Sem Responsável' }]));
});
