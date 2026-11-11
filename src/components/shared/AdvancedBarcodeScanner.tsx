"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Barcode,
  Camera,
  CheckCircle2,
  Clock,
  Plus,
  QrCode,
  RefreshCw,
  ScanLine,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { appToast } from "@/lib/app-toast";

type Html5Qrcode = {
  isScanning: boolean;
  start: (config: any, options: any, onScan: (text: string) => void, onError: () => void) => Promise<null>;
  stop: () => Promise<void>;
  clear: () => void;
};

const HISTORY_KEY = "orey-barcode-scan-history";
const MAX_HISTORY = 20;

function getHistory(): Array<{ code: string; found: boolean; at: string }> {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveHistory(history: Array<{ code: string; found: boolean; at: string }>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch {}
}

type ScanResult = {
  id: number;
  referencia: string;
  descricao: string;
  categoria?: string | null;
  quantidade: number;
  quantidadeReservada: number;
  lote?: string | null;
  validade?: string | null;
  precoVenda?: number | null;
  codigoBarras?: string | null;
};

type Mode = "camera" | "manual";

type Props = {
  continuous?: boolean;
  autoOpenArticle?: boolean;
  onArticleFound?: (item: ScanResult) => void;
  articleRouteBase?: string;
};

export default function AdvancedBarcodeScanner({
  continuous = false,
  autoOpenArticle = true,
  onArticleFound,
  articleRouteBase = "/stock",
}: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("camera");
  const [manualCode, setManualCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [history, setHistory] = useState<Array<{ code: string; found: boolean; at: string }>>([]);
  const [cameraError, setCameraError] = useState("");
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [flashOn, setFlashOn] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const processedCodesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setHistory(getHistory());
  }, []);

  const recordScan = useCallback((code: string, found: boolean) => {
    const entry = { code, found, at: new Date().toISOString() };
    const next = [entry, ...history.filter((h) => h.code !== code)];
    setHistory(next);
    saveHistory(next);
  }, [history]);

  const stopScanner = async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner) {
      try {
        if (scanner.isScanning) await scanner.stop();
        // Evitar removeChild no nó que o React já removeu do DOM
        if (containerRef.current && containerRef.current.isConnected) {
          scanner.clear();
        }
      } catch {}
    }
    setScanning(false);
    processedCodesRef.current = new Set();
  };

  const startCamera = useCallback(async () => {
    if (!containerRef.current) return;

    // Verificar se o browser suporta acesso à câmara
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setCameraError(
        "Este browser não suporta acesso à câmara. Use a introdução manual do código."
      );
      setScanning(false);
      return;
    }

    const id = "advanced-barcode-camera-" + Math.random().toString(36).slice(2);
    containerRef.current.id = id;

    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode(id);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode },
        { fps: 10, qrbox: { width: 300, height: 200 } },
        (decodedText) => {
          const code = decodedText.trim();
          if (!code || processedCodesRef.current.has(code)) return;
          processedCodesRef.current.add(code);
          setLastScan(code);
          setScanning(false);
          void lookupAndHandle(code);
        },
        (scanError) => {
          // Erro durante a leitura (não no arranque) - não bloquear, apenas registar
          console.warn("[BarcodeScanner] Scan error:", scanError);
        }
      );
      setCameraError("");
      setScanning(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setCameraError(
        `Não foi possível aceder à câmara: ${msg}. Verifique as permissões do browser ou use a introdução manual.`
      );
      setScanning(false);
    }
  }, [facingMode]);

  useEffect(() => {
    if (mode === "camera") startCamera();
    return () => {
      void stopScanner();
    };
  }, [mode, startCamera]);

  const switchCamera = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  const toggleFlash = () => {
    setFlashOn((prev) => !prev);
    appToast.info(flashOn ? "Lanterna desligada" : "Lanterna ligada (suportada apenas nativamente)");
  };

  const lookupAndHandle = async (code: string) => {
    try {
      const res = await fetch(`/api/stock/by-barcode?code=${encodeURIComponent(code)}`, {
        cache: "no-store",
      });

      if (res.status === 404) {
        setError(`Código "${code}" não encontrado no stock.`);
        recordScan(code, false);
        if (!continuous) setScanning(false);
        return;
      }
      if (res.status === 409) {
        const data = await res.json().catch(() => ({}));
        setError(
          `Código ambíguo: ${data.stockIds?.length} artigos encontrados. Use a referência exata.`
        );
        recordScan(code, false);
        if (!continuous) setScanning(false);
        return;
      }
      if (!res.ok) throw new Error("Erro ao consultar stock.");

      const item: ScanResult = await res.json();
      setLastResult(item);
      recordScan(code, true);
      setError("");

      if (onArticleFound) {
        onArticleFound(item);
      }

      if (autoOpenArticle) {
        appToast.success(`Artigo encontrado: ${item.descricao}`);
        router.push(`${articleRouteBase}/${item.id}`);
      } else {
        setScanning(false);
        if (!continuous) setScanning(false);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao consultar o código lido.");
      recordScan(code, false);
      if (!continuous) setScanning(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    setLastScan(code);
    processedCodesRef.current.add(code);
    setScanning(false);
    await lookupAndHandle(code);
  };

  const resumeScan = () => {
    processedCodesRef.current = new Set();
    setLastScan(null);
    setLastResult(null);
    setError("");
    setCameraError("");
    setScanning(false);
    if (mode === "camera") void startCamera();
  };

  const isManualMode = mode === "manual";
  const isCameraMode = mode === "camera";

  return (
    <div className="fixed inset-0 z-[60] flex flex-col">
      {lastResult && !continuous ? (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-[61] flex items-center justify-center p-4 sm:p-8">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800">
                <Barcode className="h-5 w-5 text-indigo-600" />
                Artigo Encontrado
              </h3>
              <button
                type="button"
                onClick={() => {
                  setLastResult(null);
                  setLastScan(null);
                  if (isCameraMode) void startCamera();
                }}
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
                aria-label="Fechar e voltar a ler"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">
                  {lastResult.categoria || "Artigo de Stock"}
                </span>
                <h2 className="text-lg font-black text-slate-900 mt-1">{lastResult.descricao}</h2>
                <p className="text-xs font-mono text-slate-500 mt-0.5">
                  Ref: {lastResult.referencia}{lastResult.codigoBarras ? ` · CB: ${lastResult.codigoBarras}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold uppercase text-slate-400">Stock Atual</p>
                <p className="text-3xl font-black text-indigo-600 mt-0.5">{lastResult.quantidade}</p>
                <p className="text-xs text-slate-500">
                  Disponível: {Math.max(0, lastResult.quantidade - (lastResult.quantidadeReservada || 0))}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs mb-4">
              <div className="rounded-xl bg-slate-50 p-2 border border-slate-100 text-center">
                <p className="text-slate-400 font-bold text-[10px]">Lote</p>
                <p className="font-semibold text-slate-800">{lastResult.lote || "—"}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-2 border border-slate-100 text-center">
                <p className="text-slate-400 font-bold text-[10px]">Validade</p>
                <p className="font-semibold text-slate-800">{lastResult.validade || "—"}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-2 border border-slate-100 text-center">
                <p className="text-slate-400 font-bold text-[10px]">Preço Venda</p>
                <p className="font-semibold text-slate-800">
                  {lastResult.precoVenda ? `${lastResult.precoVenda.toFixed(2)} €` : "—"}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Link
                href={`${articleRouteBase}/${lastResult.id}`}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/25"
              >
                <ArrowRight className="h-4 w-4" />
                Abrir Ficha do Artigo
              </Link>

              <button
                type="button"
                onClick={() => {
                  router.push(`${articleRouteBase}/${lastResult.id}`);
                  setLastResult(null);
                  setLastScan(null);
                  if (isCameraMode) void startCamera();
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors"
              >
                <QrCode className="h-4 w-4 text-slate-500" />
                Ver no Stock
              </button>

              {!continuous && (
                <button
                  type="button"
                  onClick={() => {
                    setLastResult(null);
                    setLastScan(null);
                    if (isCameraMode) void startCamera();
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium text-sm hover:bg-slate-50 transition-colors"
                >
                  <RefreshCw className="h-4 w-4" />
                  Ler Outro Código
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="relative z-[60] w-full max-w-md mx-auto mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-indigo-600" />
            <span className="font-bold text-slate-800">Leitor de Código de Barras / QR</span>
          </div>
          <button
            type="button"
            onClick={() => setMode("manual")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${isManualMode ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            Digitar
          </button>
          <button
            type="button"
            onClick={() => setMode("camera")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${isCameraMode ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            Câmara
          </button>
        </div>

        {cameraError && (
          <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <span>{cameraError}</span>
          </div>
        )}

        {error && (
          <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {isCameraMode ? (
          <div className="relative">
            <div
              ref={containerRef}
              className="w-full aspect-video bg-black rounded-2xl overflow-hidden flex items-center justify-center"
            >
              {scanning && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                  <div className="flex items-center gap-2 mb-2 animate-pulse">
                    <Activity className="h-5 w-5 text-yellow-400" />
                    <span className="text-xs font-medium">A Ler…</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-slate-200">
                    {facingMode === "environment" ? "Traseira" : "Frontal"} · {flashOn ? "Lanterna" : ""}
                  </div>
                </div>
              )}
              {!scanning && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                  <Camera className="h-12 w-12 mb-2 opacity-50" />
                  <span className="text-sm">Pronta para ler</span>
                </div>
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={switchCamera}
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Camera className="h-4 w-4 mr-1.5" />
                {facingMode === "environment" ? "Câmera Traseira" : "Câmera Frontal"}
              </button>
              {continuous && (
                <button
                  type="button"
                  onClick={resumeScan}
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <RefreshCw className="h-4 w-4 mr-1.5" />
                  Ler Outro
                </button>
              )}
              <button
                type="button"
                onClick={toggleFlash}
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Activity className={`h-4 w-4 mr-1.5 ${flashOn ? "text-yellow-500 animate-pulse" : "text-slate-400"}`} />
                Lanterna {flashOn ? "ON" : "OFF"}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleManualSubmit} className="space-y-3">
            <div className="relative">
              <Barcode className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Código de barras ou referência…"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={!manualCode.trim()}
              className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {scanning ? "A processar…" : "Pesquisar Artigo"}
            </button>
          </form>
        )}

        {history.length > 0 && !isCameraMode && (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              <Clock className="h-3 w-3 mr-1" />
              Últimas Leituras
            </p>
            <div className="space-y-1">
              {history.slice(0, 8).map((entry, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setManualCode(entry.code);
                    void lookupAndHandle(entry.code);
                  }}
                  className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-colors ${entry.found ? "bg-emerald-50 text-emerald-800 border border-emerald-100" : "bg-slate-50 text-slate-700 border border-slate-100"}`}
                >
                  <span className="font-mono text-slate-700 truncate max-w-[140px]">{entry.code}</span>
                  <span className={`text-[10px] font-bold ${entry.found ? "text-emerald-600" : "text-red-600"}`}>
                    {entry.found ? "OK" : "Não Encontrado"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-2 text-center">
        <button
          type="button"
          onClick={() => {
            setMode("camera");
            setScanning(false);
            setLastScan(null);
            setLastResult(null);
            setError("");
            setCameraError("");
          }}
          className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
        >
          <Plus className="h-3 w-3" />
          Novo Leitor
        </button>
      </div>
    </div>
  );
}
