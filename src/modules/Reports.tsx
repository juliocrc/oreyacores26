"use client";
import { useEffect, useState, useCallback } from "react";


type InspecaoResumo = {
  id: number;
  navioNome?: string;
  marca?: string;
  modelo?: string;
  serial?: string;
  dataInspecao?: string;
  responsavel?: string;
  artigos?: Array<{ name: string; quantidade: number; referencia?: string }>;
};

type Navio = {
  id: number;
  nome: string;
};

export default function Reports() {
  const [inspecoes, setInspecoes] = useState<InspecaoResumo[]>([]);
  const [navios, setNavios] = useState<Navio[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({
    start: "",
    end: "",
    ship: "",
    brand: "",
  });

  // Carregar dados da API (em vez de localStorage)
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [inspecoesRes, naviosRes] = await Promise.all([
        fetch("/api/inspecoes"),
        fetch("/api/navios"),
      ]);

      if (inspecoesRes.ok) {
        const data = await inspecoesRes.json();
        setInspecoes(Array.isArray(data) ? data : []);
      }
      if (naviosRes.ok) {
        const data = await naviosRes.json();
        setNavios(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error("Erro ao carregar dados para relatórios:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Avoid calling setState synchronously inside effect body (react-hooks/set-state-in-effect)
    const t = setTimeout(() => {
      void fetchData();
    }, 0);
    return () => clearTimeout(t);
  }, [fetchData]);

  // Filtro
  const filtered = inspecoes.filter((insp) => {
    const data = insp.dataInspecao || "";
    const afterStart = !filter.start || data >= filter.start;
    const beforeEnd = !filter.end || data <= filter.end;
    const byShip = !filter.ship || String(insp.navioNome ?? "").toLowerCase().includes(String(filter.ship ?? "").toLowerCase());
    const byBrand = !filter.brand || String(insp.marca ?? "").toLowerCase().includes(String(filter.brand ?? "").toLowerCase());
    return afterStart && beforeEnd && byShip && byBrand;
  });

  // Consumo de artigos
  const artigosConsumo: Record<string, { total: number; jangadas: number }> = {};
  filtered.forEach((insp) => {
    (insp.artigos || []).forEach((a) => {
      if (!artigosConsumo[a.name]) artigosConsumo[a.name] = { total: 0, jangadas: 0 };
      artigosConsumo[a.name].total += Number(a.quantidade || 0);
      artigosConsumo[a.name].jangadas += 1;
    });
  });

  async function exportarPDF() {
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Relatório de Consumo de Artigos", 14, 18);
    doc.setFontSize(11);
    doc.text(`Período: ${filter.start || '-'} a ${filter.end || '-'}`, 14, 28);
    doc.text(`Navio: ${filter.ship || 'Todos'}`, 14, 34);
    doc.text(`Marca: ${filter.brand || 'Todas'}`, 14, 40);
    doc.text(`Total inspeções no período: ${filtered.length}`, 14, 46);
    autoTable(doc, {
      head: [["Artigo", "Total Consumido", "Jangadas"]],
      body: Object.entries(artigosConsumo)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([nome, info]) => [nome, info.total, info.jangadas]),
      startY: 54,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [41, 128, 185] },
    });
    doc.save("relatorio_consumo_artigos.pdf");
  }

  const marcasUnicas = [...new Set(inspecoes.map(i => i.marca).filter(Boolean))];

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Relatório de Consumo de Artigos</h1>

      <div className="flex flex-wrap gap-3 mb-4">
        <label className="flex flex-col text-xs">Início
          <input type="date" value={filter.start} onChange={e => setFilter(f => ({ ...f, start: e.target.value }))} className="border rounded p-1" />
        </label>
        <label className="flex flex-col text-xs">Fim
          <input type="date" value={filter.end} onChange={e => setFilter(f => ({ ...f, end: e.target.value }))} className="border rounded p-1" />
        </label>
        <label className="flex flex-col text-xs">Navio
          <select value={filter.ship} onChange={e => setFilter(f => ({ ...f, ship: e.target.value }))} className="border rounded p-1">
            <option value="">Todos</option>
            {navios.map((s) => <option key={s.id} value={s.nome}>{s.nome}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-xs">Marca
          <select value={filter.brand} onChange={e => setFilter(f => ({ ...f, brand: e.target.value }))} className="border rounded p-1">
            <option value="">Todas</option>
            {marcasUnicas.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <button className="bg-blue-600 text-white px-3 py-1 rounded text-xs self-end hover:bg-blue-700 transition-colors" onClick={exportarPDF}>
          Exportar PDF
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-blue-700">{filtered.length}</div>
          <div className="text-xs text-blue-600">Inspeções no Período</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-700">{Object.keys(artigosConsumo).length}</div>
          <div className="text-xs text-green-600">Artigos Distintos</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-amber-700">
            {Object.values(artigosConsumo).reduce((sum, info) => sum + info.total, 0)}
          </div>
          <div className="text-xs text-amber-600">Total Consumido</div>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-8">A carregar dados da base de dados...</div>
      ) : (
        <table className="min-w-full text-xs border mb-4">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 text-left">Artigo</th>
              <th className="p-2 text-right">Total Consumido</th>
              <th className="p-2 text-right">Jangadas</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(artigosConsumo)
              .sort((a, b) => b[1].total - a[1].total)
              .map(([nome, info]) => (
              <tr key={nome} className="border-t hover:bg-gray-50">
                <td className="p-2">{nome}</td>
                <td className="p-2 text-right font-mono">{info.total}</td>
                <td className="p-2 text-right font-mono">{info.jangadas}</td>
              </tr>
            ))}
            {Object.keys(artigosConsumo).length === 0 && (
              <tr><td colSpan={3} className="text-center text-gray-400 p-2">Nenhum consumo encontrado.</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
