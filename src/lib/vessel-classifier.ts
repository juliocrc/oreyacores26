export type VesselClassificationResult = {
  category: "Arrastão (Trawler)" | "Palangreiro (Longliner)" | "Cercação (Purse Seine)" | "Pesca Costeira / Local" | "Marinha / Patrulha (SAR)" | "Outros / Auxiliar";
  confidence: number; // 0 to 100%
  gearType: string;
  source: "GFW Vessel Classifier Engine v2.0";
};

export function classifyVessel(navio: {
  nome?: string | null;
  tipoPesca?: string | null;
  tipoNavio?: string | null;
  comprimentoMetros?: number | null;
  matricula?: string | null;
}): VesselClassificationResult {
  const nome = String(navio.nome || "").toLowerCase();
  const tipoPesca = String(navio.tipoPesca || "").toLowerCase();
  const tipoNavio = String(navio.tipoNavio || "").toLowerCase();
  const comprimento = Number(navio.comprimentoMetros || 0);

  if (nome.includes("esv-") || nome.includes("salva-vidas") || nome.includes("nossa senhora") || nome.includes("mestre") || tipoNavio.includes("marinha") || tipoNavio.includes("sar")) {
    return {
      category: "Marinha / Patrulha (SAR)",
      confidence: 98,
      gearType: "Busca, Salvamento e Patrulha Marítima",
      source: "GFW Vessel Classifier Engine v2.0",
    };
  }

  if (tipoPesca.includes("palangre") || tipoPesca.includes("demersal") || nome.includes("palangre")) {
    return {
      category: "Palangreiro (Longliner)",
      confidence: 92,
      gearType: "Linhas e Anzóis (Palangre de Fundo/Superfície)",
      source: "GFW Vessel Classifier Engine v2.0",
    };
  }

  if (tipoPesca.includes("arrasto") || tipoPesca.includes("trawl")) {
    return {
      category: "Arrastão (Trawler)",
      confidence: 95,
      gearType: "Redes de Arrastão (Fundo/Pelágico)",
      source: "GFW Vessel Classifier Engine v2.0",
    };
  }

  if (tipoPesca.includes("cerco") || tipoPesca.includes("atuneiro") || tipoPesca.includes("cercação")) {
    return {
      category: "Cercação (Purse Seine)",
      confidence: 90,
      gearType: "Redes de Cercação (Pelágicos / Atum)",
      source: "GFW Vessel Classifier Engine v2.0",
    };
  }

  if (comprimento > 0 && comprimento < 15) {
    return {
      category: "Pesca Costeira / Local",
      confidence: 88,
      gearType: "Pesca Artesanal Polivalente",
      source: "GFW Vessel Classifier Engine v2.0",
    };
  }

  return {
    category: "Pesca Costeira / Local",
    confidence: 75,
    gearType: "Pesca Polivalente Costeira",
    source: "GFW Vessel Classifier Engine v2.0",
  };
}
