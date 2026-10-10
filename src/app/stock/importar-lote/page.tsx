"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { QrCode, ArrowLeft, Upload, CheckCircle2, AlertCircle } from "lucide-react";
import { appToast } from "@/lib/app-toast";

export default function ImportarLoteStockPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"increment" | "absolute">("increment");
  const [loading, setLoading] = useState(false);
  const [responseResult, setResponseResult] = useState<any | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = String(evt.target?.result || "");
      setText(content);
      appToast.success("Ficheiro carregado com sucesso!");
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) {
      appToast.error("Insira dados ou carregue um ficheiro.");
      return;
    }
    setLoading(true);
    setResponseResult(null);
    try {
      const res = await fetch("/api/stock/importar-lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erro ao importar lote.");
      setResponseResult(data);
      appToast.success(`Importação concluída! ${data.processed} linhas processadas.`);
    } catch (err: any) {
      appToast.error(err?.message || "Erro na importação.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/stock")}
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-black text-slate-900">BatchScan: Importação de Lote / Leitor Portátil</h1>
            <p className="text-xs text-slate-500">Sincronize leituras em lote (.txt / .csv) de leitores portáteis ou telemóveis com o stock.</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600">Modo de Atualização</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode("increment")}
                className={`px-4 py-2 text-xs font-bold rounded-xl border transition ${mode === "increment" ? "bg-cyan-600 text-white border-cyan-600 shadow-sm" : "bg-slate-100 text-slate-700 border-slate-200"}`}
              >
                Incrementar Quantidade
              </button>
              <button
                type="button"
                onClick={() => setMode("absolute")}
                className={`px-4 py-2 text-xs font-bold rounded-xl border transition ${mode === "absolute" ? "bg-cyan-600 text-white border-cyan-600 shadow-sm" : "bg-slate-100 text-slate-700 border-slate-200"}`}
              >
                Inventário (Substituir Qtd)
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600">Carregar Ficheiro (.txt / .csv)</label>
            <input
              type="file"
              accept=".txt,.csv"
              onChange={handleFileUpload}
              className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-cyan-50 file:text-cyan-700 hover:file:bg-cyan-100 cursor-pointer"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-600">Dados do Lote (Formato: Referencia;Quantidade por linha)</label>
          <textarea
            rows={10}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"REF-001; 10\nREF-002; 4\nBARCODE123456; 25"}
            className="w-full rounded-xl border border-slate-300 p-3 font-mono text-xs focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="submit"
            disabled={loading || !text.trim()}
            className="rounded-xl bg-cyan-600 px-6 py-2.5 text-xs font-bold text-white shadow hover:bg-cyan-700 transition disabled:opacity-50"
          >
            {loading ? "A processar..." : "Processar e Sincronizar Stock"}
          </button>
        </div>
      </form>

      {responseResult && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-emerald-700 font-bold text-sm">
            <CheckCircle2 size={20} /> Importação concluída com sucesso ({responseResult.processed} linhas)
          </div>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 font-semibold text-slate-700 uppercase">
                <tr>
                  <th className="p-3">Código / Referência</th>
                  <th className="p-3">Descrição</th>
                  <th className="p-3 text-center">Quantidade</th>
                  <th className="p-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono">
                {responseResult.results?.map((r: any, idx: number) => (
                  <tr key={idx}>
                    <td className="p-3 font-bold text-slate-800">{r.referenciaOrBarcode}</td>
                    <td className="p-3 text-slate-600 font-sans">{r.descricao || "—"}</td>
                    <td className="p-3 text-center">{r.quantidade}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.status.includes("sucesso") ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
