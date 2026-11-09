import { useEffect } from 'react';
import { useAutoSave, saveLocalWizardDraft, confirmWizardExit } from './useAutoSave';
import { useJangadaWizardStore as store } from './store/useJangadaWizardStore';

jest.mock('react', () => ({ ...jest.requireActual('react'), useEffect: jest.fn() }));
const local = new Map<string, string>();
const listeners = new Map<string, EventListener>();
let cleanup: (() => void) | undefined;

beforeEach(() => {
  jest.useFakeTimers();
  local.clear();
  listeners.clear();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    setItem: jest.fn((key, value) => local.set(key, value)),
    getItem: (key: string) => local.get(key), removeItem: (key: string) => local.delete(key),
  } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    confirm: jest.fn(() => false),
    addEventListener: (key: string, listener: EventListener) => listeners.set(key, listener),
    removeEventListener: jest.fn(),
  } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    addEventListener: (key: string, listener: EventListener) => listeners.set(key, listener),
    removeEventListener: jest.fn(),
  } });
  store.getState().initializeWizard({ id: 10 }, { id: 101, dataInspecao: '2026-10-01', dataProxInspecao: '2027-10-01' });
  jest.mocked(useEffect).mockImplementation(effect => { cleanup = effect() as (() => void); });
});
afterEach(() => { cleanup?.(); cleanup = undefined; jest.useRealTimers(); });

it('warns on refresh after local autosave has cleared isDirty', () => {
  useAutoSave();
  store.getState().setInspectionData({ owner: 'Changed' });
  expect(saveLocalWizardDraft()).toBe(true);
  expect(store.getState().isDirty).toBe(false);
  const event = { preventDefault: jest.fn(), returnValue: undefined };
  listeners.get('beforeunload')!(event as unknown as Event);
  expect(event.preventDefault).toHaveBeenCalled();
  expect(store.getState().hasServerChanges).toBe(true);
});

it('preserves the latest edits on unmount, without waiting for the interval', () => {
  useAutoSave();
  store.getState().setInspectionData({ owner: 'Last edit' });
  cleanup!();
  expect(JSON.parse(local.get('jangada-wizard-draft-10')!).inspectionData.owner).toBe('Last edit');
});

it('asks for confirmation on programmatic exit even after local save', () => {
  store.getState().setInspectionData({ owner: 'Last edit' });
  expect(confirmWizardExit()).toBe(false);
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('nao guardadas no servidor'));
  expect(local.has('jangada-wizard-draft-10')).toBe(true);
});

it('does not warn or recreate a draft once the submitted state is acknowledged', () => {
  useAutoSave();
  store.getState().setInspectionData({ owner: 'Saved edit' });
  store.getState().markServerPersisted(store.getState().inspectionData, { jangadaId: 10, inspecaoId: 101 });
  const event = { preventDefault: jest.fn() };
  listeners.get('beforeunload')!(event as unknown as Event);
  expect(event.preventDefault).not.toHaveBeenCalled();
  expect(confirmWizardExit()).toBe(true);
  expect(window.confirm).not.toHaveBeenCalled();
  expect(local.size).toBe(0);
});

it('reports local storage failure without acknowledging server persistence', () => {
  store.getState().setInspectionData({ owner: 'Changed' });
  jest.mocked(localStorage.setItem).mockImplementationOnce(() => { throw new Error('quota'); });
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  expect(saveLocalWizardDraft()).toBe(false);
  expect(store.getState().hasServerChanges).toBe(true);
  expect(store.getState().isDirty).toBe(true);
  log.mockRestore();
});
