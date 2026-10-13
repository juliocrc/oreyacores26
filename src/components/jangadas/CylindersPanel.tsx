"use client";
import React from "react";
import { Cylinder } from "lucide-react";
import { fmtPeso } from "@/lib/liferaft-diagram-helpers";

export type CylinderRow = {
  serial?: string;
  sistema?: string;
  co2?: string | number;
  n2?: string | number;
  tara?: string | number;
  pesoBruto?: string | number;
  dataTeste?: string;
  dataProxTeste?: string;
};

function fmtMonth(v?: string): string {
  if (!v) return "—";
  const m = String(v).match(/^(\d{4})-(\d{2})/);
  return m ? `${m[2]}/${m[1]}` : String(v);
}

export function parseCylindersJson(raw: unknown): CylinderRow[] {
  if (Array.isArray(raw)) return raw as CylinderRow[];
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as CylinderRow[];
    } catch {
      /* ignore */
    }
  }
  return [];
}

export default function CylindersPanel({
  cylinders,
  fallback,
  unidade = "kg",
}: {
  cylinders: CylinderRow[];
  fallback?: CylinderRow;
  unidade?: string;
}) {
  const rows = cylinders.length ? cylinders : fallback && fallback.serial ? [fallback] : [];
  if (rows.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Cylinder size={14} className="text-indigo-500" />
          Cilindros Instalados
        </span>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
          {rows.length} {rows.length === 1 ? "cilindro" : "cilindros"}
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wide">
              <th className="px-2.5 py-2 text-left font-bold">Nº Série</th>
              <th className="px-2.5 py-2 text-right font-bold">CO₂</th>
              <th className="px-2.5 py-2 text-right font-bold">N₂</th>
              <th className="px-2.5 py-2 text-right font-bold">Tara</th>
              <th className="px-2.5 py-2 text-right font-bold">Peso Bruto</th>
              <th className="px-2.5 py-2 text-center font-bold">Teste Hid.</th>
              <th className="px-2.5 py-2 text-center font-bold">Próx. Teste</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c, i) => (
              <tr key={`${c.serial || i}`} className="border-t border-slate-100 hover:bg-indigo-50/40">
                <td className="px-2.5 py-2 font-mono font-bold text-slate-700">{c.serial || "—"}</td>
                <td className="px-2.5 py-2 text-right text-slate-700">{c.co2 ? fmtPeso(c.co2, ` ${unidade}`) : "—"}</td>
                <td className="px-2.5 py-2 text-right text-slate-700">{c.n2 ? fmtPeso(c.n2, ` ${unidade}`) : "—"}</td>
                <td className="px-2.5 py-2 text-right text-slate-700">{c.tara ? fmtPeso(c.tara, ` ${unidade}`) : "—"}</td>
                <td className="px-2.5 py-2 text-right font-semibold text-slate-800">{c.pesoBruto ? fmtPeso(c.pesoBruto, ` ${unidade}`) : "—"}</td>
                <td className="px-2.5 py-2 text-center text-slate-600">{fmtMonth(c.dataTeste)}</td>
                <td className="px-2.5 py-2 text-center text-slate-600">{fmtMonth(c.dataProxTeste)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
