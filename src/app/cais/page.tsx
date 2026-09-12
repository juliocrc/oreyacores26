"use client";

import React, { useEffect, useRef, useState } from "react";
import { Ship, Signature, AlertTriangle, CheckCircle, RefreshCw, Check, Trash } from "lucide-react";

type Order = {
  id: number;
  numeroOrdem: string;
  tipo: string;
  status: string;
  tecnicoResponsavel?: string;
  shipNameManual?: string;
  jangada?: {
    serial: string;
    brand?: string;
    model?: string;
  } | null;
  jangadas?: Array<{
    serial: string;
    brand?: string;
    model?: string;
  }>;
  cliente?: {
    nome: string;
  } | null;
};

export default function CaisPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [opType, setOpType] = useState<"check-in" | "check-out">("check-in");
  const [mestreName, setMestreName] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/ordens-servico?includeClosed=0");
      if (!response.ok) throw new Error("Erro ao carregar ordens de serviço.");
      const data = await response.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      await loadData();
    })();
  }, []);

  // Configure canvas style
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#0f172a"; // Slate 900
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, [selectedOrderId]);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    if ("touches" in e) {
      if (e.touches.length === 0) return { x: 0, y: 0 };
      // Handle mobile screen scaling
      const clientX = e.touches[0].clientX;
      const clientY = e.touches[0].clientY;
      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    // Prevent scrolling when drawing on touch screens
    if (e.cancelable) e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    if (e.cancelable) e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const canvas = canvasRef.current;
    if (!selectedOrderId || !mestreName || !canvas) {
      setError("Por favor, preencha todos os campos obrigatórios e recolha a assinatura.");
      return;
    }

    // Capture canvas base64 image
    const signatureBase64 = canvas.toDataURL("image/png");

    setSubmitting(true);
    try {
      const res = await fetch("/api/cais/recepcionar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: Number(selectedOrderId),
          type: opType,
          mestreName,
          notes,
          signatureBase64,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao guardar protocolo.");

      setSuccess(data.message);
      // Reset form
      setSelectedOrderId("");
      setMestreName("");
      setNotes("");
      clearCanvas();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao submeter dados de cais.");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedOrder = orders.find((o) => String(o.id) === selectedOrderId) || null;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center py-6 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-sky-100 to-indigo-100 text-slate-900 p-5 flex items-center justify-between border-b border-sky-200">
          <div className="flex items-center gap-2">
            <Ship className="h-5 w-5 text-indigo-700" />
            <h1 className="font-bold text-base">Check-In / Out de Cais</h1>
          </div>
          <button
            onClick={() => void loadData()}
            disabled={loading}
            className="p-1.5 hover:bg-white/70 rounded transition-colors text-slate-500 hover:text-slate-900"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Dynamic Alerts */}
        {success && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-5 py-4 text-emerald-800 flex items-center gap-2 text-xs font-semibold">
            <CheckCircle className="h-4 w-4 text-emerald-600 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}
        {error && (
          <div className="bg-red-50 border-b border-red-200 px-5 py-4 text-red-800 flex items-center gap-2 text-xs font-semibold">
            <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading && orders.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">A carregar ordens de serviço...</div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4 flex-1">
            {/* Step 1: Select Order */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Ordem de Serviço (OT)</label>
              <select
                value={selectedOrderId}
                onChange={(e) => {
                  setSelectedOrderId(e.target.value);
                  setSuccess(null);
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium text-slate-800"
              >
                <option value="">Selecione a OT...</option>
                {orders.map((o) => (
                  <option key={o.id} value={String(o.id)}>
                    #{o.numeroOrdem} · {o.cliente?.nome || "Sem Cliente"}
                  </option>
                ))}
              </select>
            </div>

            {/* Display selected OT Info */}
            {selectedOrder && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-700 space-y-1 shadow-sm">
                <p><b>Embarcação:</b> {selectedOrder.shipNameManual || "—"}</p>
                <p>
                  <b>Equipamento:</b>{" "}
                  {selectedOrder.jangadas && selectedOrder.jangadas.length > 0
                    ? selectedOrder.jangadas.map((j) => j.serial).join(", ")
                    : selectedOrder.jangada?.serial || "—"}
                </p>
                <p><b>Técnico Responsável:</b> {selectedOrder.tecnicoResponsavel || "—"}</p>
              </div>
            )}

            {/* Step 2: Handoff Type */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Tipo de Transação</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOpType("check-in")}
                  className={`py-2 rounded-lg text-xs font-bold border transition-all ${
                    opType === "check-in"
                      ? "bg-indigo-600 border-indigo-700 text-white shadow-sm"
                      : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Recolha (Check-In)
                </button>
                <button
                  type="button"
                  onClick={() => setOpType("check-out")}
                  className={`py-2 rounded-lg text-xs font-bold border transition-all ${
                    opType === "check-out"
                      ? "bg-indigo-600 border-indigo-700 text-white shadow-sm"
                      : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Entrega (Check-Out)
                </button>
              </div>
            </div>

            {/* Step 3: Skipper Name */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Mestre / Receptor da Carga *</label>
              <input
                type="text"
                value={mestreName}
                onChange={(e) => setMestreName(e.target.value)}
                placeholder="Nome do Mestre ou responsável..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                required
              />
            </div>

            {/* Step 4: Notes */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Notas de Handoff / Cais</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: contentor riscado, trincos substituídos, etc..."
                rows={2}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Step 5: Touch Signature Canvas */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                  <Signature className="h-3.5 w-3.5 text-slate-500" />
                  <span>Assinatura Digital Tátil *</span>
                </label>
                <button
                  type="button"
                  onClick={clearCanvas}
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 hover:text-red-700 transition-colors uppercase"
                >
                  <Trash className="h-3 w-3" />
                  <span>Limpar</span>
                </button>
              </div>

              {/* Canvas area */}
              <div className="border border-slate-300 rounded-lg overflow-hidden bg-slate-50 relative h-36 flex items-center justify-center">
                <canvas
                  ref={canvasRef}
                  width={380}
                  height={140}
                  className="absolute inset-0 cursor-crosshair touch-none"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />
                <span className="text-[10px] text-slate-400 pointer-events-none select-none">Assine dentro deste retângulo</span>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting || !selectedOrderId}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 text-sm transition-colors disabled:opacity-50 shadow-lg mt-2"
            >
              <Check className="h-4 w-4" />
              <span>{submitting ? "A gravar..." : "Submeter Protocolo"}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
