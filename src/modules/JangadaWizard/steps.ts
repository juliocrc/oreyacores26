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
  type LucideIcon,
} from "lucide-react";
import type { InspectionData } from "./types";

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
  orcamento: { key: "orcamento", title: "Orçamento", icon: Receipt },
  resumo: { key: "resumo", title: "Resumo Final", icon: CheckCircle },
  certificados: { key: "certificados", title: "Certificados", icon: FileText },
  historico: { key: "historico", title: "Histórico", icon: History },
};

export function needsRepair(data: InspectionData): boolean {
  return String(data.testes?.testeWP || "").toUpperCase() === "REPROVOU";
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
      BASE_STEPS_BY_KEY.historico,
    ];
  }
  const order: string[] = [
    "dados",
    "checklist",
    "componentes",
    "pack",
    "cilindros",
    "testes",
    "boletins",
  ];
  if (needsRepair(data)) order.push("reparacoes");
  // Orçamento logo a seguir às substituições (pack) para reconciliar
  // substituições ↔ linhas; fecho (resumo) só depois de tudo validado.
  order.push("orcamento", "resumo", "certificados", "historico");
  const filtered = opts?.hideOrcamento ? order.filter((key) => key !== "orcamento") : order;
  return filtered.map((key) => BASE_STEPS_BY_KEY[key]);
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
  return steps.findIndex((s) => s.key === key) + 1;
}
