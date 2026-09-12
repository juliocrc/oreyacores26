"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, Droplets, UtensilsCrossed, Package, Ship, Calendar, Flame, Printer, RadioTower, Waves } from "lucide-react";
import { formatValidityDisplay } from "@/lib/date-display";

type ValidityItem = {
  id: number;
  name?: string;
  quantidade?: number;
  validade?: string;
  serial?: string;
  marca?: string;
  modelo?: string;
  descricao?: string;
  referencia?: string;
  dataProxInspecao?: string;
  Jangada?: { serial: string; brand: string; model: string };
  navio?: { nome: string };
};

export default function RelatorioValidadesPage() {
  const [data, setData] = useState<{
    agua: ValidityItem[]; racoes: ValidityItem[]; coletes: ValidityItem[]; stock: ValidityItem[]; extintores: ValidityItem[]; epirbs: ValidityItem[]; fatos: ValidityItem[]; totais: Record<string, number>
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/relatorio-validades").then((r) => r.ok ? r.json() : null).then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-center text-slate-500">A carregar...</div>;

  const sections = [
    { key: "agua", icon: <Droplets size={16} />, label: "Água", color: "text-cyan-700 bg-cyan-50 border-cyan-200" },
    { key: "racoes", icon: <UtensilsCrossed size={16} />, label: "Rações", color: "text-amber-700 bg-amber-50 border-amber-200" },
    { key: "coletes", icon: <Ship size={16} />, label: "Coletes", color: "text-indigo-700 bg-indigo-50 border-indigo-200" },
    { key: "stock", icon: <Package size={16} />, label: "Stock", color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
    { key: "extintores", icon: <Flame size={16} />, label: "Extintores", color: "text-orange-700 bg-orange-50 border-orange-200" },
    { key: "epirbs", icon: <RadioTower size={16} />, label: "EPIRBs", color: "text-violet-700 bg-violet-50 border-violet-200" },
    { key: "fatos", icon: <Waves size={16} />, label: "Fatos de Imersão", color: "text-sky-700 bg-sky-50 border-sky-200" },
  ];

  const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const handleExportPdf = () => {
    const d = data;
    if (!d) return;
    const win = window.open("", "_blank", "width=900,height=1200");
    if (!win) return;

    const renderRow = (item: ValidityItem) => {
      const desc = item.name || item.descricao || `${item.marca || ""} ${item.modelo || ""}`.trim();
      const detail = [
        item.descricao && item.descricao !== item.name ? item.descricao : null,
        item.Jangada ? `${item.Jangada.brand} ${item.Jangada.model} (${item.Jangada.serial})` : null,
        item.navio?.nome ? `Navio: ${item.navio.nome}` : null,
        item.serial ? `Série: ${item.serial}` : null,
        item.referencia ? `Ref: ${item.referencia}` : null,
      ].filter(Boolean).join(" · ");
      return `<tr>
        <td>${esc(desc)}</td>
        <td>${esc(detail)}</td>
        <td class="c">${item.quantidade != null ? item.quantidade : "-"}</td>
        <td class="c">${esc(formatValidityDisplay(item.validade || item.dataProxInspecao))}</td>
      </tr>`;
    };

    const sectionsHtml = sections.map((s) => {
      const items = (d as unknown as Record<string, ValidityItem[] | undefined>)[s.key] || [];
      if (!items.length) return "";
      return `<div class="section">${s.label} — ${items.length} a expirar</div>
      <table>
        <thead><tr><th>Artigo</th><th>Detalhe</th><th class="c">Qtd</th><th class="c">Validade</th></tr></thead>
        <tbody>${items.map(renderRow).join("")}</tbody>
      </table>`;
    }).join("");

    const totalCount = sections.reduce((acc, s) => acc + (((d as unknown as Record<string, ValidityItem[] | undefined>)[s.key])?.length || 0), 0);
    const generated = new Date().toLocaleDateString("pt-PT") + " " + new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });

    win.document.write(`<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8" />
<title>Relatório de Validades</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Calibri, Arial, sans-serif; color: #1e293b; margin: 0; padding: 32px; font-size: 13px; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #1a3c6e; padding-bottom: 12px; margin-bottom: 18px; }
  .title { font-size: 20px; font-weight: bold; color: #1a3c6e; }
  .brand { font-size: 11px; color: #64748b; text-align: right; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th { background: #1a3c6e; color: #fff; padding: 7px 8px; text-align: left; font-size: 12px; }
  td { padding: 6px 8px; border-bottom: 1px solid #d0d5dd; }
  .c { text-align: center; }
  .section { font-weight: bold; color: #1a3c6e; margin-top: 18px; font-size: 13px; }
  .meta { margin-top: 4px; font-size: 11px; color: #64748b; }
  .footer { margin-top: 28px; font-size: 9px; color: #64748b; text-align: center; border-top: 1px solid #d0d5dd; padding-top: 8px; }
  @media print { body { padding: 16px; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">RELATÓRIO DE VALIDADES A EXPIRAR</div>
      <div class="meta">Próximos 30 dias · Gerado a ${esc(generated)} · ${totalCount} artigo(s)</div>
    </div>
    <div class="brand">Orey Técnica Açores, Lda.<br />Sistema de Gestão Orey</div>
  </div>

  ${sectionsHtml || '<p style="color:#64748b">Nenhum artigo a expirar nos próximos 30 dias.</p>'}

  <div class="footer">
    Orey Técnica - Serviços Navais, Lda.<br />
    Sede: Rua dos Caniços, nº 36, 2625-253 Vialonga | Tel: +351 213 610 890 | E-mail: orey-tecnica@orey.com<br />
    Delegação Açores: Zona Industrial dos Portões Vermelhos, Armazém 19, 9560-350 Cabouco | Tel: +351 296 929 314 | E-mail: azores.tecnica@orey.com<br />
    Documento gerado automaticamente pelo Sistema de Gestão Orey.
  </div>

  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`);
    win.document.close();
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="mx-auto max-w-5xl px-4 space-y-6">
        <div className="flex items-center gap-3">
          <AlertTriangle className="text-amber-500" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Validades a expirar</h1>
            <p className="text-sm text-slate-500">Artigos com validade nos próximos 30 dias</p>
          </div>
          <button
            onClick={handleExportPdf}
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
          >
            <Printer size={16} />
            Exportar PDF
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {sections.map((s) => (
            <div key={s.key} className={`rounded-xl border p-4 ${s.color}`}>
              <div className="flex items-center gap-2 text-sm font-semibold">{s.icon}{s.label}</div>
              <p className="mt-1 text-2xl font-bold">{data?.totais[s.key] ?? 0}</p>
            </div>
          ))}
        </div>

        {sections.map((s) => {
          const items = data?.[s.key as keyof typeof data] as ValidityItem[] | undefined;
          if (!items?.length) return null;
          return (
            <div key={s.key} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className={`px-4 py-3 border-b font-semibold text-sm flex items-center gap-2 ${s.color}`}>
                {s.icon}{s.label} · {items.length} a expirar
              </div>
              <div className="divide-y divide-slate-100 text-sm">
                {items.map((item, i) => (
                  <div key={item.id ?? i} className="px-4 py-3 flex justify-between items-center">
                    <div>
                      <p className="font-medium text-slate-800">
                        {item.name || item.descricao || `${item.marca} ${item.modelo}`}
                      </p>
                      <p className="text-xs text-slate-400">
                        {item.descricao && <span className="font-medium text-slate-500">{item.descricao} · </span>}
                        {item.Jangada && `${item.Jangada.brand} ${item.Jangada.model} (${item.Jangada.serial})`}
                        {item.navio?.nome && `Navio: ${item.navio.nome}`}
                        {item.serial && `Série: ${item.serial}`}
                        {item.referencia && `Ref: ${item.referencia}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Calendar size={12} className="text-slate-400" />
                      <span className="font-semibold text-red-600">
                        {formatValidityDisplay(item.validade || item.dataProxInspecao)}
                      </span>
                      {item.quantidade != null && <span className="text-slate-500">Qtd: {item.quantidade}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {(!data?.agua?.length && !data?.racoes?.length && !data?.coletes?.length && !data?.stock?.length && !data?.extintores?.length && !data?.epirbs?.length && !data?.fatos?.length) && (
          <div className="text-center py-16 text-slate-400">
            <Calendar size={40} className="mx-auto mb-3" />
            <p className="font-semibold text-slate-600">Nenhum artigo a expirar nos próximos 30 dias</p>
          </div>
        )}
      </div>
    </div>
  );
}
