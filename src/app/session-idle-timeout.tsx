"use client";

import { useEffect, useRef } from "react";
import { signOut, useSession } from "next-auth/react";

// Termina automaticamente a sessão após 60 minutos sem atividade.
const IDLE_TIMEOUT_MS = 60 * 60 * 1000;
// Cookie de sessão (sem Max-Age) que só existe enquanto o browser/aplicação
// estiver aberto. Se estiver ausente, o browser foi fechado e o login é exigido.
const APP_SESSION_COOKIE = "orey_app_open";
const ACTIVITY_STORAGE_KEY = "orey:last-activity";
const IDLE_CHECK_INTERVAL_MS = 30 * 1000;
const ACTIVITY_THROTTLE_MS = 5 * 1000;

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "pointerdown",
  "mousedown",
  "keydown",
  "mousemove",
  "scroll",
  "touchstart",
  "wheel",
];

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function clearAppSessionCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${APP_SESSION_COOKIE}=; Max-Age=0; path=/; SameSite=Lax`;
}

export function markAppSessionOpen() {
  if (typeof document === "undefined") return;
  document.cookie = `${APP_SESSION_COOKIE}=1; path=/; SameSite=Lax`;
}

function touchActivity() {
  try {
    window.localStorage.setItem(ACTIVITY_STORAGE_KEY, String(Date.now()));
  } catch {
    // localStorage indisponível — a inatividade passa a ser medida por separador
  }
}

export default function SessionIdleTimeout() {
  const { status } = useSession();
  const lastTouchRef = useRef(0);
  const signingOutRef = useRef(false);

  useEffect(() => {
    if (status !== "authenticated") return;

    const requestSignOut = () => {
      if (signingOutRef.current) return;
      signingOutRef.current = true;
      clearAppSessionCookie();
      void signOut({ callbackUrl: "/login" });
    };

    lastTouchRef.current = Date.now();
    touchActivity();

    const handleActivity = () => {
      const now = Date.now();
      if (now - lastTouchRef.current < ACTIVITY_THROTTLE_MS) return;
      lastTouchRef.current = now;
      touchActivity();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === ACTIVITY_STORAGE_KEY) {
        lastTouchRef.current = Number(event.newValue) || Date.now();
      }
    };

    ACTIVITY_EVENTS.forEach((eventName) =>
      window.addEventListener(eventName, handleActivity, { passive: true }),
    );
    window.addEventListener("storage", handleStorage);

    const intervalId = window.setInterval(() => {
      let lastActivity = lastTouchRef.current || Date.now();
      try {
        const stored = Number(window.localStorage.getItem(ACTIVITY_STORAGE_KEY));
        if (Number.isFinite(stored) && stored > 0) lastActivity = stored;
      } catch {
        // ignora
      }
      if (Date.now() - lastActivity >= IDLE_TIMEOUT_MS) {
        requestSignOut();
      }
    }, IDLE_CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((eventName) =>
        window.removeEventListener(eventName, handleActivity),
      );
      window.removeEventListener("storage", handleStorage);
      window.clearInterval(intervalId);
    };
  }, [status]);

  useEffect(() => {
    if (status === "authenticated") {
      // Sem o marcador de sessão aberta, o browser/app foi fechado: exigir login.
      if (!readCookie(APP_SESSION_COOKIE)) {
        void signOut({ callbackUrl: "/login" });
      }
      return;
    }
    if (status === "unauthenticated") {
      clearAppSessionCookie();
    }
  }, [status]);

  return null;
}
