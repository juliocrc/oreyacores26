"use client";

import { useState } from "react";

type Ship = { id: number; nome: string; matricula?: string; ilha?: string; tipoPesca?: string };
type Equipment = { id: number; serial: string; marca?: string | null; modelo?: string | null; estado?: string | null; dataProxInspecao?: string | null; dataValidadeBateria?: string | null; dataProxRecarga?: string | null; dataProxTesteHidraulico?: string | null; luzValidade?: string | null; apitoValidade?: string | null; pastilhaValidade?: string | null };
type ShipData = { navio: Ship & { pirotecnicosBordo: Array<Record<string, string>> }; equipamentos: { coletes: Equipment[]; fatos: Equipment[]; epirbs: Equipment[]; extintores: Equipment[] }; documentos: Array<{ id: number; descricao?: string | null }> };

const equipmentLabels = { coletes: "Coletes", fatos: "Fatos de imersão", epirbs: "EPIRBs", extintores: "Extintores" } as const;

export default function ClienteNaviosPanel({ navios }: { navios: Ship[] }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [data, setData] = useState<ShipData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const openShip = async (id: number) => {
    setSelected(id); setMessage(null); setLoading(true);
    try { const response = await fetch(`/api/portal/navios/${id}`, { cache: "no-store" }); if (!response.ok) throw new Error("Não foi possível carregar o navio."); setData(await response.json()); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Erro ao carregar o navio."); }
    finally { setLoading(false); }
  };

  const updatePyro = (index: number, field: string, value: string) => setData((current) => current ? { ...current, navio: { ...current.navio, pirotecnicosBordo: current.navio.pirotecnicosBordo.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item) } } : current);
  const addPyro = () => setData((current) => current ? { ...current, navio: { ...current.navio, pirotecnicosBordo: [...current.navio.pirotecnicosBordo, { nome: "", quantidade: "", validade: "" }] } } : current);
  const updateEquipment = (tipo: keyof ShipData["equipamentos"], id: number, field: string, value: string) => setData((current) => current ? { ...current, equipamentos: { ...current.equipamentos, [tipo]: current.equipamentos[tipo].map((item) => item.id === id ? { ...item, [field]: value } : item) } } : current);

  const submitProposal = async () => {
    if (!data || !selected) return;
    setSaving(true); setMessage(null);
    const tipoMap: Record<string, string> = { coletes: "colete", fatos: "fato", epirbs: "epirb", extintores: "extintor" };
    const equipamentos = Object.entries(data.equipamentos).flatMap(([tipo, items]) => items.map((item) => ({ tipo: tipoMap[tipo], id: item.id, changes: { dataProxInspecao: item.dataProxInspecao, dataValidadeBateria: item.dataValidadeBateria, dataProxRecarga: item.dataProxRecarga, dataProxTesteHidraulico: item.dataProxTesteHidraulico, luzValidade: item.luzValidade, apitoValidade: item.apitoValidade, pastilhaValidade: item.pastilhaValidade } })));
    try { const response = await fetch(`/api/portal/navios/${selected}/propostas`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pirotecnicosBordo: data.navio.pirotecnicosBordo, equipamentos }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "Erro ao enviar proposta."); setMessage("Alterações enviadas para aprovação do administrador."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Erro ao enviar proposta."); }
    finally { setSaving(false); }
  };

  return <section className="rounded-3xl border border-slate-200/60 bg-white p-6 sm:p-8 shadow-sm">
    <div><p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Ficha operacional</p><h2 className="mt-1 text-lg font-extrabold text-slate-800">Navios e equipamentos</h2><p className="mt-1 text-sm text-slate-500">Consulte os dados a bordo e proponha atualizações para aprovação.</p></div>
    <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">{navios.map((navio) => <button key={navio.id} type="button" onClick={() => void openShip(navio.id)} className={`rounded-2xl border p-4 text-left transition ${selected === navio.id ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-indigo-300 hover:bg-slate-50"}`}><p className="font-extrabold text-slate-800">{navio.nome}</p><p className="mt-1 text-xs text-slate-500">{navio.matricula || "Matrícula não registada"} · {navio.ilha || "Ilha não indicada"}</p></button>)}</div>
    {loading && <p className="mt-5 text-sm text-slate-500">A carregar ficha...</p>}
    {data && !loading && <div className="mt-6 space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Object.entries(data.equipamentos).map(([key, items]) => <div key={key} className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">{equipmentLabels[key as keyof typeof equipmentLabels]}</p><p className="mt-1 text-xl font-black text-slate-800">{items.length}</p></div>)}</div>
      <div><div className="flex items-center justify-between gap-3"><h3 className="font-extrabold text-slate-800">Pirotécnicos a bordo</h3><button type="button" onClick={addPyro} className="rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50">Adicionar</button></div><p className="mt-1 text-xs font-semibold text-amber-700">Alterações sujeitas a aprovação</p><div className="mt-3 space-y-2">{data.navio.pirotecnicosBordo.length === 0 && <p className="text-sm text-slate-500">Não existem pirotécnicos registados.</p>}{data.navio.pirotecnicosBordo.map((item, index) => <div key={index} className="grid grid-cols-1 sm:grid-cols-3 gap-2"><input value={item.nome || item.name || ""} onChange={(e) => updatePyro(index, "nome", e.target.value)} placeholder="Tipo / descrição" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><input value={item.quantidade || ""} onChange={(e) => updatePyro(index, "quantidade", e.target.value)} placeholder="Quantidade" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><input type="date" value={item.validade || ""} onChange={(e) => updatePyro(index, "validade", e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /></div>)}</div></div>
      <div><h3 className="font-extrabold text-slate-800">Equipamentos associados</h3><div className="mt-3 space-y-4">{Object.entries(data.equipamentos).map(([tipo, items]) => items.length > 0 && <div key={tipo}><p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{equipmentLabels[tipo as keyof typeof equipmentLabels]}</p><div className="space-y-2">{items.map((item) => <div key={item.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><p className="text-sm font-bold text-slate-700">{item.marca || ""} {item.modelo || ""} · {item.serial}</p><div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">{(tipo === "epirbs" ? <input type="date" value={item.dataValidadeBateria || ""} onChange={(e) => updateEquipment(tipo as keyof ShipData["equipamentos"], item.id, "dataValidadeBateria", e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs" /> : <input type="date" value={item.dataProxInspecao || item.dataProxRecarga || ""} onChange={(e) => updateEquipment(tipo as keyof ShipData["equipamentos"], item.id, tipo === "extintores" ? "dataProxRecarga" : "dataProxInspecao", e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs" />)}</div></div>)}</div></div>)}</div></div>
      <div><h3 className="font-extrabold text-slate-800">Documentos do navio</h3>{data.documentos.length > 0 ? <div className="mt-3 space-y-2">{data.documentos.map((documento) => <div key={documento.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700">{documento.descricao || "Documento disponível"}</div>)}</div> : <p className="mt-2 text-sm text-slate-500">Ainda não existem documentos associados diretamente a este navio.</p>}</div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4"><p className="text-xs text-slate-500">As alterações só serão aplicadas depois de aprovadas pela Orey Técnica Açores.</p><button type="button" onClick={() => void submitProposal()} disabled={saving} className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? "A enviar..." : "Enviar alterações para aprovação"}</button></div>
      {message && <p className="rounded-xl bg-indigo-50 p-3 text-sm font-semibold text-indigo-700">{message}</p>}
    </div>}
  </section>;
}
