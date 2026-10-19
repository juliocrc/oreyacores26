import type ExcelJS from "exceljs";

export function formatCellDate(d: Date): string {
  if (Number.isNaN(d.getTime())) return "";
  // Células de data do xlsx são serials (meia-noite UTC). Usar componentes UTC
  // evita recuar um dia em fusos negativos e preserva o dia real.
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

export function cellText(cell: ExcelJS.Cell | undefined): string {
  if (!cell || cell.value == null) return "";
  const v = cell.value as unknown;
  if (typeof v === "string") return v.replace(/\s+/g, " ").trim();
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return "";
  if (v instanceof Date) return formatCellDate(v);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("result" in o && o.result != null) {
      if (o.result instanceof Date) return formatCellDate(o.result);
      return String(o.result).replace(/\s+/g, " ").trim();
    }
    if ("richText" in o && Array.isArray(o.richText)) {
      return (o.richText as Array<{ text?: string }>).map((r) => r.text || "").join("").replace(/\s+/g, " ").trim();
    }
    if ("text" in o && o.text != null) return String(o.text).replace(/\s+/g, " ").trim();
  }
  return "";
}
