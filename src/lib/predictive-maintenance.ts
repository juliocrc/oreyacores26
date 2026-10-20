/**
 * Motor de Análise Preditiva e Consumíveis para Oficinas Navais
 * Antecipa picos de trabalho e necessidades de stock com base no histórico de revisões.
 */

export type PredictiveInsight = {
  stationId: number;
  stationName: string;
  recommendedStockAction: string;
  urgency: "low" | "medium" | "high";
  estimatedItemsNeeded: number;
  targetMonth: string;
};

export function analyzeWorkshopWorkload(
  stationId: number,
  stationName: string,
  upcomingInspectionsCount: number
): PredictiveInsight {
  const urgency = upcomingInspectionsCount > 25 ? "high" : upcomingInspectionsCount > 10 ? "medium" : "low";
  const estimatedItems = Math.round(upcomingInspectionsCount * 1.5);

  return {
    stationId,
    stationName,
    recommendedStockAction: `Atenção aos picos de revisão: previstos ${upcomingInspectionsCount} equipamentos a expirar. Recomenda-se reforçar stock de kits de pyros, fitas e selos de contentor.`,
    urgency,
    estimatedItemsNeeded: estimatedItems,
    targetMonth: new Date().toISOString().slice(0, 7),
  };
}
