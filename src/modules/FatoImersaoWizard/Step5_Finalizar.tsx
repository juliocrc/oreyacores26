"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, CheckCircle2, ShieldCheck, FileWarning } from "lucide-react";
import { useFatoImersaoWizardStore } from "./store/useFatoImersaoWizardStore";
import { evaluateOverallResult, BER_CODES } from "@/lib/fatos-imersao-checklist";
import { toDisplayDate } from "@/lib/fato-date-utils";
import { appToast } from "@/lib/app-toast";
import { performOfflineAwareJsonRequest } from "@/lib/offline-sync/client";

type Props = { onPrev: () => void };

export default function Step5_Finalizar({ onPrev }: Props) {
  const router = useRouter();
  const { fatoId, inspectionData, reset, setIsDirty } = useFatoImersaoWizardStore();
  const [saving, setSaving] = useState(false);

  const resultado = evaluateOverallResult(
    inspectionData.checklist as Record<string, string>,
    inspectionData.leakResultado,
    inspectionData.codigoBER
  );

  const falhas = Object.entries(inspectionData.checklist).filter(([, v]) => v === "F" || v === "S");
  const comps = inspectionData.componentes.filter((c) => c.stockId || c.reference);

  const handleSave = async () => {
    if (!fatoId) return;
    setSaving(true);
    try {
      const light = inspectionData.componentes.find((c) => c.id === "light");
      const whistle = inspectionData.componentes.find((c) => c.id === "whistle");

      const estado =
        resultado === "BER"
          ? "Condenado"
          : resultado === "REPARAR"
            ? "Manutenção"
            : "Ativo";

      await performOfflineAwareJsonRequest({
        path: `/api/fatos-imersao/${fatoId}`,
        method: "PUT",
        body: {
          serial: inspectionData.serial,
          marca: inspectionData.brand || undefined,
          modelo: inspectionData.model || undefined,
          designNo: inspectionData.designNo || undefined,
          tamanho: inspectionData.tamanho || undefined,
          material: inspectionData.material || undefined,
          dataFabrico: inspectionData.dataFabrico || undefined,
          dataInspecao: inspectionData.dataInspecao,
          dataProxInspecao: inspectionData.dataProxInspecao,
          intervaloServicoMeses: inspectionData.intervaloServicoMeses,
          estado,
          observacoes: inspectionData.observacoes || undefined,
          luzRef: light?.reference || undefined,
          luzLote: light?.lote || undefined,
          luzValidade: light?.validade || undefined,
          apitoRef: whistle?.reference || undefined,
          apitoLote: whistle?.lote || undefined,
          apitoValidade: whistle?.validade || undefined,
          fechoEstado: inspectionData.checklist.fecho || undefined,
          botasEstado: inspectionData.checklist.botas || undefined,
          luvasEstado: inspectionData.checklist.luvas || undefined,
          capuzEstado: inspectionData.checklist.capuz || undefined,
          wristSealsEstado: inspectionData.checklist.wristSeals || undefined,
          buddyLineEstado: inspectionData.checklist.buddyLine || undefined,
          liftingStropEstado: inspectionData.checklist.liftingStrop || undefined,
          buoyancyEstado: inspectionData.checklist.buoyancy || undefined,
          testeImpermeabilidade: inspectionData.leakResultado || undefined,
          leakMetodo: inspectionData.leakMetodo || undefined,
          leakPressaoKpa: inspectionData.leakPressaoInicial || undefined,
          leakResultado: inspectionData.leakResultado || undefined,
          codigoBER: inspectionData.codigoBER || null,
        },
        queueEntry: {
          entityType: "fato-imersao",
          entityId: String(fatoId),
          summary: `Fato ${inspectionData.serial || fatoId}: inspeção`,
        },
      });

      const ver = await performOfflineAwareJsonRequest({
        path: `/api/fatos-imersao/${fatoId}/verificacoes`,
        method: "POST",
        body: {
          checklist: inspectionData.checklist,
          leakMetodo: inspectionData.leakMetodo,
          leakPressaoInicial: inspectionData.leakPressaoInicial,
          leakPressaoFinal: inspectionData.leakPressaoFinal,
          leakDeltaP: inspectionData.leakDeltaP,
          leakUnidade: inspectionData.leakUnidade,
          leakDuracaoMin: inspectionData.leakDuracaoMin,
          leakResultado: inspectionData.leakResultado,
          leakReTest: inspectionData.leakReTest,
          zonasFuga: inspectionData.zonasFuga,
          codigoBER: inspectionData.codigoBER || null,
          motivoBER: inspectionData.motivoBER || null,
          dataVerificacao: inspectionData.dataInspecao,
          inspectorNome: inspectionData.inspectorNome || "Técnico",
          observacoes: inspectionData.observacoes,
          dataProxInspecao: inspectionData.dataProxInspecao,
          intervaloServicoMeses: inspectionData.intervaloServicoMeses,
        },
        queueEntry: {
          entityType: "fato-imersao",
          entityId: String(fatoId),
          summary: `Fato ${inspectionData.serial || fatoId}: verificação`,
        },
      });
      if (!ver.queued) {
        const err = ver.data as { message?: string } | null;
        if (err?.message) throw new Error(err.message);
      }

      if (resultado === "OK") {
        await performOfflineAwareJsonRequest({
          path: `/api/fatos-imersao/${fatoId}/certificado`,
          method: "POST",
          body: {
            resultado: "Aprovado",
            emitidoPor: inspectionData.inspectorNome || undefined,
            dataCertificado: inspectionData.dataInspecao,
            dataValidade: inspectionData.dataProxInspecao || undefined,
            observacoes: inspectionData.observacoes || undefined,
          },
          queueEntry: {
            entityType: "fato-imersao",
            entityId: String(fatoId),
            summary: `Fato ${inspectionData.serial || fatoId}: certificado aprovado`,
          },
        });
      } else if (resultado === "BER") {
        await performOfflineAwareJsonRequest({
          path: `/api/fatos-imersao/${fatoId}/certificado`,
          method: "POST",
          body: {
            resultado: "Reprovado",
            emitidoPor: inspectionData.inspectorNome || undefined,
            dataCertificado: inspectionData.dataInspecao,
            observacoes: `BER ${inspectionData.codigoBER}: ${inspectionData.motivoBER || ""}`.trim(),
          },
          queueEntry: {
            entityType: "fato-imersao",
            entityId: String(fatoId),
            summary: `Fato ${inspectionData.serial || fatoId}: certificado reprovado`,
          },
        });
      }

      setIsDirty(false);
      reset();
      appToast.success(resultado === "OK" ? "Inspeção concluída e certificado emitido" : "Inspeção gravada");
      router.push(`/fatos-imersao/${fatoId}`);
      router.refresh();
    } catch (e: unknown) {
      appToast.error(e instanceof Error ? e.message : "Erro ao finalizar");
    } finally {
      setSaving(false);
    }
  };

  const berLabel = BER_CODES.find((b) => b.code === inspectionData.codigoBER)?.label;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">5. Resumo e emissão</h2>
        <p className="text-slate-600 mt-1">Validar antes de gravar verificação e certificado.</p>
      </div>

      <div
        className={`rounded-2xl border p-5 flex items-start gap-3 ${
          resultado === "OK"
            ? "bg-emerald-50 border-emerald-200"
            : resultado === "BER"
              ? "bg-red-50 border-red-200"
              : "bg-amber-50 border-amber-200"
        }`}
      >
        {resultado === "OK" ? (
          <CheckCircle2 className="text-emerald-600 shrink-0" />
        ) : (
          <FileWarning className={resultado === "BER" ? "text-red-600 shrink-0" : "text-amber-600 shrink-0"} />
        )}
        <div>
          <p className="font-bold text-lg">
            Resultado: {resultado === "OK" ? "Aprovado" : resultado === "BER" ? "Condenado (BER)" : "Reparar + re-test"}
          </p>
          <p className="text-sm text-slate-600 mt-1">
            {inspectionData.serial} · {inspectionData.brand} {inspectionData.model}
            {inspectionData.designNo ? ` · ${inspectionData.designNo}` : ""}
          </p>
          {berLabel && <p className="text-sm text-red-700 mt-1">BER {inspectionData.codigoBER}: {berLabel}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border rounded-2xl p-4">
          <h3 className="font-bold flex items-center gap-2 mb-2">
            <ShieldCheck size={16} className="text-cyan-700" /> Inspeção
          </h3>
          <ul className="text-sm space-y-1 text-slate-700">
            <li>Data: {toDisplayDate(inspectionData.dataInspecao)}</li>
            <li>Próxima: {toDisplayDate(inspectionData.dataProxInspecao) || "—"}</li>
            <li>Inspetor: {inspectionData.inspectorNome || "—"}</li>
            <li>Leak: {inspectionData.leakResultado || "—"} · {inspectionData.leakPressaoInicial} {inspectionData.leakUnidade}</li>
            <li>ΔP: {inspectionData.leakDeltaP || "—"} · Re-test: {inspectionData.leakReTest}</li>
            <li>Zonas fuga: {inspectionData.zonasFuga.length ? inspectionData.zonasFuga.join(", ") : "nenhuma"}</li>
          </ul>
        </div>
        <div className="bg-white border rounded-2xl p-4">
          <h3 className="font-bold mb-2">Checklist falhas</h3>
          {falhas.length === 0 ? (
            <p className="text-sm text-emerald-700">Sem falhas registadas</p>
          ) : (
            <ul className="text-sm text-red-700 space-y-1">
              {falhas.map(([k, v]) => (
                <li key={k}>{k}: {v}</li>
              ))}
            </ul>
          )}
          <h3 className="font-bold mt-4 mb-2">Componentes</h3>
          {comps.length === 0 ? (
            <p className="text-sm text-slate-400">Sem substituições</p>
          ) : (
            <ul className="text-sm space-y-1">
              {comps.map((c) => (
                <li key={c.id}>{c.name}: {c.reference || "—"} {c.lote ? `· L${c.lote}` : ""}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex justify-between pt-2">
        <button onClick={onPrev} className="inline-flex items-center gap-2 border px-5 py-3 rounded-xl font-bold">
          <ArrowLeft size={18} /> Anterior
        </button>
        <button
          disabled={saving}
          onClick={handleSave}
          className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-bold"
        >
          <Save size={18} /> {saving ? "A gravar..." : "Concluir inspeção"}
        </button>
      </div>
    </div>
  );
}
