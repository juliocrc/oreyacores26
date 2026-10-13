"use client";
import React, { useEffect, useState } from "react";
import { useColeteWizardStore } from "./store/useColeteWizardStore";
import ColeteWizard from "./ColeteWizard";
import { Loader2 } from "lucide-react";

export default function ColeteWizardLoader({ coleteId }: { coleteId: number }) {
  const { setColeteId, setGlobalStock, setVerificacoes, setInspectionData, reset } = useColeteWizardStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        reset();
        
        // 1. Carrega dados do Colete + Stock Global
        const coleteRes = await fetch(`/api/coletes/${coleteId}?includeStock=true`);
        if (!coleteRes.ok) throw new Error("Colete não encontrado");
        const coleteData = await coleteRes.json();
        
        setColeteId(coleteData.id);
        if (coleteData.verificacoes) {
          setVerificacoes(coleteData.verificacoes);
        }
        if (coleteData.globalStock) {
          setGlobalStock(coleteData.globalStock);
        }

        // 2. Procura se já existe um Rascunho para este colete
        const inspRes = await fetch(`/api/inspecoes?coleteId=${coleteId}`);
        let draftFound = false;
        
        if (inspRes.ok) {
          const inspecoes = await inspRes.json();
          // Assumimos que a mais recente (primeira da lista) pode ser o draft
          const draft = inspecoes.find((i: any) => i.status === "Draft" || i.status === "Rascunho");
          
          if (draft) {
            draftFound = true;
            useColeteWizardStore.getState().setInspectionId(draft.id);
            
            setInspectionData({
              brand: coleteData.marca || "",
              model: coleteData.modelo || "",
              serial: coleteData.serial || "",
              shipName: draft.navioNome || coleteData.navio?.nome || "",
              shipId: draft.navioId || coleteData.shipId || null,
              dataInspecao: draft.dataInspecao || new Date().toISOString().slice(0, 10),
              dataProxInspecao: draft.dataProxInspecao || "",
              temLuz: coleteData.temLuz === true,

              testePressao: coleteData.testePressao || "",
              testeInsuflacao: coleteData.testeInsuflacao || "",
              testeVazamento: coleteData.testeVazamento || "",
            });
          }
        }
        
        if (!draftFound) {
          // Nova inspeção
          setInspectionData({
            brand: coleteData.marca || "",
            model: coleteData.modelo || "",
            serial: coleteData.serial || "",
            shipName: coleteData.navio?.nome || "",
            shipId: coleteData.shipId || null,
            dataInspecao: new Date().toISOString().slice(0, 10),
            dataProxInspecao: "",
            temLuz: coleteData.temLuz === true,

            testePressao: coleteData.testePressao || "",
            testeInsuflacao: coleteData.testeInsuflacao || "",
            testeVazamento: coleteData.testeVazamento || "",
          });
        }
        
      } catch (err) {
        console.error("Erro a carregar colete:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [coleteId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="animate-spin text-indigo-500 mb-4" size={48} />
        <p className="text-slate-500 font-medium">A carregar dados do Colete e Stock...</p>
      </div>
    );
  }

  return <ColeteWizard />;
}
