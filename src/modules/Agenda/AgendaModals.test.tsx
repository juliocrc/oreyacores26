import React from 'react';
import AgendaModals from './AgendaModals';
import type { InspectionEvent } from '@/types/agenda-page';
import { agendaDateTime } from './agenda-ui-dates';
import AgendaAvailability from './AgendaAvailability';
import { useAgendaStore } from '@/lib/store/useAgendaStore';

jest.mock('@/lib/store/useAgendaStore', () => ({ useAgendaStore: jest.fn(() => ({})) }));

function elements(node: React.ReactNode): React.ReactElement<any>[] {
  return React.Children.toArray(node).flatMap(child => React.isValidElement<{ children?: React.ReactNode }>(child)
    ? [child, ...elements(child.props.children)] : []);
}

beforeEach(() => { jest.spyOn(React, 'useRef').mockImplementation(value => ({ current: value })); });
afterEach(() => { jest.restoreAllMocks(); jest.mocked(useAgendaStore).mockReturnValue({} as never); });

it.each([[30, 180], [210, 180], [270, 270]])('editing date/technician resolves %im to %im without resetting buffers', (durationMinutes, expected) => {
  jest.spyOn(React, 'useEffect').mockImplementation(() => {});
  jest.spyOn(React, 'useState')
    .mockImplementation((value?: unknown) => [value, jest.fn()] as any)
    .mockImplementationOnce(() => ['2030-01-07T11:00', jest.fn()] as any)
    .mockImplementationOnce(() => ['', jest.fn()] as any)
    .mockImplementationOnce(() => ['outro', jest.fn()] as any)
    .mockImplementationOnce(() => [false, jest.fn()] as any);
  const editingEvent: InspectionEvent = {
    id: 1, title: 'Inspecao', raftSerial: 'RAFT-1', type: 'Inspeção', status: 'scheduled',
    start: new Date(2030, 0, 7, 9), end: new Date(2030, 0, 7, 12),
    inspectionType: 'outro', durationMinutes, bufferBeforeMinutes: 0, bufferAfterMinutes: 0,
  };
  const onSaveEdit = jest.fn();
  const tree = elements(AgendaModals({ editingEvent, onSaveEdit, onCloseEdit: jest.fn(), handleQuickSchedule: jest.fn() }));
  tree.find(el => el.type === 'button' && el.props.children === 'Guardar')!.props.onClick();
  expect(onSaveEdit).toHaveBeenCalledWith(expect.objectContaining({ durationMinutes: expected, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 }));
  const saved = onSaveEdit.mock.calls[0][0];
  expect(tree.some(el => el.type === 'p' && String(el.props.children).includes('buffers de 15 min'))).toBe(true);
  if (expected === 180) expect(agendaDateTime(saved.end)).toBe('2030-01-07T15:30');
});

it.each(['quick', 'edit'])('fills %s form from a station-scoped suggestion without saving', mode => {
  const setDate = jest.fn();
  const setTech = jest.fn();
  const onSaveEdit = jest.fn();
  const handleQuickSchedule = jest.fn();
  jest.spyOn(React, 'useEffect').mockImplementation(() => {});
  jest.spyOn(React, 'useState')
    .mockImplementation((value?: unknown) => [value, jest.fn()] as any)
    .mockImplementationOnce(() => ['2030-01-07T09:00', setDate] as any)
    .mockImplementationOnce(() => ['Ana', setTech] as any)
    .mockImplementationOnce(() => ['anual', jest.fn()] as any)
    .mockImplementationOnce(() => [true, jest.fn()] as any);
  jest.mocked(useAgendaStore).mockReturnValue({
    quickScheduleTarget: { serial: 'R1', label: 'R1', shipName: 'Navio' },
    quickScheduleDateTime: '2030-01-07T09:00', quickScheduleResponsavel: 'Ana',
    setQuickScheduleDateTime: setDate, setQuickScheduleResponsavel: setTech,
  } as never);
  const editingEvent = mode === 'edit' ? { id: 7, title: 'Navio', raftSerial: 'R1', status: 'scheduled', inspectionType: 'anual', durationMinutes: 180, start: new Date(), end: new Date() } as InspectionEvent : null;
  const tree = elements(AgendaModals({ stationId: 2, editingEvent, onSaveEdit, handleQuickSchedule, onCloseEdit: jest.fn() }));
  const availability = tree.find(el => el.type === AgendaAvailability)!;
  expect(availability.props).toMatchObject({ stationId: 2, date: '2030-01-07', durationMinutes: 180, responsavel: 'Ana', raftSerial: 'R1' });
  if (mode === 'edit') expect(availability.props.excludeId).toBe(7);
  availability.props.onSelect({ start: '2030-01-08T10:00:00Z', end: '2030-01-08T13:00:00Z', responsavel: 'Bruno' });
  expect(setDate).toHaveBeenCalledWith('2030-01-08T09:00');
  expect(setTech).toHaveBeenCalledWith('Bruno');
  expect(onSaveEdit).not.toHaveBeenCalled();
  expect(handleQuickSchedule).not.toHaveBeenCalled();
});

it.each(['conflict', 'rejection', 'success'])('awaits server %s before deciding whether to close the edit modal', async result => {
  jest.spyOn(React, 'useEffect').mockImplementation(() => {});
  const setDate = jest.fn();
  const setTech = jest.fn();
  const setError = jest.fn();
  const onCloseEdit = jest.fn();
  let resolve!: (value: boolean) => void;
  let reject!: (reason: Error) => void;
  const onSaveEdit = jest.fn(() => new Promise<boolean>((done, fail) => { resolve = done; reject = fail; }));
  jest.spyOn(React, 'useState')
    .mockImplementationOnce(() => ['2030-01-07T11:00', setDate] as any)
    .mockImplementationOnce(() => ['Ana', setTech] as any)
    .mockImplementationOnce(() => ['anual', jest.fn()] as any)
    .mockImplementationOnce(() => [false, jest.fn()] as any)
    .mockImplementationOnce(() => [false, jest.fn()] as any)
    .mockImplementationOnce(() => ['', setError] as any);
  const editingEvent = { id: 7, title: 'Navio', raftSerial: 'R1', status: 'scheduled', inspectionType: 'anual', start: new Date(), end: new Date() } as InspectionEvent;
  const tree = elements(AgendaModals({ editingEvent, onSaveEdit, onCloseEdit, handleQuickSchedule: jest.fn() }));
  const button = tree.find(el => el.type === 'button' && el.props.children === 'Guardar')!;
  const pending = button.props.onClick();
  button.props.onClick();
  expect(onSaveEdit).toHaveBeenCalledTimes(1);
  expect(onCloseEdit).not.toHaveBeenCalled();
  if (result === 'rejection') reject(new Error('409: Técnico ocupado'));
  else resolve(result === 'success');
  await pending;
  expect(onCloseEdit).toHaveBeenCalledTimes(result === 'success' ? 1 : 0);
  expect(setDate).not.toHaveBeenCalled();
  expect(setTech).not.toHaveBeenCalled();
  if (result !== 'success') expect(setError).toHaveBeenLastCalledWith(expect.stringMatching(/409|campos foram mantidos/));
});
