"use client";

import { useMemo, useState } from "react";
import { Lock, Save, UserRound } from "lucide-react";

export type ClienteFicha = {
  id: number;
  nome: string;
  nif: string | null;
  numeroCliente: string | null;
  email: string | null;
  telefone: string | null;
  telmovel: string | null;
  morada: string | null;
  moradaNumero: string | null;
  codigoPostal: string | null;
  localidade: string | null;
  ilha: string | null;
};

const EDITABLE_FIELDS = ["email", "telefone", "telmovel", "morada", "moradaNumero", "codigoPostal", "localidade", "ilha"] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];

const LABELS: Record<EditableField, string> = {
  email: "Email",
  telefone: "Telefone fixo",
  telmovel: "Telemóvel",
  morada: "Morada",
  moradaNumero: "Nº / andar",
  codigoPostal: "Código postal",
  localidade: "Localidade",
  ilha: "Ilha",
};

const WIDE: EditableField[] = ["morada", "localidade"];

export default function ClienteFichaPanel({ cliente }: { cliente: ClienteFicha }) {
  const initial = useMemo(() => {
    const obj = {} as Record<EditableField, string>;
    for (const f of EDITABLE_FIELDS) obj[f] = (cliente[f] as string | null) || "";
    return obj;
  }, [cliente]);

  const [form, setForm] = useState<Record<EditableField, string>>(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const alterou = useMemo(
    () => EDITABLE_FIELDS.some((f) => (form[f] || "") !== (initial[f] || "")),
    [form, initial],
  );

  const submeter = async () => {
    if (!alterou) return;
    setSaving(true);
    setMessage(null);
    setIsError(false);
    try {
      const campos = Object.fromEntries(EDITABLE_FIELDS.map((f) => [f, form[f] || null]));
      const res = await fetch("/api/portal/propostas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "ficha", campos }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Não foi possível submeter as alterações.");
      setMessage("Alterações submetidas. Ficam visíveis após aprovação do administrador.");
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Erro ao submeter alterações.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-3xl border border-slate-200/60 bg-white p-6 sm:p-8 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Os meus dados</p>
          <h2 className="mt-1 text-lg font-extrabold text-slate-800">Ficha e contactos</h2>
          <p className="mt-1 text-sm text-slate-500">Pode atualizar a morada e os contactos. As alterações só ficam definitivas depois de aprovadas.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
          <UserRound size={14} /> {cliente.nome}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-500">Nome</label>
            <input value={cliente.nome} disabled className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-sm font-medium text-slate-500" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 flex items-center gap-1">
              NIF <Lock size={11} className="text-slate-400" />
            </label>
            <input value={cliente.nif || ""} disabled className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-sm font-medium text-slate-500" />
            <p className="mt-1 text-[11px] text-slate-400">O NIF não pode ser alterado. Contacte a Orey para corrigir.</p>
          </div>
        </div>

        {EDITABLE_FIELDS.map((f) => (
          <div key={f} className={WIDE.includes(f) ? "sm:col-span-2" : ""}>
            <label className="text-xs font-bold text-slate-500">{LABELS[f]}</label>
            <input
              value={form[f]}
              onChange={(e) => setForm((cur) => ({ ...cur, [f]: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
        <p className="text-xs text-slate-500">
          {alterou ? "Tem alterações por submeter." : "Sem alterações pendentes."}
          {message && <span className={`ml-2 font-semibold ${isError ? "text-rose-700" : "text-emerald-700"}`}>{message}</span>}
        </p>
        <button
          type="button"
          onClick={() => void submeter()}
          disabled={saving || !alterou}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          <Save size={16} /> {saving ? "A submeter..." : "Submeter alterações"}
        </button>
      </div>
    </section>
  );
}
