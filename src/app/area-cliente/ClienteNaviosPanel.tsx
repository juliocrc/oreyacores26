"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Lightbulb, Loader2, Plus, Sparkles, X } from "lucide-react";
import { PIROTECNIA_OPCOES, getPirotecniaSugestoes, pirotecnicoStatus } from "@/lib/pirotecnia-sugestoes";

type Ship = {
  id: number;
  nome: string;
  matricula?: string;
  ilha?: string | null;
  portoRegisto?: string | null;
  tipoPesca?: string;
  tipoNavio?: string | null;
  comprimentoMetros?: number | null;
};

type PirotecnicoItem = { id?: string; item?: string; quantity?: string; validade?: string; notes?: string; nome?: string; quantidade?: string };

type Equipment = {
  id: number;
  serial: string;
  marca?: string | null;
  modelo?: string | null;
  capacidadeKg?: number | null;
  estado?: string | null;
  dataProxInspecao?: string | null;
  dataValidadeBateria?: string | null;
  dataProxRecarga?: string | null;
  luzValidade?: string | null;
  apitoValidade?: string | null;
  pastilhaValidade?: string | null;
};

type ShipData = {
  navio: Ship & { pirotecnicosBordo: PirotecnicoItem[] };
  equipamentos: { coletes: Equipment[]; fatos: Equipment[]; epirbs: Equipment[]; extintores: Equipment[] };
  documentos: Array<{ id: number; descricao?: string | null }>;
};

const equipmentLabels = { coletes: "Coletes", fatos: "Fatos de imersão", epirbs: "EPIRBs", extintores: "Extintores" } as const;
const ASSOC_TIPOS = [
  { key: "jangada", label: "Jangada" },
  { key: "colete", label: "Colete" },
  { key: "fato", label: "Fato de imersão" },
  { key: "epirb", label: "EPIRB" },
  { key: "extintor", label: "Extintor" },
] as const;

function invalidLocation(value?: string | null) {
  const v = String(value || "").trim().toLowerCase();
  return !v || v === "n/a" || v === "na" || v === "não aplicável" || v === "nao aplicavel" || v === "-";
}

function shipLocation(ship: { ilha?: string | null; portoRegisto?: string | null }) {
  if (!invalidLocation(ship.ilha)) return ship.ilha as string;
  if (!invalidLocation(ship.portoRegisto)) return ship.portoRegisto as string;
  return null;
}

export default function ClienteNaviosPanel({ navios }: { navios: Ship[] }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [data, setData] = useState<ShipData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [assocTipo, setAssocTipo] = useState<string>("jangada");
  const [assocSerial, setAssocSerial] = useState("");
  const [assocItens, setAssocItens] = useState<Array<{ tipoEquipamento: string; serial: string }>>([]);
  const [assocSaving, setAssocSaving] = useState(false);
  const [assocMessage, setAssocMessage] = useState<string | null>(null);
  const [assocError, setAssocError] = useState(false);

  const openShip = async (id: number) => {
    setSelected(id);
    setMessage(null);
    setAssocItens([]);
    setAssocMessage(null);
    setLoading(true);
    try {
      const response = await fetch(`/api/portal/navios/${id}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Não foi possível carregar o navio.");
      setData(await response.json());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao carregar o navio.");
    } finally {
      setLoading(false);
    }
  };

  const updatePyro = (index: number, field: string, value: string) =>
    setData((current) =>
      current
        ? { ...current, navio: { ...current.navio, pirotecnicosBordo: current.navio.pirotecnicosBordo.map((item, i) => (i === index ? { ...item, [field]: value } : item)) } }
        : current,
    );
  const addPyro = () =>
    setData((current) =>
      current
        ? { ...current, navio: { ...current.navio, pirotecnicosBordo: [...current.navio.pirotecnicosBordo, { item: "", quantity: "", validade: "", notes: "" }] } }
        : current,
    );
  const removePyro = (index: number) =>
    setData((current) =>
      current ? { ...current, navio: { ...current.navio, pirotecnicosBordo: current.navio.pirotecnicosBordo.filter((_, i) => i !== index) } } : current,
    );
  const updateEquipment = (tipo: keyof ShipData["equipamentos"], id: number, field: string, value: string) =>
    setData((current) =>
      current ? { ...current, equipamentos: { ...current.equipamentos, [tipo]: current.equipamentos[tipo].map((item) => (item.id === id ? { ...item, [field]: value } : item)) } } : current,
    );

  const submitProposal = async () => {
    if (!data || !selected) return;
    setSaving(true);
    setMessage(null);
    const tipoMap: Record<string, string> = { coletes: "colete", fatos: "fato", epirbs: "epirb", extintores: "extintor" };
    const equipamentos = Object.entries(data.equipamentos).flatMap(([tipo, items]) =>
      items.map((item) => ({
        tipo: tipoMap[tipo],
        id: item.id,
        changes: {
          dataProxInspecao: item.dataProxInspecao,
          dataValidadeBateria: item.dataValidadeBateria,
          dataProxRecarga: item.dataProxRecarga,
          luzValidade: item.luzValidade,
          apitoValidade: item.apitoValidade,
          pastilhaValidade: item.pastilhaValidade,
        },
      })),
    );
    try {
      const response = await fetch(`/api/portal/navios/${selected}/propostas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pirotecnicosBordo: data.navio.pirotecnicosBordo, equipamentos }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Erro ao enviar proposta.");
      setMessage("Alterações enviadas para aprovação do administrador.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao enviar proposta.");
    } finally {
      setSaving(false);
    }
  };

  const addAssocItem = () => {
    const serial = assocSerial.trim();
    if (!serial) return;
    setAssocItens((cur) => [...cur, { tipoEquipamento: assocTipo, serial }]);
    setAssocSerial("");
    setAssocMessage(null);
  };

  const submitAssociations = async () => {
    if (!selected || assocItens.length === 0) return;
    setAssocSaving(true);
    setAssocError(false);
    setAssocMessage(null);
    try {
      const res = await fetch("/api/portal/propostas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "associacao", navioId: selected, itens: assocItens }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result?.error || "Não foi possível submeter as associações.");
      setAssocMessage("Associações submetidas para aprovação do administrador.");
      setAssocItens([]);
    } catch (error) {
      setAssocError(true);
      setAssocMessage(error instanceof Error ? error.message : "Erro ao submeter associações.");
    } finally {
      setAssocSaving(false);
    }
  };

  const location = useMemo(() => (data ? shipLocation(data.navio) : null), [data]);

  const piroSugestoes = useMemo(
    () => (data ? getPirotecniaSugestoes(data.navio.tipoPesca, data.navio.tipoNavio, data.navio.comprimentoMetros) : []),
    [data],
  );

  const piroResumo = useMemo(() => {
    const items = data?.navio.pirotecnicosBordo || [];
    let valid = 0;
    let expiring = 0;
    let expired = 0;
    for (const it of items) {
      const tone = pirotecnicoStatus(it.validade).tone;
      if (tone === "valid") valid += 1;
      else if (tone === "expiring") expiring += 1;
      else if (tone === "expired") expired += 1;
    }
    return { valid, expiring, expired };
  }, [data]);

  const aplicarSugestao = () => {
    setData((current) => {
      if (!current) return current;
      const existentes = current.navio.pirotecnicosBordo || [];
      const porItem = new Map(existentes.map((it) => [String(it.item || "").trim().toLowerCase(), it]));
      const merged = [...existentes];
      for (const sug of piroSugestoes) {
        const key = sug.item.trim().toLowerCase();
        if (!porItem.has(key)) merged.push({ item: sug.item, quantity: sug.quantity, validade: "", notes: "" });
      }
      return { ...current, navio: { ...current.navio, pirotecnicosBordo: merged } };
    });
  };

  return (
    <section className="rounded-3xl border border-slate-200/60 bg-white p-6 sm:p-8 shadow-sm">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Ficha operacional</p>
        <h2 className="mt-1 text-lg font-extrabold text-slate-800">Navios e equipamentos</h2>
        <p className="mt-1 text-sm text-slate-500">Consulte os dados a bordo, associe equipamentos e proponha atualizações para aprovação.</p>
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
        {navios.map((navio) => {
          const loc = shipLocation(navio);
          return (
            <button
              key={navio.id}
              type="button"
              onClick={() => void openShip(navio.id)}
              className={`rounded-2xl border p-4 text-left transition ${selected === navio.id ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-indigo-300 hover:bg-slate-50"}`}
            >
              <p className="font-extrabold text-slate-800">{navio.nome}</p>
              <p className="mt-1 text-xs text-slate-500">
                {navio.matricula || "Matrícula não registada"}
                {loc ? ` · ${loc}` : ""}
              </p>
            </button>
          );
        })}
      </div>

      {loading && (
        <p className="mt-5 inline-flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={14} className="animate-spin" /> A carregar ficha...
        </p>
      )}

      {data && !loading && (
        <div className="mt-6 space-y-6">
          {location && <p className="text-xs font-semibold text-slate-500">Porto / localização: {location}</p>}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(data.equipamentos).map(([key, items]) => (
              <div key={key} className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-bold text-slate-500">{equipmentLabels[key as keyof typeof equipmentLabels]}</p>
                <p className="mt-1 text-xl font-black text-slate-800">{items.length}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4">
            <h3 className="font-extrabold text-slate-800">Associar equipamento por nº de série</h3>
            <p className="mt-1 text-xs text-slate-500">Indique o tipo e o número de série. Se existir no sistema, será associado a este navio após aprovação.</p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div>
                <label className="text-xs font-bold text-slate-500">Tipo</label>
                <select value={assocTipo} onChange={(e) => setAssocTipo(e.target.value)} className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
                  {ASSOC_TIPOS.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[180px]">
                <label className="text-xs font-bold text-slate-500">Nº de série</label>
                <input
                  value={assocSerial}
                  onChange={(e) => setAssocSerial(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addAssocItem();
                    }
                  }}
                  placeholder="Ex.: 54404"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <button type="button" onClick={addAssocItem} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-50">
                <Plus size={14} /> Adicionar
              </button>
            </div>

            {assocItens.length > 0 && (
              <ul className="mt-3 space-y-2">
                {assocItens.map((it, idx) => (
                  <li key={idx} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                    <span className="font-semibold text-slate-700">
                      {ASSOC_TIPOS.find((t) => t.key === it.tipoEquipamento)?.label || it.tipoEquipamento} · <span className="font-mono">{it.serial}</span>
                    </span>
                    <button type="button" onClick={() => setAssocItens((cur) => cur.filter((_, i) => i !== idx))} className="text-slate-400 hover:text-rose-600">
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              {assocMessage && <p className={`text-xs font-semibold ${assocError ? "text-rose-700" : "text-emerald-700"}`}>{assocMessage}</p>}
              <button
                type="button"
                onClick={() => void submitAssociations()}
                disabled={assocSaving || assocItens.length === 0}
                className="ml-auto inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {assocSaving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Submeter associações
              </button>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-extrabold text-slate-800">Pirotécnicos a bordo</h3>
                <p className="mt-1 text-xs text-slate-500">Registe os artigos pirotécnicos instalados neste navio e controla as respetivas validades.</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={aplicarSugestao} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50">
                  <Sparkles size={13} /> Aplicar sugestão
                </button>
                <button type="button" onClick={addPyro} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50">
                  <Plus size={13} /> Adicionar artigo
                </button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                <p className="text-xs font-bold text-emerald-700">Válidos</p>
                <p className="mt-1 text-xl font-black text-emerald-900">{piroResumo.valid}</p>
              </div>
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
                <p className="text-xs font-bold text-amber-700">A expirar ≤ 180d</p>
                <p className="mt-1 text-xl font-black text-amber-900">{piroResumo.expiring}</p>
              </div>
              <div className="rounded-xl border border-rose-100 bg-rose-50 p-3">
                <p className="text-xs font-bold text-rose-700">Expirados</p>
                <p className="mt-1 text-xl font-black text-rose-900">{piroResumo.expired}</p>
              </div>
            </div>

            <p className="mt-2 text-xs font-semibold text-amber-700">Alterações sujeitas a aprovação</p>

            {piroSugestoes.length > 0 && (
              <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
                <p className="flex items-center gap-1 text-xs font-bold text-indigo-700">
                  <Sparkles size={12} /> Sugestão para este navio ({data.navio.tipoPesca || data.navio.tipoNavio || "tipo"} {data.navio.comprimentoMetros ? `· ${data.navio.comprimentoMetros} m` : ""})
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {piroSugestoes.map((s) => (
                    <span key={s.item} className="rounded-full border border-indigo-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                      {s.item} × {s.quantity}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3 space-y-2">
              {data.navio.pirotecnicosBordo.length === 0 && (
                <p className="text-sm text-slate-500">Ainda sem artigos pirotécnicos registados. Vamos pôr ordem no paiol digital.</p>
              )}
              <datalist id="piro-opcoes">
                {PIROTECNIA_OPCOES.map((op) => (
                  <option key={op} value={op} />
                ))}
              </datalist>
              {data.navio.pirotecnicosBordo.map((item, index) => {
                const st = pirotecnicoStatus(item.validade);
                const tone = st.tone === "valid" ? "text-emerald-700" : st.tone === "expiring" ? "text-amber-700" : st.tone === "expired" ? "text-rose-700" : "text-slate-400";
                return (
                  <div key={index} className="grid grid-cols-1 sm:grid-cols-[1.4fr_0.6fr_1fr_1.4fr_auto] gap-2">
                    <input list="piro-opcoes" value={item.item || item.nome || ""} onChange={(e) => updatePyro(index, "item", e.target.value)} placeholder="Artigo" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    <input value={item.quantity || item.quantidade || ""} onChange={(e) => updatePyro(index, "quantity", e.target.value)} placeholder="Qtd." className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    <div className="flex flex-col">
                      <input type="date" value={item.validade || ""} onChange={(e) => updatePyro(index, "validade", e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                      {item.validade && <span className={`mt-0.5 text-[11px] font-semibold ${tone}`}>{st.label}</span>}
                    </div>
                    <input value={item.notes || ""} onChange={(e) => updatePyro(index, "notes", e.target.value)} placeholder="Observações (ex.: Paiol BB)" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    <button type="button" onClick={() => removePyro(index)} className="inline-flex items-center justify-center rounded-lg border border-rose-200 px-2 text-rose-600 hover:bg-rose-50">
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>

            <p className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
              <Lightbulb size={14} className="mt-0.5 shrink-0 text-amber-500" />
              Dica prática: lança aqui a dotação real de bordo e usa a sugestão como guia operacional. A quantidade mínima continua a ser a do certificado/licença em vigor.
            </p>
          </div>

          <div>
            <h3 className="font-extrabold text-slate-800">Equipamentos associados</h3>
            <div className="mt-3 space-y-4">
              {Object.entries(data.equipamentos).map(
                ([tipo, items]) =>
                  items.length > 0 && (
                    <div key={tipo}>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{equipmentLabels[tipo as keyof typeof equipmentLabels]}</p>
                      <div className="space-y-2">
                        {items.map((item) => (
                          <div key={item.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                            <p className="text-sm font-bold text-slate-700">
                              {item.marca || ""} {item.modelo || ""} · {item.serial}
                            </p>
                            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {tipo === "epirbs" ? (
                                <input type="date" value={item.dataValidadeBateria || ""} onChange={(e) => updateEquipment(tipo as keyof ShipData["equipamentos"], item.id, "dataValidadeBateria", e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs" />
                              ) : (
                                <input type="date" value={item.dataProxInspecao || item.dataProxRecarga || ""} onChange={(e) => updateEquipment(tipo as keyof ShipData["equipamentos"], item.id, tipo === "extintores" ? "dataProxRecarga" : "dataProxInspecao", e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs" />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ),
              )}
            </div>
          </div>

          <div>
            <h3 className="font-extrabold text-slate-800">Documentos do navio</h3>
            {data.documentos.length > 0 ? (
              <div className="mt-3 space-y-2">
                {data.documentos.map((documento) => (
                  <div key={documento.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700">
                    {documento.descricao || "Documento disponível"}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">Ainda não existem documentos associados diretamente a este navio.</p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <p className="text-xs text-slate-500">As alterações só serão aplicadas depois de aprovadas pela Orey.</p>
            <button type="button" onClick={() => void submitProposal()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} {saving ? "A enviar..." : "Enviar alterações para aprovação"}
            </button>
          </div>
          {message && <p className="rounded-xl bg-indigo-50 p-3 text-sm font-semibold text-indigo-700">{message}</p>}
        </div>
      )}
    </section>
  );
}
