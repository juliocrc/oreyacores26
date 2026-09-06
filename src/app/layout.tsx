

import type { Metadata } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import ModernLayout from "./ModernLayout";
import Providers from "./providers";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import RuntimeClientGuard from "./runtime-client-guard";
import { getAuthSession } from "@/auth";
import { APP_METADATA } from "@/lib/app-config";
import { DEFAULT_APP_THEME } from "@/theme";
import { ToastContainer } from "@/components/shared/Toast";
import ScrollToTop from "@/components/shared/ScrollToTop";
import Script from "next/script";
// Font imports removed to avoid external network dependency during build
// Using system default fonts

const EARLY_RUNTIME_RECOVERY_SCRIPT = `(() => {
  if (typeof window === "undefined") return;

  const recoveryFlag = "runtime-chunk-recovery";

  const getMessage = (reason) => {
    if (reason instanceof Error) return reason.message || "";
    if (typeof reason === "string") return reason;
    if (reason && typeof reason === "object" && "message" in reason) {
      return String(reason.message || "");
    }
    return "";
  };

  const isChunkLoadRelatedError = (reason) => {
    const normalized = getMessage(reason).toLowerCase();
    return normalized.includes("chunkloaderror")
      || normalized.includes("loading chunk")
      || normalized.includes("failed to fetch dynamically imported module")
      || (normalized.includes("_next/static/chunks") && normalized.includes("timeout"));
  };

  const clearRecoveryFlag = () => {
    try {
      window.sessionStorage.removeItem(recoveryFlag);
    } catch {
      // ignore storage failures
    }
  };

  const tryRecover = () => {
    let alreadyRecovered = false;

    try {
      alreadyRecovered = window.sessionStorage.getItem(recoveryFlag) === "1";
      if (!alreadyRecovered) {
        window.sessionStorage.setItem(recoveryFlag, "1");
      }
    } catch {
      // ignore storage failures and still attempt a one-time reload
    }

    if (alreadyRecovered) return;

    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("__chunk-reload", String(Date.now()));
    window.location.replace(nextUrl.toString());
  };

  window.addEventListener("load", clearRecoveryFlag, { once: true });
  window.addEventListener("pageshow", clearRecoveryFlag, { once: true });

  window.addEventListener("error", (event) => {
    if (isChunkLoadRelatedError(event.error || event.message)) {
      tryRecover();
    }
  }, true);

  window.addEventListener("unhandledrejection", (event) => {
    if (isChunkLoadRelatedError(event.reason)) {
      event.preventDefault();
      tryRecover();
    }
  }, true);

  // Limpar automaticamente rascunhos obsoletos do wizard em alteração de versão
  try {
    const appVersion = "v2-2026-orcamento-cliente";
    const storedVersion = window.localStorage.getItem("app-cache-version");
    if (storedVersion !== appVersion) {
      for (let i = window.localStorage.length - 1; i >= 0; i--) {
        const key = window.localStorage.key(i);
        if (key && (key.startsWith("jangada-wizard-draft-") || key.includes("inspection-draft") || key.includes("wizard-store"))) {
          window.localStorage.removeItem(key);
        }
      }
      window.localStorage.setItem("app-cache-version", appVersion);
    }
  } catch {}
})();`;


export const metadata: Metadata = {
  title: APP_METADATA.title,
  description: APP_METADATA.description,
};


export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getAuthSession();
  return (
    <html lang="pt" data-theme={DEFAULT_APP_THEME} suppressHydrationWarning>
      <head>
        <Script id="early-runtime-recovery" strategy="beforeInteractive">
          {EARLY_RUNTIME_RECOVERY_SCRIPT}
        </Script>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" type="image/png" href="/icon-192x192.png" />
        <meta name="theme-color" content="#1e3a8a" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Orey Técnica" />
      </head>
      <body data-theme={DEFAULT_APP_THEME} suppressHydrationWarning className={`font-sans antialiased bg-slate-50 text-slate-900`}>
        <AppRouterCacheProvider options={{ enableCssLayer: true }}>
          <RuntimeClientGuard />
          <Providers session={session}>
            <ModernLayout>{children}</ModernLayout>
          </Providers>
        </AppRouterCacheProvider>
        <ScrollToTop />
        <ToastContainer />
        <Script src="/sw-register.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
