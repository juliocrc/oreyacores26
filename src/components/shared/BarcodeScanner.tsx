"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";
// Import apenas de tipo: a lib (com ZXing) pesa ~280 KB e só é precisa quando o
// utilizador abre a câmara. Carregá-la aqui forçava o download em todas as páginas.
import type { Html5Qrcode } from "html5-qrcode";
import { X, Camera, ScanLine, Bluetooth, Clock } from "lucide-react";

const HISTORY_KEY = "orey-scan-history";
const MAX_HISTORY = 10;

function getHistory(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; }
}

function addToHistory(code: string) {
  try {
    const h = getHistory().filter(c => c !== code);
    h.unshift(code);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, MAX_HISTORY)));
  } catch {}
}

type Props = {
  onScan: (code: string) => void;
  onClose: () => void;
  placeholder?: string;
  /** Se true, o scanner não fecha automaticamente após uma leitura */
  continuous?: boolean;
};

type Mode = "camera" | "hardware";

export default function BarcodeScanner({ onScan, onClose, placeholder = "Ex: D508 ou serial da jangada...", continuous = false }: Props) {
  const [error, setError] = useState("");
  const [mode, setMode] = useState<Mode>("hardware");
  const [buffer, setBuffer] = useState("");
  const [lastKey, setLastKey] = useState(0);
  const [scanHistory, setScanHistory] = useState<string[]>([]);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Carregar histórico
  useEffect(() => { setScanHistory(getHistory()); }, []);

  // Guardar no histórico e chamar onScan

  // ── Hardware scanner mode (keyboard wedge) ──
  useEffect(() => {
    if (mode !== "hardware") return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        const code = buffer.trim();
        if (code.length > 2) {
          setBuffer("");
          addToHistory(code);
          setScanHistory(getHistory());
          onScan(code);
        }
      } else if (e.key.length === 1) {
        setBuffer((prev) => prev + e.key);
      }
      setLastKey(Date.now());
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mode, buffer, onScan]);

  // Auto-detect: if no keyboard activity for 5s, offer camera mode
  useEffect(() => {
    if (mode !== "hardware") return;
    const timer = setInterval(() => {
      if (Date.now() - lastKey > 5000 && lastKey > 0) {
        // Keep waiting for scanner input
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [lastKey, mode]);

  // ── Camera scanner mode ──
  const startCamera = useCallback(async () => {
    const id = "barcode-camera-" + Math.random().toString(36).slice(2);
    if (containerRef.current) containerRef.current.id = id;

    const { Html5Qrcode } = await import("html5-qrcode");
    const scanner = new Html5Qrcode(id);
    scannerRef.current = scanner;
    await scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        (decodedText) => {
          onScan(decodedText);
          scanner.stop().catch(() => {});
        },
        () => {}
      )
      .catch((err) => setError("Erro ao iniciar câmara: " + err));
  }, [onScan]);

  useEffect(() => {
    if (mode === "camera") startCamera();
    return () => {
      scannerRef.current?.stop().catch(() => {});
    };
  }, [mode, startCamera]);

  const switchMode = (m: Mode) => {
    setError("");
    setBuffer("");
    scannerRef.current?.stop().catch(() => {});
    setMode(m);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-5 max-w-md w-full shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <ScanLine size={18} className="text-indigo-600" />
            Scanner
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl">
            <X size={18} />
          </button>
        </div>

        {/* Mode selector */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => switchMode("hardware")}
            className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              mode === "hardware" ? "bg-indigo-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Bluetooth size={14} />
            Scanner Bluetooth/USB
          </button>
          <button
            onClick={() => switchMode("camera")}
            className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              mode === "camera" ? "bg-indigo-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Camera size={14} />
            Câmara
          </button>
        </div>

        {/* Histórico */}
        {scanHistory.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Clock size={12} /> Últimas leituras
            </p>
            <div className="flex flex-wrap gap-1.5">
              {scanHistory.slice(0, 6).map((code) => (
                <button key={code} onClick={() => { addToHistory(code); onScan(code); }}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-100 text-xs font-mono text-slate-700 hover:text-indigo-700 transition-colors border border-slate-200"
                >{code}</button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="text-red-600 text-sm p-3 bg-red-50 rounded-xl mb-3">{error}</div>
        )}

        {/* Manual input — funciona sem leitor */}
        <div className="mb-4">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Digitar código manualmente</label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={placeholder}
              className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm bg-white focus:border-indigo-500 focus:outline-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const val = (e.target as HTMLInputElement).value.trim();
                  if (val.length > 0) {
                    onScan(val);
                    (e.target as HTMLInputElement).value = "";
                  }
                }
              }}
            />
            <button
              onClick={() => {
                const input = document.querySelector<HTMLInputElement>('input[placeholder="Ex: D508 ou 02176011..."]');
                if (input && input.value.trim()) {
                  onScan(input.value.trim());
                  input.value = "";
                }
              }}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700"
            >
              OK
            </button>
          </div>
        </div>

        {mode === "hardware" ? (
          <div className="text-center py-8">
            <Bluetooth size={40} className="mx-auto text-indigo-400 mb-3" />
            <p className="text-sm font-medium text-slate-700">
              Aproxime o código ao leitor Bluetooth/USB
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Compatível com leitores 1D/2D Bluetooth e 2.4G
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-slate-500">A aguardar leitura...</span>
            </div>
            {/* Hidden input for mobile keyboard wedge support */}
            <input
              ref={inputRef}
              type="text"
              className="absolute opacity-0 pointer-events-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const val = (e.target as HTMLInputElement).value;
                  if (val.length > 2) {
                    onScan(val);
                    (e.target as HTMLInputElement).value = "";
                  }
                }
              }}
            />
          </div>
        ) : (
          <div ref={containerRef} className="w-full aspect-video bg-black rounded-xl overflow-hidden" />
        )}
      </div>
    </div>
  );
}
