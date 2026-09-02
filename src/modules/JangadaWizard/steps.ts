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
  reparacoes: { key: "reparacoes", title: "Reparações / Colagem", icon: Hammer },
  orcamento: { key: "orcamento", title: "Orçamento", icon: Receipt },
  resumo: { key: "resumo", title: "Resumo Final", icon: CheckCircle },
  certificados: { key: "certificados", title: "Certificados", icon: FileText },
  historico: { key: "historico", title: "Histórico", icon: History },
};

export function needsRepair(data: InspectionData): boolean {
  return String(data.testes?.testeWP || "").toUpperCase() === "REPROVOU";
}

export function getWizardSteps(data: InspectionData): { key: string; title: string; icon: LucideIcon }[] {
  const order: string[] = [
    "dados",
    "checklist",
    "componentes",
    "pack",
    "cilindros",
    "testes",
  ];
  if (needsRepair(data)) order.push("reparacoes");
  order.push("orcamento", "resumo", "certificados", "historico");
  return order.map((key) => BASE_STEPS_BY_KEY[key]);
}

export function getStepIndexByKey(steps: { key: string }[], key: string) {
  return steps.findIndex((s) => s.key === key) + 1;
}
