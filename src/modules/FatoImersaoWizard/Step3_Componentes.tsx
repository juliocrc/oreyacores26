"use client";

import React, { useEffect } from "react";
import { ArrowLeft, ChevronRight, Package } from "lucide-react";
import { useFatoImersaoWizardStore } from "./store/useFatoImersaoWizardStore";
import { toStorageValidade, toDisplayValidade } from "@/lib/fato-date-utils";

type Props = { onNext: () => void; onPrev: () => void };

export default function Step3_Componentes({ onNext, onPrev }: Props) {
  const { inspectionData, setInspectionData, globalStock, setGlobalStock } = useFatoImersaoWizardStore();

  useEffect(() => {
    if (globalStock.length) return;
    fetch("/api/stock")
      .then((r) => r.json())
      .then((d) => {
        const items = Array.isArray(d)
          ? d
          : Array.isArray(d?.items)
            ? d.items
            : Array.isArray(d?.data)
              ? d.data
              : Array.isArray(d?.stock)
                ? d.stock
                : [];
        setGlobalStock(
          items.map((s: any) => ({
            id: s.id,
            referencia: s.referencia || s.ref || "",
            descricao: s.descricao || s.nome || "",
            quantidade: Number(s.quantidade ?? s.qty ?? 0),
            categoria: s.categoria || null,
            validade: s.validade || null,
            lote: s.lote || null,
          }))
        );
      })
      .catch(() => {});
  }, [globalStock.length, setGlobalStock]);

  const updateComp = (id: string, patch: Partial<(typeof inspectionData.componentes)[0]>) => {
    setInspectionData({
      componentes: inspectionData.componentes.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  };

  const fiStock = globalStock.filter(
    (s) =>
      /imers|suit|fato|luz|apito|luvas|neoprene|buddy|strop|beeswax|reflex/i.test(
        `${s.referencia} ${s.descricao} ${s.categoria || ""}`
      ) || true
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">3. Componentes / stock</h2>
        <p className="text-slate-600 mt-1">Substituições ligadas ao stock (luz, apito, luvas, fitas…).</p>
      </div>

      <div className="space-y-4">
        {inspectionData.componentes.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 bg-slate-50 rounded-2xl p-12 flex flex-col items-center justify-center text-center">
            <Package size={48} className="w-12 h-12 text-slate-300 mb-3" />
            <h3 className="text-lg font-semibold text-slate-700 mb-1">Nenhum componente registado</h3>
            <p className="text-sm text-slate-500 max-w-md">
              Clique no seletor acima para associar o artigo de stock substituído (luz, apito, luvas, fitas).
            </p>
          </div>
        ) : null}
        {inspectionData.componentes.map((c) => (
          <div key={c.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Package size={16} className="text-cyan-700" />
              <h3 className="font-bold text-slate-800">{c.name}</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <label className="text-xs md:col-span-2">
                <span className="font-semibold text-slate-500 uppercase">Artigo stock</span>
                <select
                  value={c.stockId ?? ""}
                  onChange={(e) => {
                    const sid = e.target.value ? Number(e.target.value) : null;
                    const st = fiStock.find((x) => x.id === sid);
                    updateComp(c.id, {
                      stockId: sid,
                      reference: st?.referencia || c.reference,
                      lote: st?.lote || c.lote,
                      validade: st?.validade ? toStorageValidade(st.validade) : c.validade,
                      substituido: !!sid,
                    });
                  }}
                  className="mt-1 w-full border rounded-xl px-3 py-2 bg-slate-50 text-sm"
                >
                  <option value="">— sem substituição —</option>
                  {fiStock.slice(0, 200).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.referencia} · {s.descricao} (qty {s.quantidade})
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                <span className="font-semibold text-slate-500 uppercase">Ref.</span>
                <input
                  value={c.reference}
                  onChange={(e) => updateComp(c.id, { reference: e.target.value })}
                  className="mt-1 w-full border rounded-xl px-3 py-2 bg-slate-50 text-sm"
                />
              </label>
              <label className="text-xs">
                <span className="font-semibold text-slate-500 uppercase">Lote</span>
                <input
                  value={c.lote}
                  onChange={(e) => updateComp(c.id, { lote: e.target.value })}
                  className="mt-1 w-full border rounded-xl px-3 py-2 bg-slate-50 text-sm"
                />
              </label>
              <label className="text-xs">
                <span className="font-semibold text-slate-500 uppercase">Validade</span>
                <input
                  value={toDisplayValidade(c.validade)}
                  onChange={(e) => updateComp(c.id, { validade: toStorageValidade(e.target.value) })}
                  placeholder="MM/AAAA"
                  className="mt-1 w-full border rounded-xl px-3 py-2 bg-slate-50 text-sm"
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-between pt-2">
        <button onClick={onPrev} className="inline-flex items-center gap-2 border border-slate-200 px-5 py-3 rounded-xl font-bold">
          <ArrowLeft size={18} /> Anterior
        </button>
        <button onClick={onNext} className="inline-flex items-center gap-2 bg-cyan-700 text-white px-6 py-3 rounded-xl font-bold">
          Seguinte <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
