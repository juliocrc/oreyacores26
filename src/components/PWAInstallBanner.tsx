"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";

// Atalho no Ambiente de Trabalho via ficheiro .url (funciona por HTTP sem HTTPS/PWA).
const SHORTCUT_DISMISS_KEY = "pwa-shortcut-banner-dismissed";
const SHORTCUT_DISMISS_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

const DISMISS_KEY = "pwa-install-banner-dismissed";
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Gerar conteúdo do ficheiro .url (InternetShortcut / ini) apontando para a app atual
function buildShortcutUrlFile(origin: string, basePath: string): string {
  const target = `${origin}${basePath || "/"}`;
  return [
    "[InternetShortcut]",
    `URL=${target}`,
    `IconFile=${origin}/icon-512.png`,
    "IconIndex=0",
    "IconArea=_IconIndex_",
    "",
  ].join("\r\n");
}

function downloadShortcutUrl() {
  const { origin, pathname } = window.location;
  const content = buildShortcutUrlFile(origin, pathname);
  const blob = new Blob([content], { type: "application/internet-shortcut" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Gestor Naval Pro.url";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PWAInstallBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Check if user dismissed recently
    try {
      const dismissed = localStorage.getItem(DISMISS_KEY);
      if (dismissed) {
        const dismissedAt = parseInt(dismissed, 10);
        if (Date.now() - dismissedAt < DISMISS_DURATION_MS) {
          return; // Still within dismiss window
        }
      }
    } catch {
      // localStorage not available
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
      setShowBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    const prompt = deferredPromptRef.current;
    if (!prompt) return;

    try {
      await prompt.prompt();
      const result = await prompt.userChoice;

      if (result.outcome === "accepted") {
        setShowBanner(false);
        deferredPromptRef.current = null;
      }
    } catch {
      // Prompt failed
    }
  }, []);

  const handleDismiss = useCallback(() => {
    setShowBanner(false);
    deferredPromptRef.current = null;

    try {
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
    } catch {
      // localStorage not available
    }
  }, []);

  if (!showBanner) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        width: "calc(100% - 32px)",
        maxWidth: 520,
        animation: "pwa-slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <div
        style={{
          background: "linear-gradient(135deg, #1e3a5f 0%, #2563eb 50%, #3b82f6 100%)",
          borderRadius: 16,
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          gap: 14,
          boxShadow:
            "0 20px 60px rgba(37, 99, 235, 0.3), 0 8px 24px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
        }}
      >
        {/* Icon */}
        <div
          style={{
            fontSize: 28,
            lineHeight: 1,
            flexShrink: 0,
            filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.2))",
          }}
        >
          📱
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              lineHeight: 1.35,
              letterSpacing: "-0.01em",
            }}
          >
            Instalar Gestor Naval Pro
          </div>
          <div
            style={{
              color: "rgba(255, 255, 255, 0.75)",
              fontSize: 12,
              fontWeight: 500,
              lineHeight: 1.35,
              marginTop: 2,
            }}
          >
            Acesso rápido sem navegador
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            onClick={handleDismiss}
            style={{
              background: "rgba(255, 255, 255, 0.12)",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              borderRadius: 10,
              padding: "8px 14px",
              color: "rgba(255, 255, 255, 0.85)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s ease",
              lineHeight: 1,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.12)";
            }}
          >
            Agora não
          </button>
          <button
            onClick={handleInstall}
            style={{
              background: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "8px 18px",
              color: "#1e3a5f",
              fontSize: 13,
              fontWeight: 800,
              cursor: "pointer",
              transition: "all 0.2s ease",
              lineHeight: 1,
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#e2e8f0";
              e.currentTarget.style.transform = "scale(1.03)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#fff";
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            Instalar
          </button>
        </div>
      </div>

      {/* Keyframe animation */}
      <style>{`
        @keyframes pwa-slide-up {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
