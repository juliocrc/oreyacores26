"use client";
import * as React from "react";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import { RefreshCw } from "lucide-react";
import {
  flushOfflineSyncQueue,
  getLegacyOfflineInspectionsCount,
  getOfflineSyncQueue,
  importLegacyOfflineInspections,
  subscribeOfflineSync,
} from "@/lib/offline-sync/client";

export default function OfflineSyncButton() {
  const [pendingCount, setPendingCount] = React.useState(() => {
    if (typeof window === "undefined") return 0;
    try {
      return getOfflineSyncQueue().length + getLegacyOfflineInspectionsCount();
    } catch {
      return 0;
    }
  });
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [toast, setToast] = React.useState<{ message: string; severity: "success" | "error" | "info" } | null>(null);

  const refreshCount = React.useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      setPendingCount(getOfflineSyncQueue().length + getLegacyOfflineInspectionsCount());
    } catch {
      setPendingCount(0);
    }
  }, []);

  React.useEffect(() => {
    const unsubscribe = subscribeOfflineSync(refreshCount);
    window.addEventListener("online", refreshCount);
    window.addEventListener("focus", refreshCount);
    return () => {
      unsubscribe();
      window.removeEventListener("online", refreshCount);
      window.removeEventListener("focus", refreshCount);
    };
  }, [refreshCount]);

  const handleSync = async () => {
    if (pendingCount === 0 || isSyncing) return;
    setIsSyncing(true);
    setToast({ message: "A iniciar sincronização de dados offline...", severity: "info" });

    try {
      const imported = importLegacyOfflineInspections();
      if (imported > 0) {
        setToast({ message: `Rascunhos legados importados (${imported}) para a fila partilhada.`, severity: "info" });
      }

      const result = await flushOfflineSyncQueue();
      refreshCount();

      if (!result || result.processedCount === 0) {
        setToast({ message: "Não há operações pendentes para sincronizar.", severity: "info" });
      } else if (result.successCount === result.processedCount) {
        setToast({
          message: `Sincronização concluída com sucesso! (${result.successCount} operação/operações)`,
          severity: "success" as const,
        });
      } else {
        setToast({
          message: `Sincronizados: ${result.successCount} com sucesso, ${result.processedCount - result.successCount} falharam.`,
          severity: "error" as const,
        });
      }
    } catch (error) {
      console.error("Erro geral na sincronização:", error);
      setToast({ message: "Ocorreu um erro ao sincronizar os dados offline.", severity: "error" });
    } finally {
      setIsSyncing(false);
    }
  };

  if (pendingCount === 0) return null;

  return (
    <>
      <Button
        variant="contained"
        color="warning"
        size="small"
        onClick={() => void handleSync()}
        disabled={isSyncing}
        startIcon={isSyncing ? <CircularProgress size={16} color="inherit" /> : <RefreshCw size={16} className="animate-spin-slow" />}
        sx={{
          borderRadius: 999,
          fontWeight: 700,
          textTransform: "none",
          fontSize: "12px",
          px: 2,
          py: 0.5,
          color: "white",
          boxShadow: "0 2px 8px rgba(237, 108, 2, 0.3)",
          mr: 1.5,
          "&.Mui-disabled": {
            bgcolor: "warning.main",
            color: "white",
            opacity: 0.8,
          }
        }}
      >
        {isSyncing ? "A Sincronizar..." : `Enviar Offline (${pendingCount})`}
      </Button>

      <Snackbar
        open={toast !== null}
        autoHideDuration={6000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert onClose={() => setToast(null)} severity={toast?.severity || "info"} sx={{ width: "100%" }}>
          {toast?.message}
        </Alert>
      </Snackbar>
    </>
  );
}