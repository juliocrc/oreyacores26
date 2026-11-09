type JsonObject = Record<string, unknown>;

export class QuoteInputError extends Error {}

export function quoteNumber(value: unknown): number {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") {
    throw new QuoteInputError("Quantidade ou valor invalido.");
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new QuoteInputError("Quantidade ou valor invalido.");
  return number;
}

export function roundQuoteMoney(value: number) {
  const cents = Math.round((value + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(cents)) throw new QuoteInputError("Valor fora do intervalo permitido.");
  return cents / 100;
}

export function normalizeQuoteLines(value: unknown, previous: unknown = []) {
  if (!Array.isArray(value)) throw new QuoteInputError("Linhas deve ser uma lista.");
  const oldRows = Array.isArray(previous) ? previous as JsonObject[] : [];
  const ids = new Set<string>();
  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new QuoteInputError("Linha invalida.");
    const row = entry as JsonObject;
    const id = row.id == null ? undefined : String(row.id).trim();
    if (id && ids.has(id)) throw new QuoteInputError("ID de linha duplicado.");
    if (id) ids.add(id);
    const old = id ? oldRows.find((item) => item && String(item.id) === id) : undefined;
    const quantidade = quoteNumber(row.quantidade);
    // Persisted inspection quotes also use precoUnitario.
    const unitPrice = quoteNumber(row.unitPrice ?? row.precoUnitario);
    const descontoPercentual = row.descontoPercentual === undefined ? 0 : quoteNumber(row.descontoPercentual);
    if (descontoPercentual > 100) throw new QuoteInputError("Desconto percentual deve estar entre 0 e 100.");
    const result = {
      ...(old || {}),
      id,
      referencia: String(row.referencia ?? old?.referencia ?? "").trim(),
      descricao: String(row.descricao ?? old?.descricao ?? "").trim(),
      source: String(row.source ?? old?.source ?? "").trim(),
      quantidade,
      unitPrice,
      descontoPercentual,
      total: roundQuoteMoney(quantidade * unitPrice * (1 - descontoPercentual / 100)),
    } as JsonObject & { quantidade: number; unitPrice: number; total: number };
    // Allowlisted operational fields survive partial financial edits, without arbitrary input spreading.
    for (const field of ["stockId", "consumido", "reservado", "origem"] as const) {
      if (!Object.prototype.hasOwnProperty.call(row, field)) continue;
      const input = row[field];
      if (field === "stockId") {
        if (input == null || input === "") result[field] = null;
        else {
          const stockId = quoteNumber(input);
          if (!Number.isSafeInteger(stockId) || stockId <= 0) throw new QuoteInputError("Stock invalido.");
          result[field] = stockId;
        }
      } else if (field === "origem") result[field] = String(input ?? "");
      else {
        if (typeof input !== "boolean") throw new QuoteInputError("Estado de consumo/reserva invalido.");
        result[field] = input;
      }
    }
    return result;
  });
}

export function normalizeQuoteStatus(value: unknown) {
  const statuses: Record<string, string> = {
    rascunho: "Rascunho", pendente: "Pendente", enviado: "Enviado",
    aprovado: "Aprovado", rejeitado: "Rejeitado", em_execucao: "em_execucao", concluido: "concluido",
  };
  const key = String(value ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/ /g, "_");
  if (!Object.prototype.hasOwnProperty.call(statuses, key)) throw new QuoteInputError("Estado de orcamento invalido.");
  return statuses[key];
}

export function hasQuoteFinancialChange(body: JsonObject, before: JsonObject, meta: JsonObject, includeOperational = false) {
  for (const field of ["valorPecas", "valorMaoObra", "valorDesconto", "isIsentoIva", "codigoIsencaoIva", "isPesca", "valorTotal"]) {
    if (Object.prototype.hasOwnProperty.call(body, field) && body[field] !== before[field]) return true;
  }
  const incoming = body.metadados && typeof body.metadados === "object" ? body.metadados as JsonObject : {};
  if (Object.prototype.hasOwnProperty.call(body, "linhas") && JSON.stringify(body.linhas) !== JSON.stringify(meta.linhas)) return true;
  for (const field of ["linhas", "materials", "totais"]) {
    if (!Object.prototype.hasOwnProperty.call(incoming, field)) continue;
    const project = (value: unknown) => field === "materials" && !includeOperational && Array.isArray(value)
      ? value.map((row: JsonObject) => row && typeof row === "object" ? [row.id, row.stockId, row.referencia, row.descricao, row.quantidadePrevista, row.precoUnitario] : row)
      : value;
    if (JSON.stringify(project(incoming[field])) !== JSON.stringify(project(meta[field]))) return true;
  }
  return false;
}
