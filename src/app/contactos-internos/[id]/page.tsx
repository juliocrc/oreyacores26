"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDateTimeShort } from "@/lib/date-utils";

type ContactoInterno = {
  id: number;
  categoria: string;
  empresa: string | null;
  localizacao: string | null;
  nome: string;
  email: string | null;
  telemovel: string | null;
  telefoneFixo: string | null;
  extensaoNos: string | null;
  extensaoVodafone: string | null;
  observacoes: string | null;
  ativo: boolean;
  fonte: string | null;
  tecnicoId: number | null;
  serviceStationId: number | null;
  tecnico?: { id: number; nome: string; email: string | null } | null;
  serviceStation?: { id: number; codigo: string; nome: string } | null;
  createdAt: string;
  updatedAt: string;
};

type ContactoForm = {
  categoria: string;
  empresa: string;
  localizacao: string;
  nome: string;
  email: string;
  telemovel: string;
  telefoneFixo: string;
  extensaoNos: string;
  extensaoVodafone: string;
  observacoes: string;
  ativo: boolean;
  fonte: string;
  tecnicoId: string;
  serviceStationId: string;
};

type ServiceStationOption = { id: number; codigo: string; nome: string };

function buildForm(contacto: ContactoInterno): ContactoForm {
  return {
    categoria: contacto.categoria || "Colaborador",
    empresa: contacto.empresa || "",
    localizacao: contacto.localizacao || "",
    nome: contacto.nome || "",
    email: contacto.email || "",
    telemovel: contacto.telemovel || "",
    telefoneFixo: contacto.telefoneFixo || "",
    extensaoNos: contacto.extensaoNos || "",
    extensaoVodafone: contacto.extensaoVodafone || "",
    observacoes: contacto.observacoes || "",
    ativo: contacto.ativo,
    fonte: contacto.fonte || "",
    tecnicoId: contacto.tecnicoId != null ? String(contacto.tecnicoId) : "",
    serviceStationId: contacto.serviceStationId != null ? String(contacto.serviceStationId) : "",
  };
}

export default function ContactoInternoDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;
  const [contacto, setContacto] = useState<ContactoInterno | null>(null);
  const [form, setForm] = useState<ContactoForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [tecnicos, setTecnicos] = useState<Array<{ id: number; nome: string; email: string | null }>>([]);
  const [stations, setStations] = useState<ServiceStationOption[]>([]);

  const isDirty = useMemo(() => {
    if (!contacto || !form) return false;
    return JSON.stringify(buildForm(contacto)) !== JSON.stringify(form);
  }, [contacto, form]);

  const loadContacto = useCallback(async () => {
    if (!id) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/contactos-internos/${id}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Não foi possível carregar o contacto interno.");
      }

      const payload = await response.json();
      setContacto(payload);
      setForm(buildForm(payload));
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Erro ao carregar contacto interno.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setLoading(true) no início do fetch assíncrono controla o estado de carregamento.
    loadContacto();
  }, [loadContacto]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/tecnicos?includeInactive=false");
        if (!response.ok) return;
        const data = await response.json();
        const flat: Array<{ id: number; nome: string; email: string | null }> = [];
        for (const station of Array.isArray(data?.stations) ? data.stations : []) {
          for (const t of Array.isArray(station?.tecnicos) ? station.tecnicos : []) {
            flat.push({ id: t.id, nome: t.nome, email: t.email ?? null });
          }
        }
        for (const t of Array.isArray(data?.unassigned) ? data.unassigned : []) {
          flat.push({ id: t.id, nome: t.nome, email: t.email ?? null });
        }
        flat.sort((a, b) => a.nome.localeCompare(b.nome, "pt-PT", { sensitivity: "base" }));
        if (!cancelled) setTecnicos(flat);
      } catch (error) {
        console.error(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/service-stations");
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) setStations(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!id || !form) return;

    if (!form.nome.trim()) {
      alert("Nome do contacto é obrigatório.");
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(`/api/contactos-internos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Não foi possível guardar o contacto interno.");
      }

      setContacto(payload);
      setForm(buildForm(payload));
      alert("Contacto interno atualizado com sucesso.");
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Erro ao guardar contacto interno.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !contacto) return;
    if (!window.confirm(`Excluir permanentemente o contacto ${contacto.nome}?`)) return;

    try {
      setDeleting(true);
      const response = await fetch(`/api/contactos-internos/${id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Não foi possível excluir o contacto interno.");
      }

      router.push("/contactos-internos");
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Erro ao excluir contacto interno.");
    } finally {
      setDeleting(false);
    }
  };

  if (loading || !form) {
    return <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-slate-500">A carregar ficha do contacto...</div>;
  }

  if (!contacto) {
    return <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-slate-500">Contacto não encontrado.</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  {contacto.categoria}
                </span>
                {!contacto.ativo && (
                  <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
                    Inativo
                  </span>
                )}
                {contacto.tecnico && (
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    Técnico: {contacto.tecnico.nome}
                  </span>
                )}
                {contacto.serviceStation && (
                  <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                    Estação: {contacto.serviceStation.nome}
                  </span>
                )}
              </div>
              <h1 className="mt-3 text-3xl font-bold text-slate-900">{contacto.nome}</h1>
              <p className="mt-2 text-sm text-slate-500">
                {contacto.empresa || "Sem empresa"}
                {contacto.localizacao ? ` • ${contacto.localizacao}` : ""}
                {contacto.fonte ? ` • ${contacto.fonte}` : " • Registo manual"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/contactos-internos"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Voltar à lista
              </Link>
              <button
                type="button"
                onClick={loadContacto}
                className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
              >
                Repor alterações
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {deleting ? "A excluir..." : "Excluir"}
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Criado</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{formatDateTimeShort(contacto.createdAt)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Atualizado</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{formatDateTimeShort(contacto.updatedAt)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Alterações pendentes</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{isDirty ? "Sim" : "Não"}</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSave} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm text-slate-600">
              Nome *
              <input
                type="text"
                value={form.nome}
                onChange={(event) => setForm((prev) => (prev ? { ...prev, nome: event.target.value } : prev))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm text-slate-600">
              Categoria
              <select
                value={form.categoria}
                onChange={(event) => setForm((prev) => (prev ? { ...prev, categoria: event.target.value } : prev))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="Colaborador">Colaborador</option>
                <option value="Contacto útil">Contacto útil</option>
              </select>
            </label>
            <label className="text-sm text-slate-600">
              Empresa
              <input
                type="text"
                value={form.empresa}
                onChange={(event) => setForm((prev) => (prev ? { ...prev, empresa: event.target.value } : prev))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm text-slate-600">
              Localização
              <input
                type="text"
                value={form.localizacao}
                onChange={(event) => setForm((prev) => (prev ? { ...prev, localizacao: event.target.value } : prev))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm text-slate-600">
              Técnico ligado
              <select
                value={form.tecnicoId}
                onChange={(event) => setForm((prev) => (prev ? { ...prev, tecnicoId: event.target.value } : prev))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Sem técnico ligado</option>
                {tecnicos.map((item) => (
                  <option key={item.id} value={String(item.id)}>{item.nome}</option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-600">
              Estação de serviço
              <select
                value={form.serviceStationId}
                onChange={(event) => setForm((prev) => (prev ? { ...prev, serviceStationId: event.target.value } : prev))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Sem estação atribuída</option>
                {stations.map((item) => (
                  <option key={item.id} value={String(item.id)}>{item.nome} ({item.codigo})</option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-600 sm:col-span-2">
              Email(s)
              <input
                type="text"
                value={form.email}
                onChange={(event) => setForm((prev) => (prev ? { ...prev, email: event.target.value } : prev))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm text-slate-600">
              Telemóvel
              <input
                type="text"
                value={form.telemovel}
                onChange={(event) => setForm((prev) => (prev ? { ...prev, telemovel: event.target.value } : prev))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm text-slate-600">
              Telefone fixo
              <input
                type="text"
                value={form.telefoneFixo}
                onChange={(event) => setForm((prev) => (prev ? { ...prev, telefoneFixo: event.target.value } : prev))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm text-slate-600">
              Extensão NOS
              <input
                type="text"
                value={form.extensaoNos}
                onChange={(event) => setForm((prev) => (prev ? { ...prev, extensaoNos: event.target.value } : prev))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm text-slate-600">
              Extensão Vodafone
              <input
                type="text"
                value={form.extensaoVodafone}
                onChange={(event) => setForm((prev) => (prev ? { ...prev, extensaoVodafone: event.target.value } : prev))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm text-slate-600 sm:col-span-2">
              Fonte
              <input
                type="text"
                value={form.fonte}
                onChange={(event) => setForm((prev) => (prev ? { ...prev, fonte: event.target.value } : prev))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm text-slate-600 sm:col-span-2">
              Observações
              <textarea
                value={form.observacoes}
                onChange={(event) => setForm((prev) => (prev ? { ...prev, observacoes: event.target.value } : prev))}
                rows={4}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 sm:col-span-2">
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(event) => setForm((prev) => (prev ? { ...prev, ativo: event.target.checked } : prev))}
              />
              Contacto ativo
            </label>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={loadContacto}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Recarregar dados
            </button>
            <button
              type="submit"
              disabled={saving || !isDirty}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? "A guardar..." : "Guardar alterações"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
