import React, { useState, useEffect } from "react";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";

export default function OfflineStatusIndicator() {
  // Keep the server render and the first client render identical. The actual
  // browser connection state is applied after hydration in the effect below.
  const [isOnline, setIsOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      // Simulate background sync when network returns
      setSyncing(true);
      setTimeout(() => {
        setSyncing(false);
        setLastSync(new Date().toLocaleTimeString("pt-PT"));
      }, 2000);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <div className="flex items-center gap-2">
      {isOnline ? (
        <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-100 rounded-full text-[10px] font-black text-emerald-700 shadow-sm animate-in fade-in duration-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <Wifi size={12} className="text-emerald-600" />
          <span>SISTEMA ONLINE</span>
          {lastSync && (
            <span className="text-[9px] text-emerald-500 font-semibold border-l border-emerald-200 pl-1.5 ml-0.5">
              sinc: {lastSync}
            </span>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 px-3 py-1 bg-rose-50 border border-rose-100 rounded-full text-[10px] font-black text-rose-700 shadow-sm animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
          <WifiOff size={12} className="text-rose-600" />
          <span>MODO OFFLINE (LOCAL)</span>
        </div>
      )}

      {syncing && (
        <div className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 border border-indigo-100 rounded-full text-[9px] font-black text-indigo-700 shadow-sm animate-in slide-in-from-right duration-250">
          <RefreshCw size={10} className="animate-spin text-indigo-500" />
          <span>A SINCRONIZAR...</span>
        </div>
      )}
    </div>
  );
}
