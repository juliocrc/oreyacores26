import React from 'react';
import { useUnsavedNavigation } from '../use-unsaved-navigation';
import { useRouter } from 'next/navigation';

jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));

describe('ficha navigation protection', () => {
  let listeners: Record<string, (event: any) => void>;
  let cleanup: (() => void) | undefined;
  let dirtyRef: { current: boolean };
  let browser: any;
  let router: { push: jest.Mock; replace: jest.Mock };
  let original: PropertyDescriptor | undefined;
  let originalDocument: PropertyDescriptor | undefined;
  let originalHistory: PropertyDescriptor | undefined;

  beforeEach(() => {
    listeners = {};
    dirtyRef = { current: false };
    router = { push: jest.fn(), replace: jest.fn() };
    jest.mocked(useRouter).mockReturnValue(router as never);
    original = Object.getOwnPropertyDescriptor(globalThis, 'window');
    originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    originalHistory = Object.getOwnPropertyDescriptor(globalThis, 'history');
    browser = { confirm: jest.fn(() => false),
      addEventListener: jest.fn((name, fn) => { listeners[name] = fn; }), removeEventListener: jest.fn() };
    const history = { state: {}, pushState: jest.fn(), replaceState: jest.fn(), go: jest.fn() };
    Object.defineProperty(globalThis, 'window', { configurable: true, value: browser });
    Object.defineProperty(globalThis, 'history', { configurable: true, value: history });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: {
      addEventListener: jest.fn((name, fn) => { listeners[name] = fn; }), removeEventListener: jest.fn(),
    } });
    jest.spyOn(React, 'useRef').mockReturnValue(dirtyRef);
    jest.spyOn(React, 'useLayoutEffect').mockImplementation(effect => { effect(); });
    jest.spyOn(React, 'useEffect').mockImplementation(effect => { cleanup = effect() as () => void; });
  });

  afterEach(() => {
    cleanup?.();
    for (const [key, descriptor] of [['window', original], ['document', originalDocument], ['history', originalHistory]] as const) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    jest.restoreAllMocks();
  });

  it('only warns on unload when actual save fields differ, including after reverting/saving', () => {
    useUnsavedNavigation(false);
    const event = { preventDefault: jest.fn(), returnValue: undefined };
    listeners.beforeunload(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    dirtyRef.current = true;
    listeners.beforeunload(event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.returnValue).toBe('');
    dirtyRef.current = false;
    listeners.beforeunload(event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('restores rejected back/forward navigation before the router handles it', () => {
    useUnsavedNavigation(true);
    const event = { state: { __jangadaNavigationIndex: -1 }, stopImmediatePropagation: jest.fn() };
    listeners.popstate(event);
    expect(browser.confirm).toHaveBeenCalledTimes(1);
    expect(event.stopImmediatePropagation).toHaveBeenCalled();
    expect(history.go).toHaveBeenCalledWith(1);
    listeners.popstate({ state: {}, stopImmediatePropagation: jest.fn() });
    expect(browser.confirm).toHaveBeenCalledTimes(1);
  });

  it('allows confirmed navigation and removes all listeners on unmount', () => {
    useUnsavedNavigation(true);
    browser.confirm.mockReturnValue(true);
    const event = { state: {}, stopImmediatePropagation: jest.fn() };
    listeners.popstate(event);
    expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
    expect(history.go).not.toHaveBeenCalled();
    cleanup?.();
    expect(browser.removeEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    expect(browser.removeEventListener).toHaveBeenCalledWith('popstate', expect.any(Function), true);
  });

  it('guards sidebar/programmatic router navigation before dispatch without dropping edits', () => {
    const push = router.push;
    const replace = router.replace;
    useUnsavedNavigation(true);
    router.push('/jangadas');
    router.replace('/navios');
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(dirtyRef.current).toBe(true);
    browser.confirm.mockReturnValue(true);
    router.push('/jangadas');
    expect(push).toHaveBeenCalledWith('/jangadas');
    dirtyRef.current = false;
    router.replace('/navios');
    expect(replace).toHaveBeenCalledWith('/navios');
  });

  it('blocks internal links and confirms an accepted Next link only once', async () => {
    const keys = ['Element', 'HTMLAnchorElement', 'location'] as const;
    const descriptors = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
    class FakeElement { closest() { return this; } }
    class FakeAnchor extends FakeElement {
      href = 'https://orey.test/navios'; download = ''; target = '';
    }
    Object.defineProperty(globalThis, 'Element', { configurable: true, value: FakeElement });
    Object.defineProperty(globalThis, 'HTMLAnchorElement', { configurable: true, value: FakeAnchor });
    Object.defineProperty(globalThis, 'location', { configurable: true, value: new URL('https://orey.test/jangadas/1') });
    try {
      const push = router.push;
      useUnsavedNavigation(true);
      const event = { target: new FakeAnchor(), button: 0, preventDefault: jest.fn(), stopImmediatePropagation: jest.fn() };
      listeners.click(event);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.stopImmediatePropagation).toHaveBeenCalled();
      browser.confirm.mockReturnValue(true);
      browser.confirm.mockClear();
      listeners.click(event);
      router.push('/navios');
      expect(browser.confirm).toHaveBeenCalledTimes(1);
      expect(push).toHaveBeenCalledWith('/navios');
      await Promise.resolve();
      router.push('/stock');
      expect(browser.confirm).toHaveBeenCalledTimes(2);
    } finally {
      keys.forEach((key, i) => {
        if (descriptors[i]) Object.defineProperty(globalThis, key, descriptors[i]!);
        else Reflect.deleteProperty(globalThis, key);
      });
    }
  });
});
