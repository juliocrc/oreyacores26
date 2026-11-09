"use client";

/* eslint-disable react-hooks/immutability -- Scoped router interception is restored on unmount; sidebar callers share this router. */

import { useEffect, useLayoutEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const message = 'Existem alteracoes nao guardadas. Deseja sair e descarta-las?';

export function useUnsavedNavigation(dirty: boolean) {
  const router = useRouter();
  const dirtyRef = useRef(dirty);
  useLayoutEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  useEffect(() => {
    let approvedClick = false;
    const confirmLeave = () => !dirtyRef.current || approvedClick || window.confirm(message);
    const unload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const click = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (event.defaultPrevented || !(anchor instanceof HTMLAnchorElement) || anchor.download || (anchor.target && anchor.target !== '_self') || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = new URL(anchor.href, location.href);
      if (target.origin !== location.origin || (target.pathname === location.pathname && target.search === location.search)) return;
      if (!confirmLeave()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      } else {
        approvedClick = true;
        queueMicrotask(() => { approvedClick = false; });
      }
    };
    // Sidebar buttons use router.push rather than anchors. Guard before dispatch,
    // not in pushState, where the App Router may already have replaced the page.
    const routerPush = router.push;
    const routerReplace = router.replace;
    router.push = (...args) => { if (confirmLeave()) routerPush(...args); };
    router.replace = (...args) => { if (confirmLeave()) routerReplace(...args); };
    // Track history positions so a rejected Back/Forward can restore the entry.
    const key = '__jangadaNavigationIndex';
    let index = Number(history.state?.[key] ?? 0);
    let restoring = false;
    const push = history.pushState;
    const replace = history.replaceState;
    replace.call(history, { ...history.state, [key]: index }, '');
    history.pushState = function (state, unused, url) {
      push.call(this, { ...state, [key]: ++index }, unused, url);
    };
    history.replaceState = function (state, unused, url) {
      replace.call(this, { ...state, [key]: index }, unused, url);
    };
    const pop = (event: PopStateEvent) => {
      const next = event.state?.[key];
      if (restoring) {
        restoring = false;
        event.stopImmediatePropagation();
        return;
      }
      if (!confirmLeave()) {
        event.stopImmediatePropagation();
        restoring = true;
        history.go(typeof next === 'number' ? index - next : 1);
      } else {
        index = typeof next === 'number' ? next : index - 1;
      }
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', click, true);
    window.addEventListener('popstate', pop, true);
    return () => {
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', click, true);
      window.removeEventListener('popstate', pop, true);
      history.pushState = push;
      history.replaceState = replace;
      router.push = routerPush;
      router.replace = routerReplace;
    };
  }, [router]);
}
