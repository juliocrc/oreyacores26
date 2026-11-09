import React from 'react';
import Loader from './JangadaWizardLoader';
import { useJangadaWizardStore as store } from './store/useJangadaWizardStore';

jest.mock('./store/useJangadaWizardStore', () => {
  const actual = jest.requireActual('./store/useJangadaWizardStore').useJangadaWizardStore;
  return { useJangadaWizardStore: Object.assign(jest.fn(() => actual.getState()), actual) };
});

const original = { expectedUpdatedAt: '2026-10-01T00:00:00.000Z', expectedRaftUpdatedAt: '2026-10-01T01:00:00.000Z' };
const draft = { jangadaId: 1, inspecaoId: 12, inspectionData: { serial: 'LOCAL' }, editVersions: original };

afterEach(() => jest.restoreAllMocks());

it('restores an offline draft with its original identity and versions, not a new baseline', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => JSON.stringify(draft) } });
  const effects: Array<() => void> = [];
  jest.spyOn(React, 'useEffect').mockImplementation(effect => { effects.push(effect as () => void); });
  jest.spyOn(React, 'useState').mockImplementation(() => [true, jest.fn()] as any);
  jest.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  try {
    Loader({ jangadaId: 1, children: null });
    effects.forEach(effect => effect());
    await new Promise(resolve => setImmediate(resolve));
    expect(store.getState()).toMatchObject({ jangadaId: 1, inspecaoId: 12, editVersions: original, inspectionData: { serial: 'LOCAL' }, hasServerChanges: true });
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

it('does not adopt fresh server tokens when the user restores an older local draft', () => {
  jest.spyOn(React, 'useEffect').mockImplementation(() => {});
  jest.spyOn(React, 'useState')
    .mockImplementationOnce(() => [true, jest.fn()] as any)
    .mockImplementationOnce(() => [draft, jest.fn()] as any)
    .mockImplementationOnce(() => [{ raftData: { id: 1, updatedAt: '2026-10-20T00:00:00.000Z' }, draftData: { id: 99, updatedAt: '2026-10-20T00:00:00.000Z' } }, jest.fn()] as any);
  jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false } as Response);
  const tree = Loader({ jangadaId: 1, children: null });
  function findRestore(node: any): (() => void) | undefined {
    if (!React.isValidElement(node)) return;
    const props = node.props as any;
    if (node.type === 'button' && String(props.children).includes('Recuperar')) return props.onClick;
    for (const child of React.Children.toArray(props.children)) {
      const found = findRestore(child);
      if (found) return found;
    }
  }
  const restore = findRestore(tree);
  expect(restore).toBeDefined();
  restore!();
  expect(store.getState()).toMatchObject({ inspecaoId: 12, editVersions: original, inspectionData: { serial: 'LOCAL' } });
});
