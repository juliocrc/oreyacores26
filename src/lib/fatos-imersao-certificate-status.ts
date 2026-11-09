export function inspectionStatus(input: {
  certificadoResultado?: string | null;
  verificacaoResultado?: string | null;
  certificadoData?: Date | null;
  verificacaoData?: Date | null;
}): string {
  if (!input.certificadoResultado || input.verificacaoResultado !== "OK" || !input.certificadoData || !input.verificacaoData) return "NOT OK";
  if (input.certificadoData.toISOString().slice(0, 10) < input.verificacaoData.toISOString().slice(0, 10)) return "NOT OK";
  return input.certificadoResultado.trim().toLowerCase() === "aprovado" ? "OK" : "NOT OK";
}
