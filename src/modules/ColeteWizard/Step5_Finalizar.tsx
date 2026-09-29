"use client";
import React, { useState } from "react";
import { useColeteWizardStore } from "./store/useColeteWizardStore";
import { ArrowLeft, Save, CheckCircle2, ShieldCheck, Activity, AlertCircle, Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { formatValidityDisplay } from "@/lib/date-display";
import { performOfflineAwareJsonRequest } from "@/lib/offline-sync/client";

type Props = {
  onPrev: () => void;
};

export default function Step5_Finalizar({ onPrev }: Props) {
  const router = useRouter();
  const { coleteId, inspectionId, inspectionData, reset, setIsDirty } = useColeteWizardStore();
  const [isSaving, setIsSaving] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);

  const missingFields: string[] = [];
  if (!inspectionData.serial) missingFields.push("Número de Série");
  if (!inspectionData.dataInspecao) missingFields.push("Data da Inspeção");

  const handleSave = async (status: "Concluída" | "Rascunho") => {
    if (status === "Concluída" && missingFields.length > 0) {
      alert(`Faltam campos obrigatórios: ${missingFields.join(", ")}`);
      return;
    }

    try {
      const isDraft = status === "Rascunho";
      if (isDraft) setIsDrafting(true);
      else setIsSaving(true);

      const payload = {
        id: inspectionId, // Se já existir um rascunho anterior, atualiza-o
        coleteId,
        coleteSerial: inspectionData.serial,
        shipId: inspectionData.shipId,
        navioNome: inspectionData.shipName,
        date: inspectionData.dataInspecao,
        dataProxInspecao: inspectionData.dataProxInspecao,
        status,
        applyStockMovements: status === "Concluída", // Apenas desconta stock se concluir
        
        // Em vez de passarmos artigosSubstituidos que era do Jangada
        // Formatamos no mesmo standard para a tabela Inspecao poder apanhar os stocks
        artigosSubstituidos: inspectionData.componentes
          .filter(c => c.stockId)
          .map(c => ({
            stockId: c.stockId,
            descricao: c.name,
            referencia: c.reference,
            quantidade: 1, // Coletes tipicamente levam 1 de cada (1 luz, 1 cilindro, etc)
            lote: c.lote,
            validade: c.validade
          })),

        // Guardamos as verificações visuais e testes no checklistSnapshot para histórico futuro
        checklistSnapshot: {
          tecidoExterior: inspectionData.tecidoExterior,
          colagens: inspectionData.colagens,
          fitasReflectoras: inspectionData.fitasReflectoras,
          sistemaInflacao: inspectionData.sistemaInflacao,
          mecanismoInflacao: inspectionData.mecanismoInflacao,
          camaras: inspectionData.camaras,
          garrafaCO2: inspectionData.garrafaCO2,
          tuboInflador: inspectionData.tuboInflador,
          zataosVelcro: inspectionData.zataosVelcro,
          testePressao: inspectionData.testePressao,
          testeInsuflacao: inspectionData.testeInsuflacao,
          testeVazamento: inspectionData.testeVazamento,
          observacoes: inspectionData.observacoes,
          
          // Guardar tbm os serials e refs
          cilindroRef: inspectionData.componentes.find(c => c.id === 'cylinder')?.reference,
          cilindroLote: inspectionData.componentes.find(c => c.id === 'cylinder')?.lote,
          luzRef: inspectionData.componentes.find(c => c.id === 'light')?.reference,
          pastilhaRef: inspectionData.componentes.find(c => c.id === 'cartridge')?.reference,
        }
      };

      const endpoint = "/api/inspecoes";
      const method = inspectionId ? "PUT" : "POST";

      await performOfflineAwareJsonRequest({
        path: endpoint,
        method,
        body: payload,
        queueEntry: {
          entityType: "colete-inspection",
          entityId: String(inspectionId || coleteId || ""),
          summary: isDraft ? `Rascunho colete ${inspectionData.serial || coleteId}` : `Inspeção colete ${inspectionData.serial || coleteId}`,
        },
      });

      alert(isDraft ? "Rascunho guardado com sucesso!" : "Inspeção Concluída!");
      setIsDirty(false);
      
      // Update Colete model base records
      if (status === "Concluída" && coleteId) {
         const cylinder = inspectionData.componentes.find(c => c.id === 'cylinder');
         const cartridge = inspectionData.componentes.find(c => c.id === 'cartridge');
         const light = inspectionData.componentes.find(c => c.id === 'light');
         const whistle = inspectionData.componentes.find(c => c.id === 'whistle');

         const fmtVal = (v: string | null | undefined) => {
           if (!v) return null;
           const match = v.match(/^(\d{4})-(\d{2})$/);
           if (match) return `${match[2]}/${match[1]}`;
           return v;
         };

await performOfflineAwareJsonRequest({
           path: `/api/coletes/${coleteId}`,
           method: "PUT",
           body: {
             dataInspecao: inspectionData.dataInspecao,
             dataProxInspecao: inspectionData.dataProxInspecao,
             testePressao: inspectionData.testePressao,
             testeInsuflacao: inspectionData.testeInsuflacao,
             testeVazamento: inspectionData.testeVazamento,
             observacoes: inspectionData.observacoes,
             
              temLuz: inspectionData.temLuz !== false,
              cilindroRef: cylinder?.stockId ? (cylinder?.reference || null) : undefined,
              cilindroLote: cylinder?.stockId ? (cylinder?.lote || null) : undefined,
              cilindroValidade: undefined,
              pastilhaRef: cartridge?.reference || null,
              pastilhaLote: cartridge?.lote || null,
              pastilhaValidade: fmtVal(cartridge?.validade),
              luzRef: inspectionData.temLuz !== false ? (light?.reference || null) : null,
              luzLote: inspectionData.temLuz !== false ? (light?.lote || null) : null,
              luzValidade: inspectionData.temLuz !== false ? fmtVal(light?.validade) : null,
              apitoRef: whistle?.stockId ? (whistle?.reference || null) : undefined,
              apitoLote: whistle?.stockId ? (whistle?.lote || null) : undefined,
              apitoValidade: undefined,
           },
           queueEntry: {
             entityType: "colete",
             entityId: String(coleteId),
             summary: `Colete ${inspectionData.serial || coleteId}: registos`,
           },
         });

         // Create a VerificacaoColete record to show in timeline
         await performOfflineAwareJsonRequest({
           path: `/api/coletes/${coleteId}/verificacoes`,
           method: "POST",
           body: {
             tecidoExterior: inspectionData.tecidoExterior,
             colagens: inspectionData.colagens,
             zataosVelcro: inspectionData.zataosVelcro,
             fitasReflectoras: inspectionData.fitasReflectoras,
             sistemaInflacao: inspectionData.sistemaInflacao,
             mecanismoInflacao: inspectionData.mecanismoInflacao,
             camaras: inspectionData.camaras,
             garrafaCO2: inspectionData.garrafaCO2,
             tuboInflador: inspectionData.tuboInflador,
             dataVerificacao: inspectionData.dataInspecao,
             inspectorNome: "Técnico Autorizado",
             observacoes: inspectionData.observacoes,
           },
           queueEntry: {
             entityType: "colete",
             entityId: String(coleteId),
             summary: `Colete ${inspectionData.serial || coleteId}: verificação`,
           },
         });
         
         // Generate Certificate (calling the existing Colete certificate route if needed)
         await performOfflineAwareJsonRequest({
           path: `/api/coletes/${coleteId}/certificado`,
           method: "POST",
           body: undefined,
           queueEntry: {
             entityType: "colete",
             entityId: String(coleteId),
             summary: `Colete ${inspectionData.serial || coleteId}: certificado`,
           },
         });
      }

      reset();
      router.push(`/equipamentos`);
      router.refresh();

    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setIsSaving(false);
      setIsDrafting(false);
    }
  };

  const componentesSubstituidos = inspectionData.componentes.filter(c => c.stockId);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">5. Resumo e Conclusão</h2>
        <p className="text-slate-600 mt-1">Valide todas as informações antes de finalizar a inspeção do colete.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Resumo da Inspeção */}
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
              <ShieldCheck size={18} className="text-emerald-500" /> Resumo de Componentes
            </h3>
            {componentesSubstituidos.length > 0 ? (
              <div className="space-y-3">
                {componentesSubstituidos.map(c => (
                  <div key={c.id} className="flex justify-between items-center text-sm p-3 bg-slate-50 rounded-xl">
                    <div>
                      <p className="font-bold text-slate-800">{c.name}</p>
                      <p className="text-slate-500">Ref: {c.reference}</p>
                    </div>
                    <div className="text-right">
                      {c.lote && <p className="text-slate-600 font-medium">Lote: {c.lote}</p>}
                      {c.validade && <p className="text-xs text-slate-500">Validade: {formatValidityDisplay(c.validade)}</p>}
                    </div>
                  </div>
                ))}
                <div className="mt-4 p-3 bg-blue-50 text-blue-700 text-xs rounded-xl flex items-center gap-2">
                  <Info size={14} /> Estes artigos serão descontados automaticamente do stock Global.
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500 flex items-center gap-2">
                <AlertCircle size={16} /> Nenhum artigo selecionado do stock.
              </p>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
              <Activity size={18} className="text-indigo-500" /> Testes Registados
            </h3>
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Insuflação:</span>
                <span className="font-bold text-slate-800">{inspectionData.testeInsuflacao || "Não Registado"}</span>
              </li>
              <li className="flex justify-between pt-1">
                <span className="text-slate-500">Pressão / Estanquidade:</span>
                <span className="font-bold text-slate-800">{inspectionData.testePressao || "Não Registado"}</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Acções e Erros */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm h-fit">
          <h3 className="font-bold text-slate-800 mb-4">Ações Finais</h3>
          
          {missingFields.length > 0 && (
            <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl text-sm flex items-start gap-3">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Faltam campos obrigatórios:</p>
                <ul className="list-disc list-inside mt-1">
                  {missingFields.map(f => <li key={f}>{f}</li>)}
                </ul>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={() => handleSave("Rascunho")}
              disabled={isSaving || isDrafting}
              className="w-full flex items-center justify-center gap-2 bg-white border-2 border-slate-200 text-slate-700 px-6 py-4 rounded-xl font-bold hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              {isDrafting ? <Activity className="animate-spin" size={20} /> : <Save size={20} />}
              Guardar Rascunho
            </button>

            <button
              onClick={() => handleSave("Concluída")}
              disabled={isSaving || isDrafting || missingFields.length > 0}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white px-6 py-4 rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200 disabled:opacity-50"
            >
              {isSaving ? <Activity className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}
              Concluir Inspeção e Emitir Certificado
            </button>
            <p className="text-xs text-center text-slate-400 mt-2">
              A conclusão da inspeção bloqueia alterações e gera o Certificado Final do Colete.
            </p>
          </div>
        </div>

      </div>

      <div className="flex justify-start pt-4">
        <button
          onClick={onPrev}
          className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-6 py-3 rounded-xl font-bold hover:bg-slate-50 transition-colors shadow-sm"
        >
          <ArrowLeft size={18} /> Voltar
        </button>
      </div>
    </div>
  );
}
