"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getStockCategoryOptions } from "@/lib/stock-categories";
import { performOfflineAwareJsonRequest } from "@/lib/offline-sync/client";
import JsBarcode from "jsbarcode";
import { stockItemSupportsValidity } from "@/lib/stock-validity";
import StockArticleThumbnail from "@/components/shared/StockArticleThumbnail";
import { isServiceResourceReference } from "@/lib/stock-reference-rules";
import StockMovementHistory from "@/components/stock/StockMovementHistory";
import StockValiditySelect from "@/components/stock/StockValiditySelect";
import { getStockValidityManualMode } from "@/lib/stock-metadata";

type StockArtigoForm = Partial<{
  referencia: string;
  descricao: string;
  categoria: string;
  quantidade: string;
  precoCompra: string;
  precoVenda: string;
  validade: string;
  lote: string;
  codigoBarras: string;
  observacoes: string;
  leadTimeDias: string;
  foto: string;
}>;

export default function StockDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params && typeof params === "object" ? (params as Record<string, string | string[]>).id : undefined;
  const [artigo, setArtigo] = useState<StockArtigoForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<StockArtigoForm>({});
  const [historyRevision, setHistoryRevision] = useState(0);
  const categoriasDisponiveis = getStockCategoryOptions();

  useEffect(() => {
    if (!id) return;
    fetch(`/api/stock/${id}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        setArtigo(data);
        setForm(data || {});
        setLoading(false);
      });
  }, [id]);

  const handleChange = (field: keyof StockArtigoForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await performOfflineAwareJsonRequest({
      path: `/api/stock/${id}`,
      method: "PUT",
      body: { ...form, validadeAplicavelManual: getStockValidityManualMode(form.observacoes) },
      queueEntry: {
        entityType: "stock-artigo",
        entityId: id ? String(id) : undefined,
        summary: `Atualizar stock: ${form.referencia || form.descricao || id}`,
      },
    });
    setHistoryRevision(value => value + 1);
    router.refresh();
  };

  if (loading) return <div className="p-8">A carregar...</div>;
  if (!artigo) return <div className="p-8 text-red-600">Artigo não encontrado.</div>;
  const isResource = isServiceResourceReference(form.referencia);
  const supportsValidity = !isResource && stockItemSupportsValidity(form);

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-lg p-6 mt-8 border border-gray-200">
      <h1 className="text-2xl font-bold mb-4">Ficha do Artigo de Stock</h1>
      {isResource && <p className="mb-4 inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sm font-semibold text-sky-800">Recurso sem controlo stock</p>}
      <StockArticleThumbnail foto={artigo.foto} label={artigo.referencia || artigo.descricao || "artigo"} className="w-16 h-16 mb-4" />
      <form onSubmit={handleSubmit} className="space-y-6">
        <StockValiditySelect item={form} onChange={observacoes => handleChange("observacoes", observacoes)} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block font-semibold">Referência</label>
            <input className="input input-bordered w-full" value={form.referencia || ""} onChange={e => handleChange("referencia", e.target.value)} />
          </div>
          <div>
            <label className="block font-semibold">Descrição</label>
            <input className="input input-bordered w-full" value={form.descricao || ""} onChange={e => handleChange("descricao", e.target.value)} />
          </div>
          <div>
            <label className="block font-semibold">Categoria</label>
            <select className="input input-bordered w-full" value={form.categoria || ""} onChange={e => handleChange("categoria", e.target.value)}>
              <option value="">Sem categoria</option>
              {categoriasDisponiveis.map((categoria) => (
                <option key={categoria.value} value={categoria.value}>{categoria.label}</option>
              ))}
            </select>
          </div>
          {!isResource && <div>
            <label className="block font-semibold">Quantidade</label>
            <input className="input input-bordered w-full" type="number" value={form.quantidade || 0} onChange={e => handleChange("quantidade", e.target.value)} />
          </div>}
          <div>
            <label className="block font-semibold">Preço Compra</label>
            <input className="input input-bordered w-full" type="number" value={form.precoCompra || ""} onChange={e => handleChange("precoCompra", e.target.value)} />
          </div>
          <div>
            <label className="block font-semibold">Preço Venda</label>
            <input className="input input-bordered w-full" type="number" value={form.precoVenda || ""} onChange={e => handleChange("precoVenda", e.target.value)} />
          </div>
          {!isResource && <div>
            <label className="block font-semibold">Validade</label>
            <input className="input input-bordered w-full" disabled={!supportsValidity} value={form.validade || ""} onChange={e => handleChange("validade", e.target.value)} />
          </div>}
          {!isResource && <div>
            <label className="block font-semibold">Lote</label>
            <input className="input input-bordered w-full" disabled={!supportsValidity} value={form.lote || ""} onChange={e => handleChange("lote", e.target.value)} />
            <p className="text-xs text-slate-500">Para outro lote, crie um novo registo com a mesma referencia. A identidade com historico e imutavel.</p>
          </div>}
          {!isResource && <div>
            <label className="block font-semibold">Prazo de entrega (dias)</label>
            <input className="input input-bordered w-full" type="number" min="0" placeholder="15 (predefinido)" value={form.leadTimeDias ?? ""} onChange={e => handleChange("leadTimeDias", e.target.value)} />
            <p className="text-xs text-slate-500">Usado nas previsões para calcular a data-limite de compra.</p>
          </div>}
        </div>
        <div className="flex gap-2 mt-6">
          <button type="submit" className="bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400">Guardar</button>
          <button type="button" className="bg-gray-300 px-4 py-2 rounded" onClick={() => router.back()}>Voltar</button>
        </div>
      </form>
      <StockMovementHistory stockId={Number(id)} revision={historyRevision} onReversed={async () => {
        const response = await fetch(`/api/stock/${id}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Estorno registado. Recarregue o artigo para consultar o saldo.");
        const data = await response.json();
        setArtigo(data);
        setForm(data);
      }} />

      {/* Código de Barras */}
      {form.referencia && (
        <div className="mt-8 pt-6 border-t border-gray-200">
          <h3 className="text-sm font-bold text-slate-700 mb-3">Código de Barras</h3>
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex justify-center">
            <BarcodeDisplay value={artigo.codigoBarras || artigo.referencia || ""} />
          </div>
          {!artigo.codigoBarras && <p className="text-xs text-slate-500">Codigo legado por referencia. Se houver varios lotes, use o QR/ID do registo.</p>}
        </div>
      )}
    </div>
  );
}

function BarcodeDisplay({ value }: { value: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvasRef.current) {
      try {
        JsBarcode(canvasRef.current, value, {
          format: "CODE128",
          displayValue: true,
          fontSize: 18,
          height: 70,
          width: 2.5,
          margin: 5,
        });
      } catch {}
    }
  }, [value]);
  return <canvas ref={canvasRef} />;
}
