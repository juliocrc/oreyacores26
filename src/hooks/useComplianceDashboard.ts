"use client";

import { useQuery } from "@tanstack/react-query";
import type { ComplianceRaft, StockExpiringResponse } from "@/types/dashboard";
import type { JangadaDashboard } from "@/types/dashboard";

async function fetchAllJangadas(): Promise<JangadaDashboard[]> {
  const res = await fetch("/api/jangadas?scope=all");
  if (!res.ok) return [];
  return res.json();
}

async function fetchExpiringStock(): Promise<StockExpiringResponse | null> {
  const res = await fetch("/api/stock/expiring");
  if (!res.ok) return null;
  return res.json();
}

export function useComplianceDashboard() {
  const { data: jangadas = [], isLoading, refetch } = useQuery<JangadaDashboard[]>({
    queryKey: ["jangadas-compliance"],
    queryFn: fetchAllJangadas,
    staleTime: 60000,
  });

  const { data: expiringStock } = useQuery({
    queryKey: ["expiring-stock"],
    queryFn: fetchExpiringStock,
    staleTime: 60000,
  });

  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 86400000);
  const in60 = new Date(now.getTime() + 60 * 86400000);
  const in90 = new Date(now.getTime() + 90 * 86400000);

  const complianceRafts: ComplianceRaft[] = jangadas.map(j => {
    const nextInspecao = j.dataProxInspecao ? new Date(j.dataProxInspecao) : null;
    let status: "valido" | "expirando" | "expirado" = "valido";
    let diasParaExpirar = 0;

    if (nextInspecao) {
      const diff = nextInspecao.getTime() - now.getTime();
      diasParaExpirar = Math.ceil(diff / 86400000);
      if (diasParaExpirar < 0) status = "expirado";
      else if (diasParaExpirar <= 30) status = "expirando";
    } else {
      status = "expirado";
      diasParaExpirar = -999;
    }

    // Artigos estado
    let artigosOK = 0, artigosExpirando = 0, artigosExpirados = 0;
    if (j.artigos) {
      for (const art of j.artigos) {
        if (!art.validade) continue;
        const valDate = new Date(art.validade);
        if (isNaN(valDate.getTime())) continue;
        if (valDate < now) artigosExpirados++;
        else if (valDate <= in90) artigosExpirando++;
        else artigosOK++;
      }
    }

    return {
      id: j.id,
      serial: j.serial,
      model: `${j.brand} ${j.model}`,
      owner: j.owner,
      shipName: j.shipName,
      dataInspecao: j.dataInspecao,
      dataProxInspecao: j.dataProxInspecao,
      certificadoNumero: j.ultimoCertificadoNumero ?? null,
      certificadoValidoAte: j.dataProxInspecao ?? null,
      status,
      diasParaExpirar,
      applicableServiceBulletinsCount: j.applicableServiceBulletinsCount ?? 0,
      applicableServiceBulletinTitles: j.applicableServiceBulletinTitles ?? [],
      hruValidade: j.hruValidade,
      cylinderDataProxTeste: j.cylinderDataProxTeste,
      artigosEstado: { ok: artigosOK, expirando: artigosExpirando, expirados: artigosExpirados },
    };
  });

  const stats = {
    validos: complianceRafts.filter(r => r.status === "valido").length,
    expirando: complianceRafts.filter(r => r.status === "expirando").length,
    expirados: complianceRafts.filter(r => r.status === "expirado").length,
    total: complianceRafts.length,
    serviceBulletinsPendentes: complianceRafts.filter(r => r.applicableServiceBulletinsCount > 0).length,
    hruExpirando: complianceRafts.filter(r => {
      if (!r.hruValidade) return false;
      const d = new Date(r.hruValidade);
      return d > now && d <= in30;
    }).length,
    cylinderTesteExpirando: complianceRafts.filter(r => {
      if (!r.cylinderDataProxTeste) return false;
      const d = new Date(r.cylinderDataProxTeste);
      return d > now && d <= in60;
    }).length,
    artigosVencidos: expiringStock?.summary?.expiredCount || 0,
    artigosExpirando30: expiringStock?.summary?.expiring30dCount || 0,
  };

  const alerts = [
    ...complianceRafts.filter(r => r.status === "expirado").map(r => ({
      type: "certificado_expirado" as const,
      severity: "high" as const,
      message: `Certificado expirado: ${r.model} (${r.serial}) - ${r.shipName || "Sem navio"}`,
      raftId: r.id,
    })),
    ...complianceRafts.filter(r => r.status === "expirando").map(r => ({
      type: "certificado_expirando" as const,
      severity: "medium" as const,
      message: `Certificado vence em ${r.diasParaExpirar}d: ${r.model} (${r.serial})`,
      raftId: r.id,
    })),
    ...complianceRafts.filter(r => r.applicableServiceBulletinsCount > 0).map(r => ({
      type: "service_bulletin" as const,
      severity: "medium" as const,
      message: `${r.applicableServiceBulletinsCount} boletim(ns) pendente(s): ${r.model} (${r.serial})`,
      raftId: r.id,
    })),
    ...complianceRafts.filter(r => {
      if (!r.hruValidade) return false;
      const d = new Date(r.hruValidade);
      return d > now && d <= in30;
    }).map(r => ({
      type: "hru_expirando" as const,
      severity: "high" as const,
      message: `HRU vence em breve: ${r.model} (${r.serial})`,
      raftId: r.id,
    })),
    ...complianceRafts.filter(r => {
      if (!r.cylinderDataProxTeste) return false;
      const d = new Date(r.cylinderDataProxTeste);
      return d > now && d <= in60;
    }).map(r => ({
      type: "cylinder_teste" as const,
      severity: "medium" as const,
      message: `Teste hidrostático vence em breve: ${r.model} (${r.serial})`,
      raftId: r.id,
    })),
  ].sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  return {
    complianceRafts,
    stats,
    alerts,
    expiringStock: expiringStock?.summary,
    isLoading,
    refetch,
  };
}