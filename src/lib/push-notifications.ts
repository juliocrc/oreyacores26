/**
 * Utilitário de Web Push / Notificações Nativas do Browser
 */

export async function requestPushPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return false;
  }
  if (Notification.permission === "granted") {
    return true;
  }
  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  }
  return false;
}

export function showBrowserNotification(title: string, options?: NotificationOptions) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "granted") {
    try {
      new Notification(title, {
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        ...options,
      });
    } catch (e) {
      console.error("[Push] Erro ao exibir notificação:", e);
    }
  }
}
