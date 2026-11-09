"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

const SessionAbsentContext = createContext(false);

/**
 * Confirms session loss independently of NextAuth's transient fetch failures.
 * The layout owns navigation; the session endpoint already clears invalid JWTs.
 */
export default function SessionSingleWatcher({ children }: { children?: ReactNode }) {
  const { status, update } = useSession();
  const [confirmedAbsent, setConfirmedAbsent] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset confirmation after recovery/login
      setConfirmedAbsent(false);
    }
  }, [status]);

  useEffect(() => {
    if (status !== "unauthenticated") return;

    let cancelled = false;
    let checking = false;
    const checkSession = async () => {
      if (checking) return;
      checking = true;
      try {
        // NextAuth also reports unauthenticated after a failed session fetch.
        // Only a successful, explicitly empty response confirms session loss.
        const response = await fetch("/api/auth/session", {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!response.ok) return;
        const session: unknown = await response.json();
        if (cancelled) return;
        if (session === null) {
          setConfirmedAbsent(true);
        } else if (typeof session === "object" && session && "user" in session) {
          await update();
        }
      } catch {
        // Transport/server failures do not revoke the browser's credentials.
      } finally {
        checking = false;
      }
    };
    void checkSession();
    // NextAuth stops its own polling once its cached session becomes null.
    const intervalId = window.setInterval(() => void checkSession(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [status, update]);

  return (
    <SessionAbsentContext.Provider value={status === "unauthenticated" && confirmedAbsent}>
      {children}
    </SessionAbsentContext.Provider>
  );
}

export function SessionAccessBoundary({ children, isPublic }: { children: ReactNode; isPublic: boolean }) {
  const { status } = useSession();
  const confirmedAbsent = useContext(SessionAbsentContext);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isPublic && status === "unauthenticated" && confirmedAbsent) {
      router.replace(`/login?callbackUrl=${encodeURIComponent(pathname || "/")}`);
    }
  }, [isPublic, status, confirmedAbsent, pathname, router]);

  if (!isPublic && status !== "authenticated") {
    return <div role="status" aria-live="polite">A verificar sessao...</div>;
  }
  return children;
}
