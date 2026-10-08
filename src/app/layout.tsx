

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

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getAuthSession();
  return (
    <html lang="pt" data-theme={DEFAULT_APP_THEME} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
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
