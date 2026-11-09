import React from 'react';
import { inflationHoseManualDetails } from '@/lib/inflation-hose-manual';

type Stock = { referencia?: string | null; codigoFabricante?: string | null };
export default function InflationHoseGuidance({ upper, lower, relief, topUp, stock }: { upper?: string | null; lower?: string | null; relief?: string | null; topUp?: string | null; stock: Stock[] }) {
  const rows = [{ label: 'Câmara superior', ref: upper }, { label: 'Câmara inferior', ref: lower }].map(row => {
    const matches = stock.filter(item => row.ref && item.referencia?.trim().toUpperCase() === row.ref.trim().toUpperCase());
    const codes = [...new Set(matches.map(item => item.codigoFabricante?.trim().toUpperCase()).filter(Boolean))];
    const direct = inflationHoseManualDetails(row.ref);
    const fromStock = codes.length === 1 ? inflationHoseManualDetails(codes[0]) : null;
    return { ...row, detail: direct || fromStock };
  });
  return <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900"><h3 className="font-bold">Mangueiras, adaptadores e válvulas — referências registadas</h3>
    <p className="mt-1">Sugestões consultivas para as referências registadas; não confirmam instalação nem substituem a verificação física.</p>
    <ul className="mt-2 space-y-2">{rows.map(row => <li key={row.label}><strong>{row.label}:</strong> {row.ref || 'não identificada'} — {row.detail ? <>{row.detail.description}; adaptador(es) previstos na publicação: {row.detail.adapters.join(', ')}. {row.detail.source}. {row.detail.notice}</> : 'sem correspondência manual inequívoca; confirmar sistema e código de fabricante.'}</li>)}</ul>
    <p className="mt-3"><strong>Válvula de alívio:</strong> {relief || 'não identificada'} · <strong>Válvula de atestar:</strong> {topUp || 'não identificada'}. Estas são as referências da ficha da jangada, não uma atribuição automática por modelo.</p>
    <p className="mt-1">Confirme aplicação, componentes e ensaios pelo manual e aprovação correspondentes; uma referência não comprova o estado ou resultado do ensaio.</p>
  </section>;
}
