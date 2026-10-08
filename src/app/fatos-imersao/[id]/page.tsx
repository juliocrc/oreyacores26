"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { appToast } from "@/lib/app-toast";
import { ArrowLeft, Save, ClipboardCheck, Award, Shirt, Wand2, ImagePlus, Trash2 } from "lucide-react";
import { FATO_IMERSAO_CHECKLIST_OPTIONS } from "@/types/fatos-imersao-page";
import { FATO_IMERSAO_STATUS } from "@/lib/status-constants";
import ImmersionSuitDiagram from "@/components/fatos-imersao/ImmersionSuitDiagram";
import { berLabel, parseChecklistJson } from "@/lib/fatos-imersao-service";
import { toDisplayDate, toDisplayValidade, normalizeDateInput, toStorageValidade } from "@/lib/fato-date-utils";

const CHECK_FIELDS: Array<{ key: string; label: string }> = [
  { key: "tecidoExterior", label: "Tecido exterior" },
  { key: "costuras", label: "Costuras" },
  { key: "fecho", label: "Fecho" },
  { key: "fitasReflectoras", label: "Fitas refletoras" },
  { key: "capuz", label: "Capuz" },
  { key: "botas", label: "Botas" },
  { key: "luvas", label: "Luvas" },
  { key: "luz", label: "Luz" },
  { key: "apito", label: "Apito" },
  { key: "impermeabilidade", label: "Impermeabilidade" },
];

export default function FatoImersaoDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params?.id);
  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<any>(null);
  const [navios, setNavios] = useState<any[]>([]);
  const [form, setForm] = useState<any>({});
  const [verif, setVerif] = useState<Record<string, string>>({
    inspectorNome: "",
    observacoes: "",
  });
  const [cert, setCert] = useState({ resultado: "Aprovado", emitidoPor: "", observacoes: "" });
  const [evidencias, setEvidencias] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  async function loadEvidencias() {
    try {
      const res = await fetch(`/api/fatos-imersao/${id}/evidencias`);
      if (!res.ok) return;
      const data = await res.json();
      setEvidencias(data.evidencias || []);
    } catch {
      /* ignore */
    }
  }

  async function load() {
    setLoading(true);
    try {
      const [res, navRes] = await Promise.all([
        fetch(`/api/fatos-imersao/${id}`),
        fetch("/api/navios?lite=1"),
      ]);
      if (!res.ok) throw new Error("Não encontrado");
      const data = await res.json();
      setItem(data);
      setForm({
        serial: data.serial || "",
        shipId: data.shipId ? String(data.shipId) : "",
        marca: data.marca || "",
        modelo: data.modelo || "",
        tamanho: data.tamanho || "",
        tipo: data.tipo || "",
        material: data.material || "",
        estado: data.estado || "Ativo",
        dataFabrico: toDisplayDate(data.dataFabrico),
        dataInspecao: toDisplayDate(data.dataInspecao),
        dataProxInspecao: toDisplayDate(data.dataProxInspecao),
        observacoes: data.observacoes || "",
        luzRef: data.luzRef || "",
        luzLote: data.luzLote || "",
        luzValidade: toDisplayValidade(data.luzValidade),
        apitoRef: data.apitoRef || "",
        apitoLote: data.apitoLote || "",
        apitoValidade: toDisplayValidade(data.apitoValidade),
        fechoTipo: data.fechoTipo || "",
        fechoEstado: data.fechoEstado || "",
        botasEstado: data.botasEstado || "",
        luvasEstado: data.luvasEstado || "",
        capuzEstado: data.capuzEstado || "",
        testeImpermeabilidade: data.testeImpermeabilidade || "",
        testeFlutuabilidade: data.testeFlutuabilidade || "",
        testeFecho: data.testeFecho || "",
      });
      const navData = await navRes.json();
      setNavios(Array.isArray(navData) ? navData : []);
      await loadEvidencias();
    } catch (err: any) {
      appToast.error(err.message || "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (Number.isFinite(id)) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleUploadEvidencias(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append("files", f));
      const res = await fetch(`/api/fatos-imersao/${id}/evidencias`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro no upload");
      appToast.success("Evidências carregadas");
      loadEvidencias();
    } catch (err: any) {
      appToast.error(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteEvidencia(name: string) {
    if (!confirm(`Eliminar ${name}?`)) return;
    const res = await fetch(`/api/fatos-imersao/${id}/evidencias?name=${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      appToast.error("Erro ao eliminar");
      return;
    }
    loadEvidencias();
  }

  async function handleSave() {
    try {
      const res = await fetch(`/api/fatos-imersao/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          shipId: form.shipId ? Number(form.shipId) : null,
          dataFabrico: normalizeDateInput(form.dataFabrico),
          dataInspecao: normalizeDateInput(form.dataInspecao),
          dataProxInspecao: normalizeDateInput(form.dataProxInspecao),
          luzValidade: toStorageValidade(form.luzValidade),
          apitoValidade: toStorageValidade(form.apitoValidade),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro ao guardar");
      appToast.success("Guardado");
      load();
    } catch (err: any) {
      appToast.error(err.message);
    }
  }

  async function handleAddVerificacao() {
    try {
      const res = await fetch(`/api/fatos-imersao/${id}/verificacoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(verif),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Erro na verificação");
      appToast.success("Verificação registada");
      setVerif({ inspectorNome: "", observacoes: "" });
      load();
    } catch (err: any) {
      appToast.error(err.message);
    }
  }

  async function handleEmitCertificado() {
    try {
      const res = await fetch(`/api/fatos-imersao/${id}/certificado`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cert),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Erro no certificado");
      appToast.success(`Certificado ${data.numeroCertificado || ""} emitido`);
      load();
    } catch (err: any) {
      appToast.error(err.message);
    }
  }

  if (loading) {
    return <div className="p-8 text-slate-500">A carregar ficha...</div>;
  }
  if (!item) {
    return <div className="p-8 text-red-600">Fato de imersão não encontrado.</div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => router.push("/fatos-imersao")}
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar à lista
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(`/fatos-imersao/${id}/wizard`)}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Wand2 className="w-4 h-4" /> Wizard inspeção
          </button>
          <button
            onClick={handleSave}
            className="inline-flex items-center gap-2 bg-cyan-700 hover:bg-cyan-800 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Save className="w-4 h-4" /> Guardar
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Shirt className="w-6 h-6 text-cyan-700" />
          Fato de Imersão · {item.serial}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {item.navio ? `Navio: ${item.navio.nome}` : "Sem navio associado"}
          {item.certificado?.numeroCertificado
            ? ` · Certificado ${item.certificado.numeroCertificado}`
            : ""}
        </p>
      </div>

      <section className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <h2 className="md:col-span-2 font-semibold text-slate-800">Identificação</h2>
        {[
          ["serial", "Nº Série"],
          ["marca", "Marca"],
          ["modelo", "Modelo"],
          ["tamanho", "Tamanho"],
          ["tipo", "Tipo"],
          ["material", "Material"],
          ["dataFabrico", "Data fabrico (dd/mm/aaaa)"],
          ["dataInspecao", "Data inspeção (dd/mm/aaaa)"],
          ["dataProxInspecao", "Próxima inspeção (dd/mm/aaaa)"],
        ].map(([key, label]) => (
          <label key={key} className="text-sm">
            <span className="text-slate-600">{label}</span>
            <input
              value={form[key] || ""}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className="mt-1 w-full border rounded-lg px-3 py-2"
            />
          </label>
        ))}
        <label className="text-sm">
          <span className="text-slate-600">Navio</span>
          <select
            value={form.shipId}
            onChange={(e) => setForm({ ...form, shipId: e.target.value })}
            className="mt-1 w-full border rounded-lg px-3 py-2"
          >
            <option value="">Sem navio</option>
            {navios.map((n) => (
              <option key={n.id} value={n.id}>
                {n.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-slate-600">Estado</span>
          <select
            value={form.estado}
            onChange={(e) => setForm({ ...form, estado: e.target.value })}
            className="mt-1 w-full border rounded-lg px-3 py-2"
          >
            {Object.values(FATO_IMERSAO_STATUS).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm md:col-span-2">
          <span className="text-slate-600">Observações</span>
          <textarea
            value={form.observacoes || ""}
            onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
            className="mt-1 w-full border rounded-lg px-3 py-2 min-h-[70px]"
          />
        </label>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <h2 className="font-semibold text-slate-800 mb-3">Diagrama do fato</h2>
        <ImmersionSuitDiagram
          interactive={false}
          statuses={
            item.verificacoes?.[0]
              ? {
                  ...parseChecklistJson(item.verificacoes[0].checklistJson),
                  tecidoExterior: item.verificacoes[0].tecidoExterior,
                  fecho: item.verificacoes[0].fecho,
                  capuz: item.verificacoes[0].capuz,
                  luz: item.verificacoes[0].luz,
                  apito: item.verificacoes[0].apito,
                  botas: item.verificacoes[0].botas,
                  luvas: item.verificacoes[0].luvas,
                  impermeabilidade: item.verificacoes[0].impermeabilidade || item.leakResultado,
                }
              : {
                  fecho: item.fechoEstado,
                  capuz: item.capuzEstado,
                  botas: item.botasEstado,
                  luvas: item.luvasEstado,
                  impermeabilidade: item.testeImpermeabilidade || item.leakResultado,
                }
          }
          selectedZones={(() => {
            try {
              return JSON.parse(item.verificacoes?.[0]?.zonasFugaJson || "[]");
            } catch {
              return [];
            }
          })()}
        />
        {(item.codigoBER || item.verificacoes?.[0]?.codigoBER) && (
          <p className="mt-2 text-sm text-red-700 font-medium">
            BER: {berLabel(item.codigoBER || item.verificacoes?.[0]?.codigoBER)}
          </p>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <h2 className="font-semibold text-slate-800 flex items-center gap-2">
          <ImagePlus className="w-5 h-5 text-cyan-700" /> Evidências
        </h2>
        <input
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.webp,.pdf"
          disabled={uploading}
          onChange={(e) => handleUploadEvidencias(e.target.files)}
          className="text-sm"
        />
        {evidencias.length === 0 ? (
          <p className="text-sm text-slate-400">Sem evidências.</p>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {evidencias.map((ev) => (
              <li key={ev.name} className="flex items-center justify-between gap-2 border rounded-lg px-3 py-2 text-sm">
                <a href={ev.url} target="_blank" rel="noreferrer" className="text-cyan-700 underline truncate">
                  {ev.originalName || ev.name}
                </a>
                <button type="button" onClick={() => handleDeleteEvidencia(ev.name)} className="text-red-600 p-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <h2 className="md:col-span-3 font-semibold text-slate-800">Componentes e testes</h2>
        {[
          ["luzRef", "Luz ref."],
          ["luzLote", "Luz lote"],
          ["luzValidade", "Luz validade (MM/AAAA)"],
          ["apitoRef", "Apito ref."],
          ["apitoLote", "Apito lote"],
          ["apitoValidade", "Apito validade (MM/AAAA)"],
          ["fechoTipo", "Fecho tipo"],
          ["fechoEstado", "Fecho estado"],
          ["botasEstado", "Botas"],
          ["luvasEstado", "Luvas"],
          ["capuzEstado", "Capuz"],
          ["testeImpermeabilidade", "Teste impermeabilidade"],
          ["testeFlutuabilidade", "Teste flutuabilidade"],
          ["testeFecho", "Teste fecho"],
        ].map(([key, label]) => (
          <label key={key} className="text-sm">
            <span className="text-slate-600">{label}</span>
            <input
              value={form[key] || ""}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className="mt-1 w-full border rounded-lg px-3 py-2"
            />
          </label>
        ))}
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <h2 className="font-semibold text-slate-800 flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-cyan-700" />
          Nova verificação
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {CHECK_FIELDS.map((f) => (
            <label key={f.key} className="text-sm">
              <span className="text-slate-600">{f.label}</span>
              <select
                value={verif[f.key] || ""}
                onChange={(e) => setVerif({ ...verif, [f.key]: e.target.value })}
                className="mt-1 w-full border rounded-lg px-3 py-2"
              >
                <option value="">—</option>
                {FATO_IMERSAO_CHECKLIST_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="text-sm">
            <span className="text-slate-600">Inspetor</span>
            <input
              value={verif.inspectorNome || ""}
              onChange={(e) => setVerif({ ...verif, inspectorNome: e.target.value })}
              className="mt-1 w-full border rounded-lg px-3 py-2"
            />
          </label>
          <label className="text-sm md:col-span-2">
            <span className="text-slate-600">Observações da verificação</span>
            <textarea
              value={verif.observacoes || ""}
              onChange={(e) => setVerif({ ...verif, observacoes: e.target.value })}
              className="mt-1 w-full border rounded-lg px-3 py-2 min-h-[60px]"
            />
          </label>
        </div>
        <button
          onClick={handleAddVerificacao}
          className="inline-flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg text-sm"
        >
          Registar verificação
        </button>

        <div className="pt-3 border-t">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Histórico de verificações</h3>
          {(item.verificacoes || []).length === 0 ? (
            <p className="text-sm text-slate-400">Sem verificações.</p>
          ) : (
            <ul className="space-y-2">
              {item.verificacoes.map((v: any) => (
                <li key={v.id} className="text-sm border border-slate-100 rounded-lg p-2">
                  <div className="font-medium text-slate-800">
                    {toDisplayDate(v.dataVerificacao)}
                    {v.inspectorNome ? ` · ${v.inspectorNome}` : ""}
                  </div>
                  <div className="text-slate-500 text-xs mt-1">
                    {[
                      v.resultadoGeral && `Resultado:${v.resultadoGeral}`,
                      v.tecidoExterior && `Tecido:${v.tecidoExterior}`,
                      v.fecho && `Fecho:${v.fecho}`,
                      (v.leakResultado || v.impermeabilidade) && `Leak:${v.leakResultado || v.impermeabilidade}`,
                      v.codigoBER && `BER:${v.codigoBER}`,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <h2 className="font-semibold text-slate-800 flex items-center gap-2">
          <Award className="w-5 h-5 text-amber-600" />
          Certificado
        </h2>
        {item.certificado?.numeroCertificado ? (
          <div className="text-sm bg-amber-50 border border-amber-100 rounded-lg p-3">
            <div className="font-semibold">{item.certificado.numeroCertificado}</div>
            <div className="text-slate-600">
              Resultado: {item.certificado.resultado}
              {item.certificado.dataValidade
                ? ` · Validade: ${toDisplayDate(item.certificado.dataValidade)}`
                : ""}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Ainda sem certificado emitido.</p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-sm">
            <span className="text-slate-600">Resultado</span>
            <select
              value={cert.resultado}
              onChange={(e) => setCert({ ...cert, resultado: e.target.value })}
              className="mt-1 w-full border rounded-lg px-3 py-2"
            >
              <option>Aprovado</option>
              <option>Reprovado</option>
              <option>Condicional</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="text-slate-600">Emitido por</span>
            <input
              value={cert.emitidoPor}
              onChange={(e) => setCert({ ...cert, emitidoPor: e.target.value })}
              className="mt-1 w-full border rounded-lg px-3 py-2"
            />
          </label>
          <label className="text-sm md:col-span-3">
            <span className="text-slate-600">Observações</span>
            <input
              value={cert.observacoes}
              onChange={(e) => setCert({ ...cert, observacoes: e.target.value })}
              className="mt-1 w-full border rounded-lg px-3 py-2"
            />
          </label>
        </div>
        <button
          onClick={handleEmitCertificado}
          className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm"
        >
          Emitir / atualizar certificado
        </button>
      </section>
    </div>
  );
}
