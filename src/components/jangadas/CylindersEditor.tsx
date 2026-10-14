"use client";
import React from "react";
import { Cylinder, Plus, Trash2 } from "lucide-react";
import type { CylinderRow } from "./CylindersPanel";

const inputCls =
  "w-full border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none";

function addYears(v?: string): string {
  if (!v) return "";
  const parts = String(v).split("-");
  if (parts[0] && parts[0].length === 4) {
    const year = parseInt(parts[0], 10) + 5;
    const month = parts[1] || "01";
    const day = parts[2];
    return day ? `${year}-${month}-${day}` : `${year}-${month}`;
  }
  return v;
}

export default function CylindersEditor({
  cylinders,
  onChange,
}: {
  cylinders: CylinderRow[];
  onChange: (rows: CylinderRow[]) => void;
}) {
  const rows = cylinders || [];

  const update = (index: number, field: keyof CylinderRow, value: string) => {
    const next = rows.map((row, i) => {
      if (i !== index) return row;
      const updated: CylinderRow = { ...row, [field]: value };
      if (field === "dataTeste" && value) updated.dataProxTeste = addYears(value);
      return updated;
    });
    onChange(next);
  };

  const addRow = () =>
    onChange([
      ...rows,
      { serial: "", co2: "", n2: "", tara: "", pesoBruto: "", dataTeste: "", dataProxTeste: "" },
    ]);

  const removeRow = (index: number) => onChange(rows.filter((_, i) => i !== index));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Cylinder size={14} className="text-indigo-500" />
          Cilindros Instalados
        </span>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
          {rows.length} {rows.length === 1 ? "cilindro" : "cilindros"}
        </span>
      </div>

      {rows.map((c, i) => (
        <div key={i} className="rounded-2xl border border-slate-200 p-3 space-y-3 bg-slate-50/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">Cilindro {i + 1}</span>
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:text-rose-700"
            >
              <Trash2 size={13} /> Remover
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <label className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Nº de Série</span>
              <input className={`${inputCls} font-mono`} value={c.serial || ""} onChange={(e) => update(i, "serial", e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tara (kg)</span>
              <input type="number" step="0.001" className={inputCls} value={c.tara ?? ""} onChange={(e) => update(i, "tara", e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Peso Bruto (kg)</span>
              <input type="number" step="0.001" className={inputCls} value={c.pesoBruto ?? ""} onChange={(e) => update(i, "pesoBruto", e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Gás CO₂ (kg)</span>
              <input type="number" step="0.001" className={inputCls} value={c.co2 ?? ""} onChange={(e) => update(i, "co2", e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Gás N₂ (kg)</span>
              <input type="number" step="0.001" className={inputCls} value={c.n2 ?? ""} onChange={(e) => update(i, "n2", e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sistema</span>
              <input className={inputCls} value={c.sistema || ""} onChange={(e) => update(i, "sistema", e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Teste Hidráulico</span>
              <input type="month" className={inputCls} value={c.dataTeste ? String(c.dataTeste).slice(0, 7) : ""} onChange={(e) => update(i, "dataTeste", e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Próximo Teste</span>
              <input type="month" className={inputCls} value={c.dataProxTeste ? String(c.dataProxTeste).slice(0, 7) : ""} onChange={(e) => update(i, "dataProxTeste", e.target.value)} />
            </label>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100"
      >
        <Plus size={15} /> Adicionar cilindro
      </button>
    </div>
  );
}
