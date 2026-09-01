"use client";
import { useState, useEffect, useCallback } from "react";

type Custo = {
  id: string;
  tipo: string;
  descricao: string;
  valor: string;
  data: string;
  entidade: string;
};

export default function Custos() {
  const [custos, setCustos] = useState<Custo[]>([]);
  const [tipo, setTipo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState("");
  const [entidade, setEntidade] = useState("");
  const [loading, setLoading] = useState(true);

  // Carregar custos da API (com fallback localStorage para migração)
  const fetchCustos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/custos");
      if (res.ok) {
        const data = await res.json();
        setCustos(data);
      } else {
        // Fallback para localStorage durante migração
        const salvos = JSON.parse(localStorage.getItem("custos") || "[]");
        setCustos(salvos);
      }
    } catch {
      // Fallback offline
      try {
        const salvos = JSON.parse(localStorage.getItem("custos") || "[]");
        setCustos(salvos);
      } catch { /* empty */ }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Call asynchronously to avoid calling setState synchronously in effect
    const t = setTimeout(() => {
      void fetchCustos();
    }, 0);
    return () => clearTimeout(t);
  }, [fetchCustos]);

  // Adicionar custo
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tipo || !descricao || !valor || !data || !entidade) return;
    const novo: Custo = {
      id: Date.now().toString(),
      tipo,
      descricao,
      valor,
      data,
      entidade,
    };

    // Optimistic update
    const atualizados = [...custos, novo];
    setCustos(atualizados);
    setTipo(""); setDescricao(""); setValor(""); setData(""); setEntidade("");

    // Persistir na API
    try {
      const res = await fetch("/api/custos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(novo),
      });
      if (res.ok) {
        const saved = await res.json();
        setCustos(prev => prev.map(c => c.id === novo.id ? { ...saved, id: String(saved.id) } : c));
      } else {
        // Fallback localStorage
        localStorage.setItem("custos", JSON.stringify(atualizados));
      }
    } catch {
      // Fallback offline
      localStorage.setItem("custos", JSON.stringify(atualizados));
    }
  };

  // Eliminar custo
  const handleDelete = async (id: string) => {
    const atualizados = custos.filter(c => c.id !== id);
    setCustos(atualizados);
    try {
      await fetch(`/api/custos?id=${id}`, { method: "DELETE" });
    } catch {
      localStorage.setItem("custos", JSON.stringify(atualizados));
    }
  };

  // Calcular total
  const totalCustos = custos.reduce((acc, c) => acc + Number(c.valor || 0), 0);

  return (
    <div className="max-w-3xl mx-auto px-2 sm:px-4">
      <h2 className="text-2xl font-bold mb-4">Custos de Inspeção/Manutenção</h2>
      <form onSubmit={handleAdd} className="mb-4 flex flex-col gap-2">
        <select value={tipo} onChange={e => setTipo(e.target.value)} className="border rounded px-2 py-1">
          <option value="">Tipo</option>
          <option value="Inspeção">Inspeção</option>
          <option value="Manutenção">Manutenção</option>
          <option value="Material">Material</option>
          <option value="Transporte">Transporte</option>
          <option value="Certificação">Certificação</option>
          <option value="Outro">Outro</option>
        </select>
        <input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descrição" className="border rounded px-2 py-1" />
        <input value={valor} onChange={e => setValor(e.target.value)} placeholder="Valor (€)" className="border rounded px-2 py-1" type="number" min="0" step="0.01" />
        <input value={data} onChange={e => setData(e.target.value)} type="date" className="border rounded px-2 py-1" />
        <input value={entidade} onChange={e => setEntidade(e.target.value)} placeholder="Navio/Jangada vinculada" className="border rounded px-2 py-1" />
        <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors">Guardar</button>
      </form>

      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-bold">Custos registados</h3>
        {custos.length > 0 && (
          <span className="text-sm font-semibold bg-blue-100 text-blue-800 px-3 py-1 rounded-full">
            Total: {totalCustos.toFixed(2)} €
          </span>
        )}
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-8">A carregar...</div>
      ) : (
        <table className="min-w-full bg-white rounded shadow mb-2 text-xs sm:text-sm">
          <thead>
            <tr className="bg-blue-100">
              <th className="p-2">Tipo</th>
              <th className="p-2">Descrição</th>
              <th className="p-2">Valor</th>
              <th className="p-2">Data</th>
              <th className="p-2">Vinculado</th>
              <th className="p-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {custos.map((c: Custo) => (
              <tr key={c.id} className="border-t align-top hover:bg-gray-50">
                <td className="p-2">{c.tipo}</td>
                <td className="p-2">{c.descricao}</td>
                <td className="p-2 text-right font-mono">{Number(c.valor).toFixed(2)} €</td>
                <td className="p-2">{c.data}</td>
                <td className="p-2">{c.entidade}</td>
                <td className="p-2">
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="text-red-500 hover:text-red-700 text-xs"
                    title="Eliminar"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {custos.length === 0 && (
              <tr><td colSpan={6} className="p-2 text-gray-400 text-center">Nenhum custo registado.</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
