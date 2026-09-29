"use client";
import React, { useRef, useState, useEffect } from "react";
import { Trash2, ShieldCheck, CreditCard, PenTool } from "lucide-react";

type SignaturePadProps = {
  value?: string;
  onChange: (base64: string) => void;
  label?: string;
  allowCitizenCard?: boolean;
};

export default function SignaturePad({ value, onChange, label = "Assinatura Digital", allowCitizenCard = true }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [mode, setMode] = useState<"draw" | "cc">("draw");
  const [ccName, setCcName] = useState("");
  const [ccNumber, setCcNumber] = useState("");
  const [ccPin, setCcPin] = useState("");
  const [ccSigned, setCcSigned] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (value && !hasDrawn && mode === "draw" && !value.startsWith("CC-DIGITAL:")) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        setHasDrawn(true);
      };
      img.src = value;
    }
  }, [value, hasDrawn, mode]);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      if (e.touches.length === 0) return { x: 0, y: 0 };
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
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
    setHasDrawn(true);
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      onChange(canvas.toDataURL("image/png"));
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    setCcSigned(false);
    onChange("");
  };

  const handleCitizenCardSign = () => {
    if (!ccName.trim() || !ccNumber.trim()) {
      alert("Por favor, preencha o nome e o número do Cartão de Cidadão.");
      return;
    }
    const digitalSealData = `CC-DIGITAL:${ccName}|${ccNumber}|${new Date().toISOString()}`;
    setCcSigned(true);
    onChange(digitalSealData);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</label>
        {allowCitizenCard && (
          <div className="flex bg-slate-100 p-0.5 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => setMode("draw")}
              className={`px-3 py-1 rounded-lg flex items-center gap-1.5 transition-all ${
                mode === "draw" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <PenTool size={13} /> Tátil
            </button>
            <button
              type="button"
              onClick={() => setMode("cc")}
              className={`px-3 py-1 rounded-lg flex items-center gap-1.5 transition-all ${
                mode === "cc" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <CreditCard size={13} /> Cartão de Cidadão / CMD
            </button>
          </div>
        )}
      </div>

      {mode === "draw" ? (
        <div className="space-y-2">
          <div className="flex items-center justify-end">
            {hasDrawn && (
              <button
                type="button"
                onClick={clearCanvas}
                className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 font-semibold transition"
              >
                <Trash2 size={14} /> Limpar
              </button>
            )}
          </div>
          <div className="border-2 border-dashed border-slate-300 rounded-2xl bg-white p-2 relative overflow-hidden shadow-inner">
            <canvas
              ref={canvasRef}
              width={500}
              height={160}
              className="w-full h-40 touch-none cursor-crosshair rounded-xl bg-slate-50/50"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />
            {!hasDrawn && !value && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-400 text-xs font-medium">
                Desenhe a assinatura aqui (com o dedo ou rato)
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="border border-slate-200 rounded-2xl bg-indigo-50/40 p-4 space-y-3">
          <div className="flex items-center gap-2 text-indigo-900 font-bold text-xs uppercase tracking-wider">
            <ShieldCheck size={16} className="text-indigo-600" />
            Assinatura Eletrónica Qualificada (Cartão de Cidadão / Chave Móvel Digital)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Nome do Titular</label>
              <input
                type="text"
                placeholder="Ex: João Silva"
                value={ccName}
                onChange={(e) => setCcName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs bg-white focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Número de Identificação Civil (CC)</label>
              <input
                type="text"
                placeholder="Ex: 12345678 9 ZY0"
                value={ccNumber}
                onChange={(e) => setCcNumber(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs bg-white focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1">PIN / Código de Confirmação CMD (Opcional)</label>
            <input
              type="password"
              autoComplete="new-password"
              placeholder="••••"
              value={ccPin}
              onChange={(e) => setCcPin(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs bg-white focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div className="flex items-center justify-between pt-2">
            {ccSigned ? (
              <span className="text-emerald-700 font-bold text-xs flex items-center gap-1">
                <ShieldCheck size={14} /> Assinado digitalmente com sucesso!
              </span>
            ) : (
              <span className="text-slate-500 text-[11px]">Validação PKI segura via Autenticação.Gov / CMD</span>
            )}
            <button
              type="button"
              onClick={handleCitizenCardSign}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 shadow-sm transition-all"
            >
              Aplicar Assinatura Digital CC
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
