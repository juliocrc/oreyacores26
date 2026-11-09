import { roundQuoteMoney } from "@/lib/ordem-quote-input";

type Line = {
  id: string;
  stockId?: number | string | null;
  referencia: string;
  descricao: string;
  quantidade: number;
  unitPrice: number;
  descontoPercentual?: number;
  total: number;
  source: string;
};

// Opening an editor must never price services from today's stock catalogue.
export function persistedQuoteLines(row: {
  valorPecas?: number | null;
  metadados?: unknown;
}): Line[] {
  const meta = row.metadados as { linhas?: Array<Line & { precoUnitario?: number | null }>; materials?: Array<{
    id?: string | null; stockId?: number | string | null; referencia?: string | null;
    descricao?: string | null; quantidadeUsada?: number | null;
    quantidadePrevista?: number | null; precoUnitario?: number | null;
  }> } | null;
  if (Array.isArray(meta?.linhas) && meta.linhas.length > 0) {
    const used = new Set(meta.linhas.map(line => line.id).filter(Boolean));
    const seen = new Set<string>();
    return meta.linhas.map((line, index) => {
      let id = line.id;
      if (!id || seen.has(id)) {
        id = `persisted-${index}`;
        while (used.has(id) || seen.has(id)) id += "-copy";
      }
      seen.add(id);
      const aggregateOnly = line.quantidade == null && line.unitPrice == null && line.precoUnitario == null;
      const quantidade = aggregateOnly ? 1 : Number(line.quantidade) || 0;
      const unitPrice = Number(aggregateOnly ? line.total : line.unitPrice ?? line.precoUnitario) || 0;
      const descontoPercentual = Number(line.descontoPercentual ?? 0);
      return { ...line, id, quantidade, unitPrice, descontoPercentual,
        total: Number(line.total ?? roundQuoteMoney(quantidade * unitPrice * (1 - descontoPercentual / 100))) || 0 };
    });
  }
  // An explicitly cleared quote must not resurrect the operational materials on reopening.
  if (Array.isArray(meta?.linhas) && Number(row.valorPecas) === 0) return [];
  if (meta?.materials?.length) return meta.materials.map((material, index) => {
    const quantidade = Number(material.quantidadeUsada ?? material.quantidadePrevista ?? 1);
    const unitPrice = Number(material.precoUnitario ?? 0);
    return {
      id: material.id || `material-${index}`, stockId: material.stockId,
      referencia: material.referencia || "", descricao: material.descricao || "Material / serviço registado",
      quantidade, unitPrice, descontoPercentual: 0, total: roundQuoteMoney(quantidade * unitPrice),
      source: /^L-/i.test(material.referencia || "") ? "service" : "stock",
    };
  });
  const amount = Number(row.valorPecas) || 0;
  return amount > 0 ? [{ id: "legacy-total", referencia: "", descricao: "Serviços e materiais (montante agregado registado)",
    quantidade: 1, unitPrice: amount, descontoPercentual: 0, total: amount, source: "service" }] : [];
}
