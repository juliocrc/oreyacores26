"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

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
};

const INITIAL_FORM: ContactoForm = {
  categoria: "Colaborador",
  empresa: "",
  localizacao: "",
  nome: "",
  email: "",
  telemovel: "",
  telefoneFixo: "",
  extensaoNos: "",
  extensaoVodafone: "",
  observacoes: "",
  ativo: true,
};

function formatInlinePhone(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  if (!normalized) return "—";
  return normalized.replace(/\s+/g, "\u00A0");
}

export default function ContactosInternosPage() {
  const [contactos, setContactos] = useState<ContactoInterno[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importingPdf, setImportingPdf] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [categoria, setCategoria] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [localizacao, setLocalizacao] = useState("");
  const [showOnlyActive, setShowOnlyActive] = useState(true);
  const [isFormExpanded, setIsFormExpanded] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);

  const loadContactos = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (categoria.trim()) params.set("categoria", categoria.trim());
      if (empresa.trim()) params.set("empresa", empresa.trim());
      if (localizacao.trim()) params.set("localizacao", localizacao.trim());
      params.set("ativo", showOnlyActive ? "true" : "");

      const response = await fetch(`/api/contactos-internos?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Não foi possível carregar os contactos internos.");
      }

      const data = await response.json();
      setContactos(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Erro ao carregar contactos internos.");
    } finally {
      setLoading(false);
    }
  }, [categoria, empresa, localizacao, search, showOnlyActive]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setLoading(true) no início do fetch assíncrono controla o estado de carregamento.
    void loadContactos();
  }, [loadContactos]);

  const empresas = useMemo(
    () => Array.from(new Set(contactos.map((item) => item.empresa).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "pt-PT")),
    [contactos]
  );

  const localizacoes = useMemo(
    () => Array.from(new Set(contactos.map((item) => item.localizacao).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "pt-PT")),
    [contactos]
  );

  const categorias = useMemo(
    () => Array.from(new Set(contactos.map((item) => item.categoria).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-PT")),
    [contactos]
  );

  const groupedContactos = useMemo(() => {
    const groups = new Map<string, {
      key: string;
      title: string;
      subtitle: string;
      contactos: ContactoInterno[];
    }>();

    for (const contacto of contactos) {
      const empresaLabel = String(contacto.empresa || "Sem empresa").trim() || "Sem empresa";
      const localizacaoLabel = String(contacto.localizacao || "Sem localização").trim() || "Sem localização";
      const key = `${empresaLabel}__${localizacaoLabel}`;
      const existing = groups.get(key);

      if (existing) {
        existing.contactos.push(contacto);
        continue;
      }

      groups.set(key, {
        key,
        title: localizacaoLabel,
        subtitle: empresaLabel,
        contactos: [contacto],
      });
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        contactos: [...group.contactos].sort((a, b) => a.nome.localeCompare(b.nome, "pt-PT", { sensitivity: "base" })),
      }))
      .sort((a, b) => {
        const locationDiff = a.title.localeCompare(b.title, "pt-PT", { sensitivity: "base" });
        if (locationDiff !== 0) return locationDiff;
        return a.subtitle.localeCompare(b.subtitle, "pt-PT", { sensitivity: "base" });
      });
  }, [contactos]);

  const groupKeys = useMemo(() => groupedContactos.map((group) => group.key).join("\u0000"), [groupedContactos]);
  const [prevGroupKeys, setPrevGroupKeys] = useState("");

  if (prevGroupKeys !== groupKeys) {
    setPrevGroupKeys(groupKeys);
    setCollapsedGroups((prev) => {
      const next = { ...prev };
      let changed = false;

      for (const group of groupedContactos) {
        if (!(group.key in next)) {
          next[group.key] = false;
          changed = true;
        }
      }

      for (const key of Object.keys(next)) {
        if (!groupedContactos.some((group) => group.key === key)) {
          delete next[key];
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }

  const stats = useMemo(() => {
    const total = contactos.length;
    const withEmail = contactos.filter((item) => item.email).length;
    const withMobile = contactos.filter((item) => item.telemovel).length;
    const useful = contactos.filter((item) => item.categoria === "Contacto útil").length;

    return { total, withEmail, withMobile, useful };
  }, [contactos]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.nome.trim()) {
      alert("Nome do contacto é obrigatório.");
      return;
    }

    try {
      setSaving(true);
      const response = await fetch("/api/contactos-internos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Não foi possível criar o contacto interno.");
      }

      setForm(INITIAL_FORM);
      await loadContactos();
      setIsFormExpanded(false);
      alert("Contacto interno criado com sucesso.");
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Erro ao criar contacto interno.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number, nome: string) => {
    if (!window.confirm(`Excluir o contacto interno ${nome}?`)) return;

    try {
      const response = await fetch(`/api/contactos-internos?id=${id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Não foi possível excluir o contacto interno.");
      }

      await loadContactos();
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Erro ao excluir contacto interno.");
    }
  };

  const handleImportPdf = async () => {
    if (!window.confirm("Importar novamente o PDF e substituir os contactos anteriormente importados desse ficheiro?")) {
      return;
    }

    try {
      setImportingPdf(true);
      const response = await fetch("/api/contactos-internos/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replaceExisting: true }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Não foi possível importar o PDF.");
      }

      await loadContactos();
      alert(`Importação concluída: ${payload.imported ?? 0} contactos atualizados.`);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Erro ao importar o PDF.");
    } finally {
      setImportingPdf(false);
    }
  };

  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  const minimizeGroups = () => {
    setCollapsedGroups(groupedContactos.reduce<Record<string, boolean>>((acc, group) => {
      acc[group.key] = true;
      return acc;
    }, {}));
  };

  const expandAllGroups = () => {
    setCollapsedGroups(groupedContactos.reduce<Record<string, boolean>>((acc, group) => {
      acc[group.key] = false;
      return acc;
    }, {}));
  };

  const openCreateContactForm = () => {
    setIsFormExpanded(true);
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        document.getElementById("novo-contacto-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="ds-page flex flex-col gap-6">
        <div className="app-hero-panel flex flex-col gap-4 rounded-2xl p-6 text-white">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-100">Orey Técnica</p>
              <h1 className="mt-2 text-3xl font-bold">Contactos internos</h1>
              <p className="mt-2 max-w-3xl text-sm text-sky-100">
                Diretório interno com importação direta da lista PDF `Lista de contactos Orey@20251215.pdf`,
                incluindo contactos úteis, equipas e extensões internas.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => { if (isFormExpanded) { setIsFormExpanded(false); return; } openCreateContactForm(); }} className="rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/25 transition hover:bg-white/20">
                {isFormExpanded ? "Recolher formulário" : "+ Novo contacto"}
              </button>
              <button type="button" onClick={handleImportPdf} disabled={importingPdf} className="rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/25 transition hover:bg-white/20 disabled:opacity-50">
                {importingPdf ? "A importar PDF..." : "Importar PDF Orey"}
              </button>
              <button type="button" onClick={loadContactos} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700">Atualizar lista</button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Total em vista", value: stats.total },
              { label: "Com email", value: stats.withEmail },
              { label: "Com telemóvel", value: stats.withMobile },
              { label: "Contactos úteis", value: stats.useful },
            ].map((item) => (
              <div key={item.label} className="app-hero-card rounded-xl p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-sky-100">{item.label}</p>
                <p className="mt-2 text-2xl font-bold">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_1.85fr]">
          <section id="novo-contacto-form" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Novo contacto</h2>
                <p className="text-sm text-slate-500">Registo manual para completar ou corrigir o diretório.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Manual</span>
                <button type="button" onClick={() => setIsFormExpanded((prev) => !prev)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
                  {isFormExpanded ? "Recolher formulário" : "Expandir formulário"}
                </button>
              </div>
            </div>

            {isFormExpanded ? (
              <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm text-slate-600 sm:col-span-2">Nome *<input type="text" value={form.nome} onChange={(event) => setForm((prev) => ({ ...prev, nome: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
                <label className="text-sm text-slate-600">Categoria<select value={form.categoria} onChange={(event) => setForm((prev) => ({ ...prev, categoria: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="Colaborador">Colaborador</option><option value="Contacto útil">Contacto útil</option></select></label>
                <label className="text-sm text-slate-600">Empresa<input type="text" value={form.empresa} onChange={(event) => setForm((prev) => ({ ...prev, empresa: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
                <label className="text-sm text-slate-600">Localização<input type="text" value={form.localizacao} onChange={(event) => setForm((prev) => ({ ...prev, localizacao: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
                <label className="text-sm text-slate-600">Email(s)<input type="text" value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} placeholder="email@orey.com / outro@orey.com" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
                <label className="text-sm text-slate-600">Telemóvel<input type="text" value={form.telemovel} onChange={(event) => setForm((prev) => ({ ...prev, telemovel: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
                <label className="text-sm text-slate-600">Telefone fixo<input type="text" value={form.telefoneFixo} onChange={(event) => setForm((prev) => ({ ...prev, telefoneFixo: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
                <label className="text-sm text-slate-600">Extensão NOS<input type="text" value={form.extensaoNos} onChange={(event) => setForm((prev) => ({ ...prev, extensaoNos: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
                <label className="text-sm text-slate-600">Extensão Vodafone<input type="text" value={form.extensaoVodafone} onChange={(event) => setForm((prev) => ({ ...prev, extensaoVodafone: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
                <label className="text-sm text-slate-600 sm:col-span-2">Observações<textarea value={form.observacoes} onChange={(event) => setForm((prev) => ({ ...prev, observacoes: event.target.value }))} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
                <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 sm:col-span-2"><input type="checkbox" checked={form.ativo} onChange={(event) => setForm((prev) => ({ ...prev, ativo: event.target.checked }))} />Contacto ativo</label>
                <div className="sm:col-span-2 flex justify-end"><button type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50">{saving ? "A guardar..." : "Guardar contacto"}</button></div>
              </form>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">O formulário está recolhido para libertar espaço ao diretório. Abra-o quando precisar de criar ou editar um contacto.</div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Diretório</h2>
                <p className="text-sm text-slate-500">Pesquisa por nome, email, empresa, localização ou observações.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={minimizeGroups} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Minimizar grupos</button>
                <button type="button" onClick={expandAllGroups} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Expandir tudo</button>
                <button type="button" onClick={loadContactos} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Aplicar filtros</button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <input type="text" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar..." className="rounded-lg border border-slate-300 px-3 py-2 text-sm xl:col-span-2" />
              <select value={categoria} onChange={(event) => setCategoria(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="">Todas as categorias</option>{categorias.map((item) => <option key={item} value={item}>{item}</option>)}</select>
              <select value={empresa} onChange={(event) => setEmpresa(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="">Todas as empresas</option>{empresas.map((item) => <option key={item} value={item}>{item}</option>)}</select>
              <select value={localizacao} onChange={(event) => setLocalizacao(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="">Todas as localizações</option>{localizacoes.map((item) => <option key={item} value={item}>{item}</option>)}</select>
            </div>

            <div className="mt-3 flex items-end justify-between gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={showOnlyActive} onChange={(event) => setShowOnlyActive(event.target.checked)} />Mostrar apenas contactos ativos</label>
              <div className="text-xs text-slate-500">{groupedContactos.length} grupos visíveis</div>
            </div>

            {loading ? (
              <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">A carregar diretório...</div>
            ) : contactos.length === 0 ? (
              <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500"><p>Nenhum contacto encontrado com os filtros atuais.</p><button type="button" onClick={openCreateContactForm} className="mt-4 inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">+ Novo contacto</button></div>
            ) : (
              <div className="mt-6 space-y-4">
                {groupedContactos.map((group) => {
                  const collapsed = collapsedGroups[group.key] ?? false;
                  return (
                    <div key={group.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/50">
                      <button type="button" onClick={() => toggleGroup(group.key)} className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition hover:bg-white/40">
                        <div>
                          <div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-semibold text-slate-900">{group.title}</h3><span className="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700">Grupo</span></div>
                          <p className="mt-1 text-sm text-slate-600">{group.subtitle} · {group.contactos.length} contacto(s)</p>
                        </div>
                        <span className="text-sm font-semibold text-slate-600">{collapsed ? "Expandir" : "Minimizar"}</span>
                      </button>
                      {!collapsed && (
                        <div className="overflow-x-auto border-t border-slate-200 bg-white/80">
                          <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead><tr className="bg-slate-100 text-left text-slate-600"><th className="px-3 py-2 font-semibold">Contacto</th><th className="px-3 py-2 font-semibold">Empresa / local</th><th className="px-3 py-2 font-semibold">Telefones</th><th className="px-3 py-2 font-semibold">Extensões</th><th className="px-3 py-2 font-semibold">Ações</th></tr></thead>
                            <tbody className="divide-y divide-slate-100">
                              {group.contactos.map((contacto) => (
                                <tr key={contacto.id} className="align-top">
                                  <td className="px-3 py-3"><div className="font-semibold text-slate-900"><Link href={`/contactos-internos/${contacto.id}`} className="hover:text-blue-700 hover:underline">{contacto.nome}</Link></div><div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500"><span>{contacto.categoria}</span></div>{contacto.email && <div className="mt-2 break-all text-xs text-slate-600">{contacto.email}</div>}{contacto.observacoes && <div className="mt-2 text-xs text-slate-500">{contacto.observacoes}</div>}</td>
                                  <td className="px-3 py-3 text-slate-600"><div>{contacto.empresa || "—"}</div><div className="text-xs text-slate-500">{contacto.localizacao || "Sem localização"}</div></td>
                                  <td className="px-3 py-3 text-slate-600"><div className="whitespace-nowrap text-xs text-slate-600">Móvel: {formatInlinePhone(contacto.telemovel)}</div><div className="whitespace-nowrap text-xs text-slate-500">Fixo: {formatInlinePhone(contacto.telefoneFixo)}</div></td>
                                  <td className="px-3 py-3 text-slate-600"><div className="whitespace-nowrap">NOS: {contacto.extensaoNos || "—"}</div><div className="whitespace-nowrap text-xs text-slate-500">Vodafone: {contacto.extensaoVodafone || "—"}</div></td>
                                  <td className="px-3 py-3"><div className="flex flex-col gap-2"><Link href={`/contactos-internos/${contacto.id}`} className="rounded-md bg-blue-600 px-3 py-1.5 text-center text-xs font-semibold text-white hover:bg-blue-700">Abrir ficha</Link><button type="button" onClick={() => handleDelete(contacto.id, contacto.nome)} className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700">Excluir</button></div></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

