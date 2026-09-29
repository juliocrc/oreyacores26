"use client";

import React, { useState, useEffect } from "react";
import { Bell, BellRing } from "lucide-react";
import { requestPushPermission, showBrowserNotification } from "@/lib/push-notifications";
import { appToast } from "@/lib/app-toast";

export function PushNotificationToggle() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setEnabled(Notification.permission === "granted");
    }
  }, []);

  const handleToggle = async () => {
    const granted = await requestPushPermission();
    if (granted) {
      setEnabled(true);
      appToast.success("Notificações Push ativadas com sucesso!");
      showBrowserNotification("Orey Açores", {
        body: "Alerta de inspeções e prazos ativado no seu dispositivo.",
      });
    } else {
      appToast.warning("Permissão de notificações recusada ou não suportada pelo browser.");
    }
  };

  if (enabled) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold">
        <BellRing size={16} className="text-emerald-600 animate-pulse" />
        <span>Push Ativo</span>
      </div>
    );
  }

  return (
    <button
      onClick={handleToggle}
      className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all"
    >
      <Bell size={16} />
      <span>Ativar Alertas Push</span>
    </button>
  );
}
