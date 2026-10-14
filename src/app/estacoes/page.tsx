"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Station = {
  id: number;
  codigo: string;
  nome: string;
  empresa: string | null;
  localizacao: string | null;
  prefixo: string | null;
  territorioTipo: string;
  regiaoOperacional: string | null;
  ativo: boolean;
  observacoes: string | null;
};

const TERRITORIES = [
  { value: "MAINLAND", label: "Continente" },
  { value: "AZORES", label: "Açores" },
  { value: "MADEIRA", label: "Madeira" },
];

const REGIONS = [
  { value: "", label: "—" },
  { value: "NORTE", label: "Norte" },
  { value: "CENTRO", label: "Centro" },
  { value: "SUL", label: "Sul" },
  { value: "MADEIRA", label: "Madeira" },
];

const EMPTY_FORM = {
  id: 0,
  codigo: "",
  nome: "",
  empresa: "",
  localizacao: "",
  prefixo: "",
  territorioTipo: "MAINLAND",
  regiaoOperacional: "",
  ativo: true,
  observacoes: "",
};

function territoryLabel(value: string) {
  return TERRITORIES.find((item) => item.value === value)?.label || value;
}

export default function EstacoesPage() {
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/service-stations?includeInactive=1", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao carregar estações.");
        return;
      }
      setStations(Array.isArray(data) ? data : []);
    } catch {
      setError("Erro de rede.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const ordered = useMemo(
    () => [...stations].sort((a, b) => a.nome.localeCompare(b.nome, "pt-PT")),
    [stations],
  );

  const openCreate = () => {
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
    setError(null);
  };

  const openEdit = (station: Station) => {
    setForm({
      id: station.id,
      codigo: station.codigo,
      nome: station.nome,
      empresa: station.empresa || "",
      localizacao: station.localizacao || "",
      prefixo: station.prefixo || "",
      territorioTipo: station.territorioTipo || "MAINLAND",
      regiaoOperacional: station.regiaoOperacional || "",
      ativo: station.ativo,
      observacoes: station.observacoes || "",
    });
    setShowForm(true);
    setError(null);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const editing = form.id > 0;
      const res = await fetch(editing ? `/api/service-stations/${form.id}` : "/api/service-stations", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Erro ao guardar estação.");
        return;
      }
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
      await load();
    } catch {
      setError("Erro de rede.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (station: Station) => {
    const confirmed = window.confirm(
      `Remover a estação ${station.nome}? Se tiver dados associados, será desativada em vez de eliminada.`,
    );
    if (!confirmed) return;
    setBusyId(station.id);
    setError(null);
    try {
      const res = await fetch(`/api/service-stations/${station.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Erro ao remover estação.");
        return;
      }
      await load();
    } catch {
      setError("Erro de rede.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Estações de Serviço</h1>
          <p className="mt-1 text-sm text-slate-500">
            Cada estação tem o seu próprio stock. As embarcações são atribuídas pela localização do porto,
            mas ficam visíveis para todas as estações.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          + Nova estação
        </button>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleSave}
          className="mb-6 rounded-2xl border border-slate-200 bg-slate-50/60 p-5"
        >
          <h2 className="mb-4 text-base font-semibold text-slate-900">
            {form.id > 0 ? `Editar estação #${form.id}` : "Nova estação"}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm text-slate-600">
              Código *
              <input
                value={form.codigo}
                onChange={(e) => setForm((p) => ({ ...p, codigo: e.target.value }))}
                required
                placeholder="SETUBAL"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase"
              />
            </label>
            <label className="text-sm text-slate-600">
              Nome *
              <input
                value={form.nome}
                onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
                required
                placeholder="Setúbal"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm text-slate-600">
              Empresa
              <input
                value={form.empresa}
                onChange={(e) => setForm((p) => ({ ...p, empresa: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm text-slate-600">
              Localização
              <input
                value={form.localizacao}
                onChange={(e) => setForm((p) => ({ ...p, localizacao: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm text-slate-600">
              Prefixo de numeração
              <input
                value={form.prefixo}
                onChange={(e) => setForm((p) => ({ ...p, prefixo: e.target.value.toUpperCase() }))}
                maxLength={4}
                placeholder="AZ"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase"
              />
              <span className="mt-1 block text-xs text-slate-400">
                Usado nos certificados desta estação (ex.: {form.prefixo || "AZ"}
                {String(new Date().getFullYear()).slice(-2)}-001). Vazio = derivado do código.
              </span>
            </label>
            <label className="text-sm text-slate-600">
              Território
              <select
                value={form.territorioTipo}
                onChange={(e) => setForm((p) => ({ ...p, territorioTipo: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {TERRITORIES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-600">
              Região operacional
              <select
                value={form.regiaoOperacional}
                onChange={(e) => setForm((p) => ({ ...p, regiaoOperacional: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {REGIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600 sm:col-span-2">
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) => setForm((p) => ({ ...p, ativo: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300"
              />
              Estação ativa
            </label>
            <label className="text-sm text-slate-600 sm:col-span-2">
              Observações
              <textarea
                value={form.observacoes}
                onChange={(e) => setForm((p) => ({ ...p, observacoes: e.target.value }))}
                rows={2}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "A guardar..." : "Guardar"}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setForm({ ...EMPTY_FORM }); }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Prefixo</th>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Empresa / Localização</th>
              <th className="px-4 py-3">Território / Região</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">A carregar...</td>
              </tr>
            ) : ordered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">Sem estações.</td>
              </tr>
            ) : (
              ordered.map((station) => (
                <tr key={station.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700">{station.codigo}</td>
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-500">{station.prefixo || "—"}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{station.nome}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {[station.empresa, station.localizacao].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {[territoryLabel(station.territorioTipo), station.regiaoOperacional].filter(Boolean).join(" / ")}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        station.ativo ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {station.ativo ? "Ativa" : "Inativa"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(station)}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(station)}
                        disabled={busyId === station.id}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                      >
                        {busyId === station.id ? "..." : "Remover"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
