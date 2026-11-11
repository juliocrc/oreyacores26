"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Barcode,
  Box,
  Camera,
  CheckCircle2,
  Clock,
  Loader2,
  Plus,
  QrCode,
  RefreshCw,
  ScanLine,
  Search,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { appToast } from "@/lib/app-toast";
import AdvancedBarcodeScanner from "@/components/shared/AdvancedBarcodeScanner";
import StockMovementHistory from "@/components/stock/StockMovementHistory";
import StockArticleThumbnail from "@/components/shared/StockArticleThumbnail";

type StockItem = {
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

export default function StockScannerPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [item, setItem] = useState<StockItem | null>(null);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [adjustQty, setAdjustQty] = useState(1);
  const [adjustType, setAdjustType] = useState<"add" | "sub">("sub");
  const [showScanner, setShowScanner] = useState(false);
  const [continuous, setContinuous] = useState(false);
  const busyRef = useRef(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [recentScans, setRecentScans] = useState<Array<{ code: string; item: StockItem | null; at: string }>>([]);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleArticleFound = useCallback((item: StockItem) => {
    setItem(item);
    setError("");
    setShowScanner(false);
    const already = recentScans.find((s) => s.code === item.codigoBarras || s.code === item.referencia);
    if (!already) {
      setRecentScans((prev) => [
        { code: item.codigoBarras || item.referencia, item, at: new Date().toISOString() },
        ...prev.slice(0, 9),
      ]);
    }
    appToast.success(`Artigo encontrado: ${item.descricao}`);
  }, [recentScans]);

  const handleSearch = async (code = query) => {
    if (!code.trim() || busyRef.current) return;

    busyRef.current = true;
    setLoading(true);
    setError("");
    setSuccessMsg("");
    setItem(null);

    try {
      const res = await fetch(`/api/stock/by-barcode?code=${encodeURIComponent(code.trim())}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Artigo não encontrado no stock.");
      setItem(data);
      handleArticleFound(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Artigo não encontrado.");
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  };

  const handleUpdateStock = async () => {
    if (!item || busyRef.current) return;
    if (!Number.isSafeInteger(adjustQty) || adjustQty <= 0 || adjustQty > 2_147_483_647) {
      setError("Indique uma quantidade inteira positiva.");
      return;
    }
    busyRef.current = true;
    setLoading(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await fetch(`/api/stock/${item.id}/movimentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operacao: adjustType === "sub" ? "saida" : "entrada", quantidade: adjustQty }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao atualizar stock.");
      setItem(data);
      setSuccessMsg(`Movimento registado: ${data.quantidade} unidades em stock.`);
      setHistoryRevision((value) => value + 1);
      setQuery("");
      inputRef.current?.focus();
      // Atualizar recent scans
      setRecentScans((prev) =>
        prev.map((s) =>
          s.item?.id === item.id ? { ...s, item: data } : s
        )
      );
    } catch (err: unknown) {
      setItem(null);
      setError(err instanceof Error ? err.message : "Erro ao atualizar stock.");
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  };

  const clearItem = () => {
    setItem(null);
    setError("");
    setSuccessMsg("");
    setQuery("");
    inputRef.current?.focus();
  };

  const openScanner = () => {
    setShowScanner(true);
    setError("");
  };

  const closeScanner = () => {
    setShowScanner(false);
  };

  const toggleContinuous = () => {
    setContinuous((prev) => !prev);
    appToast.info(continuous ? "Leitura única ativada" : "Leitura contínua ativada");
  };

  const openArticlePage = () => {
    if (!item) return;
    router.push(`/stock/${item.id}`);
  };

  return (
    <div className="space-y-8 p-6 lg:p-10 animate-in fade-in duration-300 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/stock" className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 mb-2">
            <ArrowLeft className="h-4 w-4" /> Voltar ao Stock
          </Link>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Barcode className="h-6 w-6 text-indigo-600" />
            Leitor de Código de Barras / QR
          </h1>
          <p className="text-sm text-slate-500">
            Leia o código de barras de um artigo para abrir a ficha, consultar o stock e registar movimentos rapidamente.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={openScanner}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 shadow-sm disabled:opacity-50 transition-colors"
          >
            <QrCode className="h-4 w-4" />
            {showScanner ? "Fechar Leitor" : "Ler com Câmara"}
          </button>
          <button
            type="button"
            onClick={toggleContinuous}
            className={`inline-flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-colors ${
              continuous
                ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                : "bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200"
            }`}
          >
            <RefreshCw className="h-3 w-3" />
            {continuous ? "Único" : "Contínuo"}
          </button>
        </div>
      </div>

      {showScanner && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <ScanLine size={16} className="text-indigo-600" />
              Leitura de Código
            </h3>
            <button
              type="button"
              onClick={closeScanner}
              className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <X size={18} />
            </button>
          </div>
          <AdvancedBarcodeScanner
            continuous={continuous}
            autoOpenArticle={false}
            onArticleFound={handleArticleFound}
            articleRouteBase="/stock"
          />
          <div className="mt-4">
            <button
              type="button"
              onClick={() => {
                setShowScanner(false);
                if (item) openArticlePage();
              }}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              {item ? `Abrir Ficha: ${item.descricao}` : "Voltar ao Início"}
            </button>
          </div>
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); void handleSearch(); }} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              aria-label="Código de barras ou referência"
              disabled={loading}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setItem(null); setSuccessMsg(""); }}
              placeholder="Insira ou bipe o código de barras / referência…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-3 text-sm font-medium text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="rounded-xl bg-indigo-600 px-6 py-3 text-xs font-bold text-white hover:bg-indigo-700 shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Pesquisar
          </button>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={openScanner}
          className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
        >
          <Camera className="h-4 w-4" /> Ler com Câmara
        </button>
      </form>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {item && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg">
                {item.categoria || "Artigo de Stock"}
              </span>
              <h2 className="text-lg font-black text-slate-900 mt-2">{item.descricao}</h2>
              <p className="text-xs font-mono text-slate-500 mt-0.5">
                Ref: {item.referencia}{item.codigoBarras ? ` · Código de Barras: ${item.codigoBarras}` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold uppercase text-slate-400">Stock Atual</p>
              <p className="text-3xl font-black text-indigo-600 mt-0.5">{item.quantidade}</p>
              <p className="text-xs text-slate-500">
                Disponível: {Math.max(0, item.quantidade - (item.quantidadeReservada || 0))}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
            <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
              <p className="text-slate-400 font-bold">Lote</p>
              <p className="font-semibold text-slate-800 mt-1">{item.lote || "—"}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
              <p className="text-slate-400 font-bold">Validade</p>
              <p className="font-semibold text-slate-800 mt-1">{item.validade || "—"}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
              <p className="text-slate-400 font-bold">Preço Venda</p>
              <p className="font-semibold text-slate-800 mt-1">
                {item.precoVenda ? `${item.precoVenda.toFixed(2)} €` : "—"}
              </p>
            </div>
          </div>

          <StockMovementHistory stockId={item.id} revision={historyRevision} onBusyChange={busy => {
            busyRef.current = busy;
            setLoading(busy);
          }} onReversed={async () => {
            const response = await fetch(`/api/stock/${item.id}`, { cache: "no-store" });
            if (!response.ok) { setItem(null); throw new Error("Estorno registado. Pesquise o artigo novamente."); }
            setItem(await response.json());
          }} />

          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-3">
            <h3 className="text-xs font-bold text-indigo-900 uppercase tracking-wider">Registar Movimento Rápido</h3>
            <div className="flex flex-wrap items-center gap-3">
              <select
                aria-label="Tipo de movimento"
                disabled={loading}
                value={adjustType}
                onChange={(e) => setAdjustType(e.target.value as "add" | "sub")}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
              >
                <option value="sub">Baixa (-)</option>
                <option value="add">Entrada (+)</option>
              </select>
              <input
                type="number"
                min={1}
                step={1}
                max={2_147_483_647}
                aria-label="Quantidade do movimento"
                disabled={loading}
                value={adjustQty}
                onChange={(e) => setAdjustQty(Number(e.target.value))}
                className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
              />
              <button
                type="button"
                onClick={() => void handleUpdateStock()}
                disabled={loading}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 shadow-sm flex items-center gap-2"
              >
                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Aplicar Movimento
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={openArticlePage}
              className="flex-1 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 shadow-sm transition-colors"
            >
              <ArrowRight className="h-4 w-4 mr-1.5" />
              Abrir Ficha Completa
            </button>
            <button
              type="button"
              onClick={clearItem}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Limpar
            </button>
          </div>
        </div>
      )}

      {recentScans.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Clock size={16} className="text-indigo-600" />
              Leituras Recentes
            </h3>
            <button
              type="button"
              onClick={() => setRecentScans([])}
              className="text-xs text-slate-400 hover:text-red-600 transition-colors"
            >
              Limpar
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentScans.map((scan, i) => (
              <div
                key={i}
                onClick={() => {
                  setItem(scan.item || null);
                  setError("");
                  setSuccessMsg("");
                  setShowScanner(false);
                }}
                className="rounded-xl border border-slate-100 bg-slate-50 p-3 cursor-pointer hover:bg-indigo-50 hover:border-indigo-100 transition-colors group"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs text-slate-600 truncate">{scan.code}</span>
                  <span className="text-[10px] font-bold text-emerald-600">Artigo</span>
                </div>
                <p className="text-sm font-semibold text-slate-800 truncate">{scan.item?.descricao}</p>
                <p className="text-xs text-slate-500 mt-1">
                  Stock: {scan.item?.quantidade} ·
                  Ref: {scan.item?.referencia}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
