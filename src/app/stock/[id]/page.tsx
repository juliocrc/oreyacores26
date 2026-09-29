"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getStockCategoryOptions } from "@/lib/stock-categories";
import { performOfflineAwareJsonRequest } from "@/lib/offline-sync/client";
import JsBarcode from "jsbarcode";

type StockArtigoForm = Partial<{
  referencia: string;
  descricao: string;
  categoria: string;
  quantidade: string;
  precoCompra: string;
  precoVenda: string;
  validade: string;
  lote: string;
  leadTimeDias: string;
}>;

export default function StockDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params && typeof params === "object" ? (params as Record<string, string | string[]>).id : undefined;
  const [artigo, setArtigo] = useState<StockArtigoForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<StockArtigoForm>({});
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
      body: form,
      queueEntry: {
        entityType: "stock-artigo",
        entityId: id ? String(id) : undefined,
        summary: `Atualizar stock: ${form.referencia || form.descricao || id}`,
      },
    });
    router.refresh();
  };

  if (loading) return <div className="p-8">A carregar...</div>;
  if (!artigo) return <div className="p-8 text-red-600">Artigo não encontrado.</div>;

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-lg p-6 mt-8 border border-gray-200">
      <h1 className="text-2xl font-bold mb-4">Ficha do Artigo de Stock</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
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
          <div>
            <label className="block font-semibold">Quantidade</label>
            <input className="input input-bordered w-full" type="number" value={form.quantidade || 0} onChange={e => handleChange("quantidade", e.target.value)} />
          </div>
          <div>
            <label className="block font-semibold">Preço Compra</label>
            <input className="input input-bordered w-full" type="number" value={form.precoCompra || ""} onChange={e => handleChange("precoCompra", e.target.value)} />
          </div>
          <div>
            <label className="block font-semibold">Preço Venda</label>
            <input className="input input-bordered w-full" type="number" value={form.precoVenda || ""} onChange={e => handleChange("precoVenda", e.target.value)} />
          </div>
          <div>
            <label className="block font-semibold">Validade</label>
            <input className="input input-bordered w-full" value={form.validade || ""} onChange={e => handleChange("validade", e.target.value)} />
          </div>
          <div>
            <label className="block font-semibold">Lote</label>
            <input className="input input-bordered w-full" value={form.lote || ""} onChange={e => handleChange("lote", e.target.value)} />
          </div>
          <div>
            <label className="block font-semibold">Prazo de entrega (dias)</label>
            <input className="input input-bordered w-full" type="number" min="0" placeholder="15 (predefinido)" value={form.leadTimeDias ?? ""} onChange={e => handleChange("leadTimeDias", e.target.value)} />
            <p className="text-xs text-slate-500">Usado nas previsões para calcular a data-limite de compra.</p>
          </div>
        </div>
        <div className="flex gap-2 mt-6">
          <button type="submit" className="bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400">Guardar</button>
          <button type="button" className="bg-gray-300 px-4 py-2 rounded" onClick={() => router.back()}>Voltar</button>
        </div>
      </form>

      {/* Código de Barras */}
      {form.referencia && (
        <div className="mt-8 pt-6 border-t border-gray-200">
          <h3 className="text-sm font-bold text-slate-700 mb-3">Código de Barras</h3>
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex justify-center">
            <BarcodeDisplay value={form.referencia} />
          </div>
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
