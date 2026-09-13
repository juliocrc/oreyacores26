"use client";
/**
 * LEGADO — não usar em fluxos novos.
 * Catálogo operacional: /stock + Prisma model Stock.
 * Este módulo mantém o modelo local `Artigo` apenas por compatibilidade.
 */
// Módulo de Estoque de Artigos (legacy)
import { useEffect, useState } from "react";
import { DRINKING_WATER_STOCK_REFERENCE } from "../lib/stock-reference-rules";
import { BELLOWS_STOCK_REFERENCE } from "../lib/stock-reference-rules";
import { uuidv4 } from "../utils/uuid";


// Corrigido: Padronização do tipo principal
export type ArtigoStock = {
  id?: string;
  name: string;
  descricao?: string;
  type?: string;
  code?: string;
  referencia?: string;
  precoVenda?: number;
  quantity?: number | string;
  unit?: string;
  stock: number;
  minStock: number;
};
const DEFAULT_ARTIGOS: ArtigoStock[] = [
  { name: "Fachos de Mão", stock: 0, minStock: 3, unit: "un", referencia: "", precoVenda: 0 },
  { name: "Foguetes Paraquedas", stock: 0, minStock: 2, unit: "un", referencia: "", precoVenda: 0 },
  { name: "Sinal Fumígeno Flutuante", stock: 0, minStock: 1, unit: "un", referencia: "", precoVenda: 0 },
  { name: "Fogos de Mão", stock: 0, minStock: 1, unit: "un", referencia: "", precoVenda: 0 },
  { name: "Lanterna Estanque", stock: 0, minStock: 1, unit: "un", referencia: "", precoVenda: 0 },
  { name: "Espelho de Sinalização", stock: 0, minStock: 1, unit: "un", referencia: "", precoVenda: 0 },
  { name: "Apito de Sobrevivência", stock: 0, minStock: 1, unit: "un", referencia: "", precoVenda: 0 },
  { name: "Pastilhas para Enjoo", stock: 0, minStock: 6, unit: "un/pax", referencia: "", precoVenda: 0 },
  { name: "Saco para Enjoo", stock: 0, minStock: 1, unit: "un/pax", referencia: "", precoVenda: 0 },
  { name: "Esponja", stock: 0, minStock: 2, unit: "un", referencia: "", precoVenda: 0 },
  { name: "Vertedouro (Bailer)", stock: 0, minStock: 1, unit: "un", referencia: "", precoVenda: 0 },
  { name: "Âncora Flutuante", stock: 0, minStock: 1, unit: "un", referencia: "", precoVenda: 0 },
  { name: "Remos Flutuantes", stock: 0, minStock: 2, unit: "un", referencia: "", precoVenda: 0 },
  { name: "Faca Flutuante", stock: 0, minStock: 1, unit: "un", referencia: "", precoVenda: 0 },
  { name: "Kit de Reparação", stock: 0, minStock: 1, unit: "kit", referencia: "", precoVenda: 0 },
  { name: "Bellows", stock: 0, minStock: 1, unit: "un", referencia: BELLOWS_STOCK_REFERENCE, precoVenda: 0 },
  { name: "Manta Térmica (TPA)", stock: 0, minStock: 1, unit: "un", referencia: "", precoVenda: 0 },
  { name: "Rações (2400 kcal)", stock: 0, minStock: 1, unit: "un/pax", referencia: "", precoVenda: 0 },
  { name: "Água potável", stock: 0, minStock: 1, unit: "lt/pax", referencia: DRINKING_WATER_STOCK_REFERENCE, precoVenda: 0 },
  { name: "Tubo de Identificação", stock: 0, minStock: 1, unit: "un", referencia: "", precoVenda: 0 },
];

export default function Stock() {
  const [articles, setArticles] = useState<ArtigoStock[]>(() => {
    try {
      const stored = localStorage.getItem("articles");
      if (stored && JSON.parse(stored).length > 0) {
        return JSON.parse(stored);
      }
      // Seed automático: artigos do checklist/quadro de inspeção
      let checklistArticles: string[] = [];
      try {
        const { inspectionChecklist } = require("./inspectionChecklist");
        type ChecklistSection = { title?: string; fields?: Array<{ label?: string }> };
        const sections: ChecklistSection[] = Array.isArray(inspectionChecklist) ? inspectionChecklist : [];
        // Extrai todos os labels da seção 'Equipamentos e Artigos'
        const eqSection = sections.find((s) => s.title === "Equipamentos e Artigos");
        if (eqSection) {
          checklistArticles = (eqSection.fields ?? [])
            .map((f) => f.label)
            .filter((label): label is string => Boolean(label));
        }
      } catch {}
      // Adiciona também os DEFAULT_ARTIGOS
      const allArticles = [
        ...DEFAULT_ARTIGOS,
        ...checklistArticles.map((name) => ({ name, stock: 0, minStock: 1, unit: "un", id: uuidv4() }))
      ];
      localStorage.setItem("articles", JSON.stringify(allArticles));
      return allArticles;
    } catch {
      return DEFAULT_ARTIGOS;
    }
  });
  const [form, setForm] = useState<ArtigoStock>({ name: "", descricao: "", stock: 0, minStock: 1, unit: "un" });
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [quickItem, setQuickItem] = useState<ArtigoStock>({ name: "", descricao: "", type: "", code: "", referencia: "", precoVenda: 0, quantity: "", unit: "un", stock: 0, minStock: 1 });
  // Estados de modais de ação (devem estar fora do useState do auditLog)
  const [editModal, setEditModal] = useState<{open: boolean, item?: ArtigoStock}>({open: false});
  const [viewModal, setViewModal] = useState<{open: boolean, item?: ArtigoStock}>({open: false});
  const [auditLog, setAuditLog] = useState<Array<{ action: string; item: ArtigoStock; timestamp: number }>>(() => {
    try {
      return JSON.parse(localStorage.getItem("auditStock") || "[]");
    } catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem("articles", JSON.stringify(articles));
  }, [articles]);

  function addAudit(action: string, item: ArtigoStock) {
    const entry = { action, item, timestamp: Date.now() };
    setAuditLog((prev) => {
      const updated = [...prev, entry];
      localStorage.setItem("auditStock", JSON.stringify(updated));
      return updated;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const resolvedName = (form.name || form.descricao || form.referencia || "Sem nome").trim();
    const newItem = { ...form, name: resolvedName, id: uuidv4() };
    setArticles(prev => {
      const updated = [...prev, newItem];
      // Autosave no backend
      fetch("/api/artigos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newItem),
      });
      return updated;
    });
    addAudit("Adicionado", newItem);
    setForm({ name: "", descricao: "", stock: 0, minStock: 1, unit: "un" });
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === "number" ? Number(value) : value
    }));
  };

  const handleQuickItemChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setQuickItem(prev => ({ ...prev, [name]: type === 'number' ? Number(value) : value }));
  };

  const handleQuickItemSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const resolvedName = (quickItem.name || quickItem.descricao || quickItem.referencia || "Sem nome").trim();
    const newItem: ArtigoStock = {
      id: uuidv4(),
      name: resolvedName,
      descricao: quickItem.descricao,
      type: quickItem.type,
      code: quickItem.code,
      referencia: quickItem.referencia,
      precoVenda: Number(quickItem.precoVenda) || 0,
      quantity: quickItem.quantity,
      unit: quickItem.unit || "un",
      stock: Number(quickItem.stock) || Number(quickItem.quantity) || 0,
      minStock: Number(quickItem.minStock) || 1,
    };
    const updatedArticles = [...articles, newItem];
    setArticles(updatedArticles);
    // Autosave no backend
    fetch("/api/artigos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newItem),
    });
    addAudit("Cadastro rápido", newItem);
    setShowModal(false);
    setQuickItem({ name: "", descricao: "", type: "", code: "", quantity: "", unit: "un", stock: 0, minStock: 1 });
  };

  // Backup/restauração
  const handleBackup = () => {
    const data = { articles, auditLog };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backup_estoque_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data.articles) {
          setArticles(data.articles);
          localStorage.setItem("articles", JSON.stringify(data.articles));
        }
        if (data.auditLog) {
          setAuditLog(data.auditLog);
          localStorage.setItem("auditStock", JSON.stringify(data.auditLog));
        }
      } catch {}
    };
    reader.readAsText(file);
  };

  // Importar CSV
  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const XLSX = await import("xlsx");
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = XLSX.read(ev.target?.result, { type: "binary" });
      const sheet = data.Sheets[data.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      const importedArticles: ArtigoStock[] = rows.map((r) => ({
        id: uuidv4(),
        descricao: String(r.descricao ?? r.Descricao ?? ""),
        name: String(r.name ?? r.Nome ?? r.descricao ?? r.Descricao ?? "Sem nome"),
        type: String(r.type ?? r.Tipo ?? ""),
        code: String(r.code ?? r.Codigo ?? ""),
        referencia: String(r.referencia ?? r.Referencia ?? ""),
        precoVenda: Number(r.precoVenda ?? r.Preco ?? 0) || 0,
        quantity: (r.quantity ?? r.Quantidade ?? "") as number | string,
        unit: String(r.unit ?? r.Unidade ?? "un"),
        stock: Number(r.stock ?? r.Estoque ?? r.quantity ?? r.Quantidade) || 0,
        minStock: Number(r.minStock ?? r.Minimo ?? 1),
      }));
      const updatedArticles = [...articles, ...importedArticles];
      setArticles(updatedArticles);
      localStorage.setItem("articles", JSON.stringify(updatedArticles));
    };
    reader.readAsBinaryString(file);
  };

  // Alerta visual para artigos abaixo do mínimo
  const lowStockArticles = articles.filter(a => a.stock < a.minStock);
  return (
    <div className="max-w-full mx-auto px-2 sm:px-4">
      <h2 className="text-2xl font-bold mb-4">Lista de Itens de Estoque</h2>
      {lowStockArticles.length > 0 && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          <strong>Alerta:</strong> Os seguintes artigos estão abaixo do estoque mínimo:
          <ul className="list-disc ml-6">
            {lowStockArticles.map(a => (
              <li key={a.id || a.name}>{a.name} (Estoque: {a.stock}, Mínimo: {a.minStock})</li>
            ))}
          </ul>
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 mb-4 items-center">
        <input name="descricao" value={form.descricao || ''} onChange={handleChange} placeholder="Descrição do artigo" className="border rounded p-2" />
        <input name="name" value={form.name} onChange={handleChange} placeholder="Nome (opcional)" className="border rounded p-2" />
        <input name="referencia" value={form.referencia || ''} onChange={handleChange} placeholder="Referência" className="border rounded p-2 w-36" />
        <input name="precoVenda" type="number" step="0.01" value={form.precoVenda || 0} onChange={handleChange} placeholder="Preço venda" className="border rounded p-2 w-32" />
        <input name="stock" type="number" value={form.stock} onChange={handleChange} placeholder="Estoque" className="border rounded p-2 w-24" required />
        <input name="minStock" type="number" value={form.minStock} onChange={handleChange} placeholder="Mínimo" className="border rounded p-2 w-24" required />
        <select name="unit" value={form.unit} onChange={handleChange} className="border rounded p-2">
          <option value="un">un</option>
          <option value="lt">lt</option>
          <option value="kit">kit</option>
        </select>
        <button type="submit" className="bg-blue-700 text-white rounded p-2">Adicionar</button>
      </form>
      <h3 className="text-xl font-semibold mb-2">Itens de Estoque</h3>
      <div className="max-h-[70vh] overflow-auto">
        <table className="min-w-full bg-white rounded shadow mb-2 text-xs sm:text-sm">
          <thead>
            <tr className="bg-blue-100">
              <th className="sticky top-0 z-30 bg-blue-100 left-0 border-r border-gray-200 p-2 whitespace-nowrap">Descrição</th>
              <th className="sticky top-0 z-20 bg-blue-100 p-2 whitespace-nowrap">Tipo</th>
              <th className="sticky top-0 z-20 bg-blue-100 p-2 whitespace-nowrap">Código</th>
              <th className="sticky top-0 z-20 bg-blue-100 p-2 whitespace-nowrap">Referência</th>
              <th className="sticky top-0 z-20 bg-blue-100 p-2 whitespace-nowrap">Preço</th>
              <th className="sticky top-0 z-20 bg-blue-100 p-2 whitespace-nowrap">Quantidade</th>
              <th className="sticky top-0 z-20 bg-blue-100 p-2 whitespace-nowrap">Unidade</th>
              <th className="sticky top-0 z-20 bg-blue-100 p-2 whitespace-nowrap">Estoque</th>
              <th className="sticky top-0 z-20 bg-blue-100 p-2 whitespace-nowrap">Mínimo</th>
              <th className="sticky top-0 z-30 bg-blue-100 right-0 border-l border-gray-200 p-2 whitespace-nowrap">Ações</th>
            </tr>
          </thead>
          <tbody>
            {articles.filter(i =>
              (!filterType || i.type === filterType) &&
              (!search ||
                i.name.toLowerCase().includes(search.toLowerCase()) ||
                (i.descricao && i.descricao.toLowerCase().includes(search.toLowerCase())) ||
                (i.type && i.type.toLowerCase().includes(search.toLowerCase())) ||
                (i.code && i.code.toLowerCase().includes(search.toLowerCase()))
              )
            ).map((i) => (
              <tr key={i.id} className="border-t bg-white align-top hover:bg-slate-50">
                <td className="sticky left-0 z-10 bg-inherit border-r border-gray-200 p-2 whitespace-nowrap">{i.descricao || i.name}</td>
                <td className="p-2 whitespace-nowrap">{i.type}</td>
                <td className="p-2 whitespace-nowrap">{i.code}</td>
                <td className="p-2 whitespace-nowrap">{i.referencia || ""}</td>
                <td className="p-2 whitespace-nowrap">{i.precoVenda ? Number(i.precoVenda).toFixed(2) : ''}</td>
                <td className="p-2 whitespace-nowrap">{i.quantity}</td>
                <td className="p-2 whitespace-nowrap">{i.unit}</td>
                <td className="p-2 whitespace-nowrap">{i.stock}</td>
                <td className="p-2 whitespace-nowrap">{i.minStock}</td>
                <td className="sticky right-0 z-10 bg-inherit border-l border-gray-200 p-2 whitespace-nowrap">
                  <div className="flex gap-1">
                    <button className="bg-blue-500 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs" title="Visualizar" onClick={() => setViewModal({open:true, item:i})}>👁️</button>
                    <button className="bg-yellow-500 hover:bg-yellow-600 text-white px-2 py-1 rounded text-xs" title="Editar" onClick={() => setEditModal({open:true, item:i})}>✏️</button>
                    <button className="bg-red-500 hover:bg-red-700 text-white px-2 py-1 rounded text-xs" title="Excluir" onClick={() => {
                      if(window.confirm('Confirma exclusão?')) {
                        setArticles(prev => prev.filter(a => a.id !== i.id));
                        addAudit('Excluído', i);
                        fetch(`/api/artigos/${i.id}`, {method:'DELETE'});
                      }
                    }}>🗑️</button>
                    <button className="bg-green-500 hover:bg-green-700 text-white px-2 py-1 rounded text-xs" title="Exportar" onClick={() => {
                      const blob = new Blob([JSON.stringify(i, null, 2)], {type:'application/json'});
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `artigo_${i.id}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}>⬇️</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        className="bg-blue-600 text-white px-4 py-2 rounded mb-4"
        onClick={() => setShowModal(true)}
      >
        Cadastro rápido
      </button>
      {showModal && (
        <>
              {/* Modal de Visualizar */}
              {viewModal.open && viewModal.item && (
                <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
                  <div className="bg-white p-6 rounded shadow-lg w-full max-w-md">
                    <h3 className="text-lg font-bold mb-4">Detalhes do Artigo</h3>
                    <ul className="mb-4">
                      <li><b>Nome:</b> {viewModal.item.name}</li>
                      <li><b>Descrição:</b> {viewModal.item.descricao || '-'}</li>
                      <li><b>Tipo:</b> {viewModal.item.type}</li>
                      <li><b>Código:</b> {viewModal.item.code}</li>
                      <li><b>Quantidade:</b> {viewModal.item.quantity}</li>
                      <li><b>Unidade:</b> {viewModal.item.unit}</li>
                      <li><b>Estoque:</b> {viewModal.item.stock}</li>
                      <li><b>Mínimo:</b> {viewModal.item.minStock}</li>
                    </ul>
                    <div className="flex gap-2 justify-end">
                      <button className="px-4 py-2 bg-gray-300 rounded" onClick={() => setViewModal({open:false})}>Fechar</button>
                    </div>
                  </div>
                </div>
              )}
              {/* Modal de Editar */}
              {editModal.open && editModal.item && (
                <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
                  <div className="bg-white p-6 rounded shadow-lg w-full max-w-md">
                    <h3 className="text-lg font-bold mb-4">Editar Artigo</h3>
                    <form onSubmit={e => {
                      e.preventDefault();
                      if (!editModal.item) return;
                      const updatedItem: ArtigoStock = {
                        ...editModal.item,
                        name: (editModal.item.name || editModal.item.descricao || editModal.item.referencia || "Sem nome").trim(),
                        type: editModal.item.type ?? "",
                        code: editModal.item.code ?? "",
                        quantity: editModal.item.quantity ?? "",
                        unit: editModal.item.unit ?? "un",
                        stock: Number(editModal.item.stock) || 0,
                        minStock: Number(editModal.item.minStock) || 1
                      };
                      setArticles(prev => prev.map(a => a.id === updatedItem.id ? updatedItem : a));
                      addAudit('Editado', updatedItem);
                      fetch(`/api/artigos/${updatedItem.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(updatedItem),
                      });
                      setEditModal({open:false});
                    }} className="space-y-3">
                      <input name="descricao" value={editModal.item.descricao || ''} onChange={e => setEditModal(m => ({...m, item: {...m.item!, descricao: e.target.value}}))} className="border rounded px-2 py-1 w-full" placeholder="Descrição" />
                      <input name="name" value={editModal.item.name} onChange={e => setEditModal(m => ({...m, item: {...m.item!, name: e.target.value}}))} className="border rounded px-2 py-1 w-full" placeholder="Nome (opcional)" />
                      <input name="type" value={editModal.item.type || ''} onChange={e => setEditModal(m => ({...m, item: {...m.item!, type: e.target.value}}))} className="border rounded px-2 py-1 w-full" placeholder="Tipo" />
                      <input name="code" value={editModal.item.code || ''} onChange={e => setEditModal(m => ({...m, item: {...m.item!, code: e.target.value}}))} className="border rounded px-2 py-1 w-full" placeholder="Código" />
                      <input name="quantity" type="number" value={editModal.item.quantity || ''} onChange={e => setEditModal(m => ({...m, item: {...m.item!, quantity: e.target.value}}))} className="border rounded px-2 py-1 w-full" placeholder="Quantidade" />
                      <select name="unit" value={editModal.item.unit || 'un'} onChange={e => setEditModal(m => ({...m, item: {...m.item!, unit: e.target.value}}))} className="border rounded px-2 py-1 w-full">
                        <option value="un">un</option>
                        <option value="lt">lt</option>
                        <option value="kit">kit</option>
                      </select>
                      <input name="stock" type="number" value={editModal.item.stock} onChange={e => setEditModal(m => ({...m, item: {...m.item!, stock: Number(e.target.value)}}))} className="border rounded px-2 py-1 w-full" placeholder="Estoque" />
                      <input name="minStock" type="number" value={editModal.item.minStock} onChange={e => setEditModal(m => ({...m, item: {...m.item!, minStock: Number(e.target.value)}}))} className="border rounded px-2 py-1 w-full" placeholder="Mínimo" />
                      <div className="flex gap-2 justify-end">
                        <button type="button" className="px-4 py-2 bg-gray-300 rounded" onClick={() => setEditModal({open:false})}>Cancelar</button>
                        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Salvar</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded shadow-lg w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">Cadastro rápido de Item de Estoque</h3>
            <form onSubmit={handleQuickItemSubmit} className="space-y-3">
              <input
                name="descricao"
                value={quickItem.descricao || ''}
                onChange={handleQuickItemChange}
                placeholder="Descrição do item"
                className="border rounded px-2 py-1 w-full"
              />
              <input
                name="name"
                value={quickItem.name}
                onChange={handleQuickItemChange}
                placeholder="Nome (opcional)"
                className="border rounded px-2 py-1 w-full"
              />
              <select
                name="type"
                value={quickItem.type}
                onChange={handleQuickItemChange}
                className="border rounded px-2 py-1 w-full"
              >
                <option value="">Tipo (opcional)</option>
                {Array.from(new Set(articles.map(i => i.type).filter(Boolean))).map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              <input
                name="code"
                value={quickItem.code}
                onChange={handleQuickItemChange}
                placeholder="Código (opcional)"
                className="border rounded px-2 py-1 w-full"
              />
              <input
                name="referencia"
                value={quickItem.referencia}
                onChange={handleQuickItemChange}
                placeholder="Referência (opcional)"
                className="border rounded px-2 py-1 w-full"
              />
              <input
                name="precoVenda"
                type="number"
                step="0.01"
                value={quickItem.precoVenda}
                onChange={handleQuickItemChange}
                placeholder="Preço venda (opcional)"
                className="border rounded px-2 py-1 w-full"
              />
              <input
                name="quantity"
                type="number"
                value={quickItem.quantity}
                onChange={handleQuickItemChange}
                placeholder="Quantidade (opcional)"
                className="border rounded px-2 py-1 w-full"
              />
              <select
                name="unit"
                value={quickItem.unit}
                onChange={handleQuickItemChange}
                className="border rounded px-2 py-1 w-full"
              >
                <option value="un">un</option>
                <option value="lt">lt</option>
                <option value="kit">kit</option>
              </select>
              <input
                name="stock"
                type="number"
                value={quickItem.stock}
                onChange={handleQuickItemChange}
                placeholder="Estoque (opcional)"
                className="border rounded px-2 py-1 w-full"
              />
              <input
                name="minStock"
                type="number"
                value={quickItem.minStock}
                onChange={handleQuickItemChange}
                placeholder="Mínimo (opcional)"
                className="border rounded px-2 py-1 w-full"
              />
              <div className="flex gap-2 justify-end">
                <button type="button" className="px-4 py-2 bg-gray-300 rounded" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Salvar</button>
              </div>
            </form>
          </div>
        </div>
        </>
      )}
      <div className="mt-8">
        <h3 className="text-lg font-bold mb-2">Histórico de alterações</h3>
        <ul className="bg-gray-50 rounded p-2 max-h-48 overflow-auto text-xs">
          {auditLog.map((entry, idx) => (
            <li key={idx} className="mb-1">
              <span className="font-semibold">{entry.action}</span> - {entry.item.name} em {new Date(entry.timestamp).toLocaleString()}
            </li>
          ))}
          {auditLog.length === 0 && <li className="text-gray-400">Nenhuma alteração registrada.</li>}
        </ul>
      </div>
      <div className="flex gap-2 mb-4">
        <button className="bg-green-600 text-white px-3 py-1 rounded" onClick={handleBackup}>Backup</button>
        <label className="bg-yellow-500 text-white px-3 py-1 rounded cursor-pointer">
          Restaurar
          <input type="file" accept="application/json" className="hidden" onChange={handleRestore} />
        </label>
        <label className="bg-blue-600 text-white px-3 py-1 rounded cursor-pointer">
          Importar CSV
          <input type="file" accept=".csv,.xlsx" className="hidden" onChange={handleImportCSV} />
        </label>
      </div>
    </div>
  );
}
