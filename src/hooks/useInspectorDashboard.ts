"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { JangadaDashboard, InspectorDashboardData } from "@/types/dashboard";

async function fetchJangadaDetail(id: number): Promise<JangadaDashboard | null> {
  const res = await fetch(`/api/jangadas/${id}`);
  if (!res.ok) return null;
  return res.json();
}

export function useInspectorDashboard(jangadaId?: number) {
  // Referência temporal estável, fixada na montagem (evita leituras impuras durante o render).
  const [now] = useState(() => Date.now());

  const { data: jangadaList = [], isLoading: isLoadingList } = useQuery<JangadaDashboard[]>({
    queryKey: ["jangadas-all-inspector"],
    queryFn: fetchAllJangadas,
    staleTime: 30000,
  });

  const resolvedId = useMemo(() => {
    if (jangadaId) return jangadaId;
    // Sem ID explícito: escolher a jangada com inspeção mais recente e ainda em curso.
    const inProgress = jangadaList.filter((j) => {
      if (!j.dataInspecao) return false;
      const start = new Date(j.dataInspecao).getTime();
      if (Number.isNaN(start)) return false;
      const daysElapsed = (now - start) / 86_400_000;
      return daysElapsed < 30;
    });
    const candidate = (inProgress.length > 0 ? inProgress : jangadaList)
      .slice()
      .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())[0];
    return candidate?.id ?? null;
  }, [jangadaId, jangadaList, now]);

  const { data: jangada, isLoading, error, refetch } = useQuery<JangadaDashboard | null>({
    queryKey: ["jangada-detail", resolvedId],
    queryFn: () => (resolvedId ? fetchJangadaDetail(resolvedId) : Promise.resolve(null)),
    enabled: !!resolvedId,
    staleTime: 30000,
  });

  const loading = isLoadingList || isLoading;

  const dashboardData: InspectorDashboardData | null = jangada ? {
    currentInspection: jangada,
    progress: calculateProgress(jangada),
    currentStep: getCurrentStep(jangada),
    totalSteps: 11,
    pendingItems: getPendingItems(jangada),
  } : null;

  return {
    jangada,
    dashboardData,
    isLoading: loading,
    error,
    refetch,
  };
}

async function fetchAllJangadas(): Promise<JangadaDashboard[]> {
  const res = await fetch("/api/jangadas?scope=all");
  if (!res.ok) return [];
  return res.json();
}

function calculateProgress(jangada: JangadaDashboard): number {
  const steps = [
    !!jangada.serial && !!jangada.brand && !!jangada.model, // Dados Gerais
    !!jangada.dataInspecao, // Checklist (tem data inspeção)
    true, // Componentes - assume true for now
    jangada.artigos && jangada.artigos.length > 0, // Equipamento Pack
    !!jangada.cylinderSerial, // Cilindros
    jangada.testeWP !== undefined || jangada.testeNAP !== undefined, // Testes
    jangada.applicableServiceBulletinsCount !== undefined, // Boletins
    true, // Orçamento
    true, // Resumo Final
    !!jangada.ultimoCertificadoNumero, // Certificados
    true, // Histórico
  ];
  const completed = steps.filter(Boolean).length;
  return Math.round((completed / steps.length) * 100);
}

function getCurrentStep(jangada: JangadaDashboard): number {
  if (!jangada.serial || !jangada.brand) return 1;
  if (!jangada.dataInspecao) return 2;
  if (!jangada.artigos?.length) return 4;
  if (!jangada.cylinderSerial) return 5;
  if (jangada.testeWP === undefined && jangada.testeNAP === undefined) return 6;
  if (jangada.applicableServiceBulletinsCount === undefined) return 7;
  if (!jangada.ultimoCertificadoNumero) return 9;
  return 11;
}

function getPendingItems(jangada: JangadaDashboard): Array<{ step: number; stepName: string; description: string }> {
  const items: Array<{ step: number; stepName: string; description: string }> = [];

  if (!jangada.serial || !jangada.brand || !jangada.model) {
    items.push({ step: 1, stepName: "Dados Gerais", description: "Preencher marca, modelo, série, lotação" });
  }
  if (!jangada.dataInspecao) {
    items.push({ step: 2, stepName: "Checklist", description: "Definir data de inspeção" });
  }
  if (!jangada.artigos?.length) {
    items.push({ step: 4, stepName: "Equipamento (Pack)", description: "Registar quantidades e validades do pack" });
  }
  if (!jangada.cylinderSerial) {
    items.push({ step: 5, stepName: "Cilindros", description: "Registar série, tara, CO2, N2, datas de teste" });
  }
  if (jangada.testeWP === undefined && jangada.testeNAP === undefined) {
    items.push({ step: 6, stepName: "Testes", description: "Executar testes WP, NAP, FS, GI" });
  }
  if (jangada.applicableServiceBulletinsCount === undefined) {
    items.push({ step: 7, stepName: "Boletins de Serviço", description: "Verificar e aplicar boletins aplicáveis" });
  }
  if (!jangada.ultimoCertificadoNumero) {
    items.push({ step: 9, stepName: "Resumo Final", description: "Gerar certificado e quadro Excel" });
  }

  return items;
}