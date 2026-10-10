"use client";
import React, { useState } from "react";
import { Dialog, DialogContent, DialogTitle, Button, TextField, Typography, Box, Alert } from "@mui/material";
import { QrCode, Camera, Upload, CheckCircle2 } from "lucide-react";
import { appToast } from "@/lib/app-toast";

type BatchScannerModalProps = {
  open: boolean;
  onClose: () => void;
  onScanSuccess?: (data: { code: string; quantity: number }) => void;
};

export default function BatchScannerModal({ open, onClose, onScanSuccess }: BatchScannerModalProps) {
  const [batchInput, setBatchInput] = useState("");
  const [mode, setMode] = useState<"increment" | "absolute">("increment");
  const [loading, setLoading] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const handleProcessBatch = async () => {
    if (!batchInput.trim()) {
      appToast.error("Insira ou leia códigos de barras.");
      return;
    }
    setLoading(true);
    setResultMessage(null);
    try {
      const res = await fetch("/api/stock/importar-lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: batchInput, mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erro ao processar lote.");
      
      appToast.success(`Lote processado com sucesso! ${data.processed} itens atualizados.`);
      setResultMessage(`Sucesso: ${data.processed} registos sincronizados.`);
      if (onScanSuccess) {
        onScanSuccess({ code: batchInput, quantity: data.processed });
      }
      setBatchInput("");
    } catch (e: any) {
      appToast.error(e?.message || "Erro ao processar leitura em lote.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 1.5 }}>
        <QrCode className="text-cyan-600" size={24} />
        BatchScan: Leitor de Código de Barras & NFC
      </DialogTitle>
      <DialogContent className="space-y-4 pt-2">
        <Typography variant="body2" color="text.secondary">
          Utilize a câmara do telemóvel/tablet ou cole os dados recolhidos pelo seu leitor portátil em modo batch para sincronizar o stock ou inventário instantaneamente.
        </Typography>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("increment")}
            className={`flex-1 py-2 text-xs font-bold rounded-xl border transition ${mode === "increment" ? "bg-cyan-600 text-white border-cyan-600 shadow-sm" : "bg-slate-100 text-slate-700 border-slate-200"}`}
          >
            Adicionar (Incrementar Qtd)
          </button>
          <button
            type="button"
            onClick={() => setMode("absolute")}
            className={`flex-1 py-2 text-xs font-bold rounded-xl border transition ${mode === "absolute" ? "bg-cyan-600 text-white border-cyan-600 shadow-sm" : "bg-slate-100 text-slate-700 border-slate-200"}`}
          >
            Inventário (Substituir Qtd)
          </button>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Códigos Lidos / Ficheiro Batch (Formato: Referencia;Qtd)
          </label>
          <textarea
            rows={6}
            value={batchInput}
            onChange={(e) => setBatchInput(e.target.value)}
            placeholder={"REF-001; 5\nBARCODE123456; 2\nREF-002; 10"}
            className="w-full rounded-xl border border-slate-300 p-3 font-mono text-xs focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none"
          />
        </div>

        {resultMessage && (
          <Alert severity="success" icon={<CheckCircle2 size={18} />} sx={{ borderRadius: 2 }}>
            {resultMessage}
          </Alert>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose} variant="outlined" sx={{ borderRadius: 2 }}>
            Fechar
          </Button>
          <Button
            onClick={handleProcessBatch}
            disabled={loading || !batchInput.trim()}
            variant="contained"
            sx={{ borderRadius: 2, bgcolor: "#0891b2", "&:hover": { bgcolor: "#0e7490" } }}
          >
            {loading ? "A sincronizar..." : "Sincronizar Lote"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
