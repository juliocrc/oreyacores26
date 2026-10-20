"use client";

import React, { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useFatoImersaoWizardStore } from "./store/useFatoImersaoWizardStore";
import { computeNextServiceDate } from "@/lib/fatos-imersao-checklist";
import { toDisplayDate, normalizeDateInput, toMonthInput, normalizeMonthInput } from "@/lib/fato-date-utils";

type Props = { onNext: () => void };

export default function Step1_Identificacao({ onNext }: Props) {
  const { inspectionData, setInspectionData } = useFatoImersaoWizardStore();
  const [catalog, setCatalog] = useState<Array<{ marca: string; modelo: string }>>([]);

  useEffect(() => {
    fetch("/api/fatos-imersao/catalog-options")
      .then((r) => r.json())
      .then((d) => setCatalog(Array.isArray(d) ? d : d?.options || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!inspectionData.dataInspecao) return;
    const { dataProx, meses } = computeNextServiceDate(
      inspectionData.dataInspecao,
      inspectionData.dataFabrico,
      inspectionData.usoRegular,
      inspectionData.intervaloServicoMeses
    );
    if (inspectionData.dataProxInspecao !== dataProx) {
      setInspectionData({ dataProxInspecao: dataProx, intervaloServicoMeses: meses });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectionData.dataInspecao, inspectionData.dataFabrico, inspectionData.usoRegular]);

  const marcas = Array.from(new Set(catalog.map((c) => c.marca).filter(Boolean)));
  const modelos = catalog
    .filter((c) => !inspectionData.brand || c.marca === inspectionData.brand)
    .map((c) => c.modelo)
    .filter(Boolean);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">1. Identificação</h2>
        <p className="text-slate-600 dark:text-slate-400 mt-1">
          Dados do fato (Crewsaver / Viking / Lalizas) e ciclo de serviço.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="text-sm">
          <span className="font-semibold text-slate-600">Nº Série *</span>
          <input
            value={inspectionData.serial}
            onChange={(e) => setInspectionData({ serial: e.target.value })}
            className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50"
          />
        </label>
        <label className="text-sm">
          <span className="font-semibold text-slate-600">Design / P/N (Viking)</span>
          <input
            value={inspectionData.designNo}
            onChange={(e) => setInspectionData({ designNo: e.target.value })}
            placeholder="ex: PS5008"
            className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50"
          />
        </label>
        <label className="text-sm">
          <span className="font-semibold text-slate-600">Marca</span>
          <input
            list="fi-marcas"
            value={inspectionData.brand}
            onChange={(e) => setInspectionData({ brand: e.target.value })}
            className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50"
          />
          <datalist id="fi-marcas">
            {marcas.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
        <label className="text-sm">
          <span className="font-semibold text-slate-600">Modelo</span>
          <input
            list="fi-modelos"
            value={inspectionData.model}
            onChange={(e) => setInspectionData({ model: e.target.value })}
            className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50"
          />
          <datalist id="fi-modelos">
            {modelos.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
        <label className="text-sm">
          <span className="font-semibold text-slate-600">Tamanho</span>
          <select
            value={inspectionData.tamanho}
            onChange={(e) => setInspectionData({ tamanho: e.target.value })}
            className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50"
          >
            <option value="">—</option>
            {["Child", "Universal", "Medium", "Large", "XL", "XXL"].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="font-semibold text-slate-600">Material</span>
          <select
            value={inspectionData.material}
            onChange={(e) => setInspectionData({ material: e.target.value })}
            className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50"
          >
            <option value="">—</option>
            <option value="Neoprene 5mm">Neoprene 5mm</option>
            <option value="Neoprene coated nylon">Neoprene coated nylon</option>
            <option value="PU coated nylon">PU coated nylon</option>
            <option value="Gore-Tex">Gore-Tex</option>
            <option value="Polyester+TPU">Polyester+TPU</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="font-semibold text-slate-600">Data fabrico (MM/AAAA)</span>
          <input
            type="month"
            value={toMonthInput(inspectionData.dataFabrico)}
            onChange={(e) => setInspectionData({ dataFabrico: normalizeMonthInput(e.target.value) })}
            className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50"
          />
        </label>
        <label className="text-sm">
          <span className="font-semibold text-slate-600">Data inspeção *</span>
          <DateTextInput
            value={inspectionData.dataInspecao}
            onChange={(dataInspecao) => setInspectionData({ dataInspecao })}
            className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50"
            placeholder="dd/mm/aaaa"
          />
        </label>
        <label className="text-sm">
          <span className="font-semibold text-slate-600">Próxima inspeção</span>
          <DateTextInput
            value={inspectionData.dataProxInspecao}
            onChange={(dataProxInspecao) => setInspectionData({ dataProxInspecao })}
            className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50"
            placeholder="dd/mm/aaaa"
          />
          <span className="text-xs text-slate-400">
            Auto: {inspectionData.usoRegular ? "anual (uso regular)" : "3 anos / 1 ano se ≥10 anos"}
          </span>
        </label>
        <label className="text-sm">
          <span className="font-semibold text-slate-600">Inspetor</span>
          <input
            value={inspectionData.inspectorNome}
            onChange={(e) => setInspectionData({ inspectorNome: e.target.value })}
            className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50"
          />
        </label>
        <label className="text-sm flex items-center gap-2 mt-6">
          <input
            type="checkbox"
            checked={inspectionData.usoRegular}
            onChange={(e) => setInspectionData({ usoRegular: e.target.checked })}
            className="rounded"
          />
          <span className="font-semibold text-slate-700">Uso regular (serviço anual Viking)</span>
        </label>
        <label className="text-sm md:col-span-2">
          <span className="font-semibold text-slate-600">Navio</span>
          <input
            value={inspectionData.shipName}
            readOnly
            className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-100 text-slate-600"
          />
        </label>
      </div>

      <div className="flex justify-end pt-2">
        <button
          disabled={!inspectionData.serial}
          onClick={onNext}
          className="inline-flex items-center gap-2 bg-cyan-700 hover:bg-cyan-800 disabled:opacity-40 text-white px-6 py-3 rounded-xl font-bold"
        >
          Seguinte <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}

function DateTextInput({
  value,
  onChange,
  className,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState(() => toDisplayDate(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setText(toDisplayDate(value));
  }, [value]);

  return (
    <input
      value={text}
      inputMode="numeric"
      onFocus={() => {
        focusedRef.current = true;
      }}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        onChange(normalizeDateInput(next));
      }}
      onBlur={() => {
        focusedRef.current = false;
        const normalized = normalizeDateInput(text);
        setText(toDisplayDate(normalized));
        onChange(normalized);
      }}
      className={className}
      placeholder={placeholder}
    />
  );
}
