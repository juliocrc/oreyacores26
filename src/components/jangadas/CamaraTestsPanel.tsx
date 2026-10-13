"use client";
import React from "react";
import { Gauge } from "lucide-react";

export type CamaraRow = {
  label?: string;
  inicio?: string;
  fim?: string;
  abertura?: string;
  reset?: string;
  valido?: string;
};

export type TesteCamaras = {
  unidade?: string;
  tubes?: CamaraRow[];
  arcos?: CamaraRow[];
  overpressure?: {
    tubes?: CamaraRow[];
    arcos?: CamaraRow[];
    superior?: CamaraRow;
    inferior?: CamaraRow;
  };
};

export function parseTesteCamarasJson(raw: unknown): TesteCamaras | null {
  let obj: unknown = raw;
  if (typeof raw === "string" && raw.trim()) {
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== "object") return null;
  const t = obj as TesteCamaras;
  if (!t.tubes && !t.arcos && !t.overpressure) return null;
  return t;
}

function dropPercent(row: CamaraRow): number | null {
  const i = Number(String(row.inicio ?? "").replace(",", "."));
  const f = Number(String(row.fim ?? "").replace(",", "."));
  if (!isFinite(i) || !isFinite(f) || i === 0) return null;
  return ((i - f) / i) * 100;
}

function WpTable({ title, rows, unidade }: { title: string; rows: CamaraRow[]; unidade: string }) {
  const active = rows.filter((r) => String(r.inicio ?? "") !== "" || String(r.fim ?? "") !== "");
  if (active.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <span className="text-[11px] font-black uppercase tracking-wider text-indigo-600">{title}</span>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wide">
              <th className="px-2.5 py-1.5 text-left font-bold">Câmara</th>
              <th className="px-2.5 py-1.5 text-right font-bold">Início</th>
              <th className="px-2.5 py-1.5 text-right font-bold">Fim</th>
              <th className="px-2.5 py-1.5 text-right font-bold">Queda</th>
              <th className="px-2.5 py-1.5 text-right font-bold">%</th>
            </tr>
          </thead>
          <tbody>
            {active.map((r, i) => {
              const pct = dropPercent(r);
              const fail = pct !== null && pct > 5;
              return (
                <tr key={`${r.label || i}`} className="border-t border-slate-100">
                  <td className="px-2.5 py-1.5 font-bold text-slate-700">{r.label || "—"}</td>
                  <td className="px-2.5 py-1.5 text-right text-slate-700">{r.inicio || "—"}</td>
                  <td className="px-2.5 py-1.5 text-right text-slate-700">{r.fim || "—"}</td>
                  <td className="px-2.5 py-1.5 text-right text-slate-700">
                    {String(r.inicio ?? "") !== "" && String(r.fim ?? "") !== ""
                      ? `${(Number(String(r.inicio).replace(",", ".")) - Number(String(r.fim).replace(",", "."))).toFixed(0)} ${unidade}`
                      : "—"}
                  </td>
                  <td className={`px-2.5 py-1.5 text-right font-bold ${fail ? "text-rose-600" : "text-slate-700"}`}>
                    {pct !== null ? `${pct.toFixed(1)}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReliefTable({ title, rows, unidade }: { title: string; rows: CamaraRow[]; unidade: string }) {
  const active = rows.filter((r) => String(r.abertura ?? "") !== "" || String(r.reset ?? "") !== "");
  if (active.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <span className="text-[11px] font-black uppercase tracking-wider text-indigo-600">{title}</span>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wide">
              <th className="px-2.5 py-1.5 text-left font-bold">Câmara</th>
              <th className="px-2.5 py-1.5 text-right font-bold">Abertura ({unidade})</th>
              <th className="px-2.5 py-1.5 text-right font-bold">Reset ({unidade})</th>
            </tr>
          </thead>
          <tbody>
            {active.map((r, i) => (
              <tr key={`${r.label || i}`} className="border-t border-slate-100">
                <td className="px-2.5 py-1.5 font-bold text-slate-700">{r.label || "—"}</td>
                <td className="px-2.5 py-1.5 text-right text-slate-700">{r.abertura || "—"}</td>
                <td className="px-2.5 py-1.5 text-right text-slate-700">{r.reset || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CamaraTestsPanel({ data }: { data: TesteCamaras | null }) {
  if (!data) return null;
  const unidade = data.unidade || "hpa";
  const op = data.overpressure;
  const hasWp = (data.tubes?.length ?? 0) > 0 || (data.arcos?.length ?? 0) > 0;
  const hasOp =
    (op?.tubes?.length ?? 0) > 0 || (op?.arcos?.length ?? 0) > 0 || !!op?.superior || !!op?.inferior;

  if (!hasWp && !hasOp) return null;

  return (
    <div id="wp-camaras-arcos" className="border border-slate-200 rounded-2xl p-5 space-y-5 bg-slate-50/50 scroll-mt-24">
      <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5 pb-2 border-b border-slate-200/60">
        <Gauge size={16} className="text-indigo-500" />
        Testes por Câmara / Arco
        <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
          {unidade}
        </span>
      </h3>

      {hasWp && (
        <div className="space-y-4">
          <span className="block text-xs font-black uppercase tracking-wider text-slate-500">
            Teste de Pressão de Trabalho (WP)
          </span>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <WpTable title="Câmaras (tubes)" rows={data.tubes || []} unidade={unidade} />
            <WpTable title="Arcos (arcos)" rows={data.arcos || []} unidade={unidade} />
          </div>
        </div>
      )}

      {hasOp && (
        <div className="space-y-4 border-t border-slate-200/60 pt-4">
          <span className="block text-xs font-black uppercase tracking-wider text-slate-500">
            Válvulas de Alívio / Overpressure
          </span>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ReliefTable title="Câmaras (tubes)" rows={op?.tubes || []} unidade={unidade} />
            <ReliefTable title="Arcos (arcos)" rows={op?.arcos || []} unidade={unidade} />
          </div>
          {(op?.superior || op?.inferior) && (
            <div className="grid grid-cols-2 gap-4">
              {op?.superior && (
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-450">Câmara Superior</span>
                  <div className="mt-1 flex justify-between text-xs">
                    <span className="text-slate-500">Abertura</span>
                    <span className="font-bold text-slate-800">{op.superior.abertura || "—"} {unidade}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Reset</span>
                    <span className="font-bold text-slate-800">{op.superior.reset || "—"} {unidade}</span>
                  </div>
                </div>
              )}
              {op?.inferior && (
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-450">Câmara Inferior</span>
                  <div className="mt-1 flex justify-between text-xs">
                    <span className="text-slate-500">Abertura</span>
                    <span className="font-bold text-slate-800">{op.inferior.abertura || "—"} {unidade}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Reset</span>
                    <span className="font-bold text-slate-800">{op.inferior.reset || "—"} {unidade}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
