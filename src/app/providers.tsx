"use client";
import * as React from "react";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import { APP_THEME_OPTIONS, AppThemeName, createAppTheme, DEFAULT_APP_THEME } from "../theme";
import SessionPresenceHeartbeat from "./session-presence-heartbeat";
import SessionIdleTimeout from "./session-idle-timeout";
import OfflineSyncStatus from "@/components/OfflineSyncStatus";
import { flushOfflineSyncQueue, updateOfflineSyncConnectivity } from "@/lib/offline-sync/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const STORAGE_KEY = "app-theme-v2";

type ThemeControllerContextValue = {
  themeName: AppThemeName;
  setThemeName: (next: AppThemeName) => void;
  themeOptions: Array<{ value: AppThemeName; label: string }>;
};

const ThemeControllerContext = React.createContext<ThemeControllerContextValue | null>(null);

function isAppThemeName(value: unknown): value is AppThemeName {
  return typeof value === "string" && APP_THEME_OPTIONS.some((option) => option.value === value);
}

const themeChangeListeners = new Set<() => void>();

function readStoredTheme(): AppThemeName {
  try {
    const persisted = window.localStorage.getItem(STORAGE_KEY);
    if (isAppThemeName(persisted)) return persisted;
  } catch {
    // no-op
  }
  return DEFAULT_APP_THEME;
}

function setStoredThemeName(next: AppThemeName) {
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // no-op
  }
  themeChangeListeners.forEach((listener) => listener());
}

export function useAppThemeController() {
  const context = React.useContext(ThemeControllerContext);
  if (!context) {
    throw new Error("useAppThemeController must be used inside <Providers />.");
  }

  return context;
}

function OfflineSyncBootstrap() {
  React.useEffect(() => {
    // Só em produção. Em desenvolvimento o RuntimeClientGuard desregista o
    // service worker e limpa os caches; registar aqui ao mesmo tempo fazia os
    // dois lutar a cada carga e deixava a pagina controlada por um SW morto.
    // Com sw.js em cache-first sobre _next/static, isso servia chunks antigos
    // e provocava "ChunkLoadError" de forma intermitente.
    if (process.env.NODE_ENV === "production" && typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js")
        .catch((err) => console.warn("Service Worker register failed:", err));
    }

    updateOfflineSyncConnectivity(navigator.onLine);

    const handleOnline = () => {
      updateOfflineSyncConnectivity(true);
      void flushOfflineSyncQueue().catch(() => {
        // error state is handled in the sync store/UI
      });
    };
    const handleOffline = () => {
      updateOfflineSyncConnectivity(false);
    };
    const handleVisibilityChange = () => {
      if (!document.hidden && navigator.onLine) {
        void flushOfflineSyncQueue().catch(() => {
          // error state is handled in the sync store/UI
        });
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    if (navigator.onLine) {
      void flushOfflineSyncQueue().catch(() => {
        // error state is handled in the sync store/UI
      });
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return <OfflineSyncStatus />;
}

export default function Providers({ children, session }: { children: React.ReactNode; session?: Session | null }) {
  // Sem staleTime o react-query considera tudo expirado no instante seguinte e
  // volta a pedir tudo a cada montagem — navegar entre ecras repetia 13-17
  // pedidos. 30s evita esse desperdicio sem dadosstrasseiros.
  const [queryClient] = React.useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  }));
  // The first client render must match SSR. Read localStorage only after
  // hydration so persisted themes cannot change MUI class names mid-hydration.
  const [themeName, setThemeNameState] = React.useState<AppThemeName>(DEFAULT_APP_THEME);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore persisted theme after hydration
    setThemeNameState(readStoredTheme());

    const handleThemeChange = () => setThemeNameState(readStoredTheme());
    themeChangeListeners.add(handleThemeChange);
    window.addEventListener("storage", handleThemeChange);
    return () => {
      themeChangeListeners.delete(handleThemeChange);
      window.removeEventListener("storage", handleThemeChange);
    };
  }, []);

  React.useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", themeName);
  }, [themeName]);

  const muiTheme = React.useMemo(() => createAppTheme(themeName), [themeName]);
  const controller = React.useMemo<ThemeControllerContextValue>(() => ({
    themeName,
    setThemeName: (next) => {
      setThemeNameState(next);
      setStoredThemeName(next);
    },
    themeOptions: APP_THEME_OPTIONS,
  }), [themeName]);

  return (
    <SessionProvider session={session} refetchOnWindowFocus={false}>
      <SessionPresenceHeartbeat />
      <SessionIdleTimeout />
      <OfflineSyncBootstrap />
      <ThemeControllerContext.Provider value={controller}>
        <ThemeProvider theme={muiTheme}>
          <CssBaseline />
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        </ThemeProvider>
      </ThemeControllerContext.Provider>
    </SessionProvider>
  );
}
