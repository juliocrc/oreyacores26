export function invoiceNumberFromWork(numeroObra: string): string | null {
  const match = /^FO(0[1-9]|1[0-2])(\d{2})(\d{5,6})$/.exec(numeroObra.trim().toUpperCase());
  return match ? `FT${match[1]}${match[2]}${match[3].padStart(6, "0")}` : null;
}

export function invoiceWorkReferences(metadados: string | null | undefined): {
  numeroObra: string | null;
  numerosObra: string[];
} {
  let meta;
  try { meta = JSON.parse(metadados || "{}"); } catch { meta = {}; }
  // Legacy references may only come from the issued snapshot, never live orders.
  const values: unknown = meta?.numerosObra ?? meta?.numeroOrdens ?? [];
  const numerosObra = Array.isArray(values)
    ? [...new Set(values.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map(value => value.trim().toUpperCase()))].sort()
    : [];
  return { numeroObra: numerosObra.length === 1 ? numerosObra[0] : null, numerosObra };
}
