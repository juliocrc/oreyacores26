"use client";

import { getStockValidityManualMode, parseStockValidityManualInput, upsertStockMetadataInObservacoes } from "@/lib/stock-metadata";
import { isServiceResourceReference } from "@/lib/stock-reference-rules";

export default function StockValiditySelect({ item, onChange }: {
  item: { referencia?: string | null; observacoes?: string | null };
  onChange: (observacoes: string) => void;
}) {
  const resource = isServiceResourceReference(item.referencia);
  return <label className="block text-xs font-semibold text-gray-700">
    Validade aplicavel
    <select className="mt-1 border rounded px-2 py-1 w-full" aria-label="Validade aplicavel" disabled={resource}
      value={resource ? "NAO" : getStockValidityManualMode(item.observacoes)}
      onChange={event => onChange(upsertStockMetadataInObservacoes(item.observacoes, { validadeAplicavel: parseStockValidityManualInput(event.target.value) }) || "")}>
      <option value="AUTO">AUTO (automatico)</option>
      <option value="SIM">SIM</option>
      <option value="NAO">NAO</option>
    </select>
  </label>;
}
