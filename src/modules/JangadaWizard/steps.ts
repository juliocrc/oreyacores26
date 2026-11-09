import {
  ClipboardList,
  CheckSquare,
  Wrench,
  Package,
  Cylinder,
  AlertCircle,
  Hammer,
  Receipt,
  CheckCircle,
  FileText,
  History,
  ShieldCheck,
  Box,
  ListChecks,
  type LucideIcon,
} from "lucide-react";
import type { InspectionData } from "./types";
import { isSosRaft } from '@/lib/raft-model-rules';

export type WizardStep = {
  key: string;
  title: string;
  icon: LucideIcon;
};

export const BASE_STEPS_BY_KEY: Record<string, WizardStep> = {
  dados: { key: "dados", title: "Dados Gerais", icon: ClipboardList },
  checklist: { key: "checklist", title: "Checklist", icon: CheckSquare },
  componentes: { key: "componentes", title: "Componentes", icon: Wrench },
  pack: { key: "pack", title: "Equipamento (Pack)", icon: Package },
  cilindros: { key: "cilindros", title: "Cilindros", icon: Cylinder },
  testes: { key: "testes", title: "Testes", icon: AlertCircle },
  boletins: { key: "boletins", title: "Boletins de Serviço", icon: ShieldCheck },
  reparacoes: { key: "reparacoes", title: "Reparações / Colagem", icon: Hammer },
  contentor: { key: "contentor", title: "Fecho do Contentor", icon: Box },
  orcamento: { key: "orcamento", title: "Orçamento", icon: Receipt },
  artigos: { key: "artigos", title: "Artigos Substituídos", icon: ListChecks },
  resumo: { key: "resumo", title: "Resumo Final", icon: CheckCircle },
  certificados: { key: "certificados", title: "Certificados", icon: FileText },
  historico: { key: "historico", title: "Histórico", icon: History },
};

export function needsRepair(data: InspectionData): boolean {
  return (!isSosRaft(data) && String(data.testes?.testeWP || "").toUpperCase() === "REPROVOU") ||
    Boolean(data.reparacoes?.length) || data.repairRequested === true;
}

export function getWizardSteps(
  data: InspectionData,
  opts?: { hideOrcamento?: boolean }
): { key: string; title: string; icon: LucideIcon }[] {
  if (data.abate?.ativo) {
    return [
      BASE_STEPS_BY_KEY.dados,
      BASE_STEPS_BY_KEY.checklist,
      BASE_STEPS_BY_KEY.resumo,
      BASE_STEPS_BY_KEY.certificados,
    ];
  }
  const order: string[] = [
    "dados",
    // Missing applicability is unknown, not confirmation that none apply.
    ...(!Array.isArray(data.applicableServiceBulletins) || data.applicableServiceBulletins.length > 0 ||
      Object.keys(data.serviceBulletinsApplied || {}).length > 0 ? ["boletins"] : []),
    "checklist",
    "componentes",
    "pack",
    "cilindros",
    ...(!isSosRaft(data) ? ["testes"] : []),
  ];
  if (needsRepair(data)) order.push("reparacoes");
  // Equipamento de fecho do contentor antes do orçamento: os artigos marcados
  // aqui entram automaticamente nas linhas do orçamento.
  order.push("contentor", "orcamento", "resumo", "certificados");
  // Técnicos (role USER) não gerem preços: no lugar do Orçamento veem apenas a
  // lista read-only dos artigos substituídos.
  const mapped = opts?.hideOrcamento
    ? order.map((key) => (key === "orcamento" ? "artigos" : key))
    : order;
  return mapped.map((key) => BASE_STEPS_BY_KEY[key]);
}

export function getStepNumberByKey(
  data: InspectionData,
  key: string,
  opts?: { hideOrcamento?: boolean }
): number {
  const steps = getWizardSteps(data, opts);
  const idx = steps.findIndex((s) => s.key === key);
  return idx === -1 ? 0 : idx + 1;
}

export function getStepIndexByKey(steps: { key: string }[], key: string) {
  const mappedKey = key === 'historico' ? 'resumo' : key;
  const idx = steps.findIndex((s) => s.key === mappedKey);
  if (idx >= 0) return idx + 1;
  if (key === 'orcamento') return steps.findIndex(s => s.key === 'artigos') + 1;
  if (key === 'artigos') return steps.findIndex(s => s.key === 'orcamento') + 1;
  return 0;
}

// Numeric-only local drafts predate the reordered flow. New drafts save a key.
export function getSavedStepKey(data: InspectionData, draft: { currentStepKey?: string; currentStep?: number }, hideOrcamento = false): string {
  if (draft.currentStepKey) return draft.currentStepKey;
  const legacy = data.abate?.ativo
    ? ['dados', 'checklist', 'resumo', 'certificados', 'historico']
    : ['dados', 'checklist', 'componentes', 'pack', 'cilindros', 'testes', 'boletins',
      ...(String(data.testes?.testeWP || '').toUpperCase() === 'REPROVOU' ? ['reparacoes'] : []), 'contentor', hideOrcamento ? 'artigos' : 'orcamento', 'historico', 'certificados', 'resumo'];
  return legacy[(draft.currentStep || 1) - 1] || 'dados';
}
