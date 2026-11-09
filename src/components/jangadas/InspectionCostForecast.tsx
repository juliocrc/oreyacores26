"use client";
import React, { useEffect, useState } from 'react';
import { formatDate } from '@/lib/date-utils';

type Item = { id: number; nome: string; referencia: string | null; quantidade: number; validade: string | null; unitario: number | null; total: number | null };
type Forecast = { proximaInspecao: string | null; itens: Item[]; pendentes: Item[]; subtotalConhecido: number; semPreco: number;
  cintaIdentificada: boolean; fecho: Array<{ key: string; kind: string; descricao: string; quantidade: number; unitario: number | null; total: number | null; certainty?: string }>;
  testes: Array<{ testId: string; label: string; status: string; reason: string }>; notasFecho: string[];
  ultimoGi: { inspecaoId: number; dataInspecao: string; proximaEstimativa: string } | null;
  aplicabilidade: { manual: string | null; identificationNote: string | null; checks: Array<{ label: string; value: string | null }>; missing: string[]; pendingConfirmation: string[] } };
const euro = (value: number) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(value);

export default function InspectionCostForecast({ jangadaId }: { jangadaId: number }) {
  const [data, setData] = useState<Forecast | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/jangadas/${jangadaId}/previsao-custos`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(setData).catch(() => { if (!controller.signal.aborted) setError('Não foi possível carregar a previsão.'); });
    return () => controller.abort();
  }, [jangadaId]);
  if (error) return <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>;
  if (!data) return <p role="status" className="p-4 text-slate-500">A calcular previsão…</p>;
  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
    <h2 className="text-xl font-bold text-slate-800">Previsão de custos da próxima inspeção</h2>
    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950">
      <h3 className="font-bold">Matriz de aplicabilidade técnica</h3>
      <p className="mt-1">Manual candidato: <strong>{data.aplicabilidade.manual || 'não identificado'}</strong>. Identificação indicativa; confirmar com o técnico antes de aplicar procedimentos.</p>
      {data.aplicabilidade.identificationNote && <p className="mt-1">{data.aplicabilidade.identificationNote}</p>}
      <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{data.aplicabilidade.checks.map(check => <div key={check.label}><dt className="font-semibold">{check.label}</dt><dd>{check.value ? (check.label === 'Próxima inspeção' ? formatDate(check.value) : check.value) : 'Por confirmar'}</dd></div>)}</dl>
      <p className="mt-3">Por confirmar: {data.aplicabilidade.pendingConfirmation.join('; ')}.</p>
      <p className="mt-1">Os testes abaixo usam regras gerais existentes, não uma validação do manual. Não substituem a decisão técnica.</p>
    </div>
    <p className="text-sm text-slate-600">Próxima inspeção: {data.proximaInspecao ? formatDate(data.proximaInspecao) : 'data por definir'}. Estimativa indicativa, não é orçamento: não inclui mão de obra, IVA, custo dos testes, reparações ou artigos ainda não registados. Confirme as sugestões de fecho e os testes aplicáveis.</p>
    {!data.proximaInspecao && <p role="status" className="text-amber-700">Defina a data da próxima inspeção para calcular os vencimentos.</p>}
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="p-2">Artigo</th><th className="p-2">Validade</th><th className="p-2">Qtd.</th><th className="p-2">Preço unitário</th><th className="p-2">Estimativa</th></tr></thead><tbody>
      {data.itens.map(item => <tr key={item.id} className="border-b border-slate-100"><td className="p-2">{item.nome}{item.referencia && <span className="block text-xs text-slate-500">{item.referencia}</span>}</td><td className="p-2">{item.validade || '—'}</td><td className="p-2">{item.quantidade}</td><td className="p-2">{item.unitario === null ? 'Por definir' : euro(item.unitario)}</td><td className="p-2">{item.total === null ? 'Por definir' : euro(item.total)}</td></tr>)}
    </tbody></table></div>
    {data.itens.length === 0 && <p className="text-sm text-slate-500">Nenhum artigo registado com substituição prevista por validade.</p>}
    <h3 className="font-bold text-slate-800">Testes previstos para a data</h3>
    <p className="text-sm text-slate-600">{data.ultimoGi
      ? `Último GI com resultado “passou” numa inspeção concluída: ${formatDate(data.ultimoGi.dataInspecao)} (inspeção #${data.ultimoGi.inspecaoId}). Data estimada cinco anos depois: ${formatDate(data.ultimoGi.proximaEstimativa)}. Confirme a data real e a periodicidade aplicável.`
      : 'Não foi encontrado GI aprovado numa inspeção concluída. Confirme o histórico antes de estabelecer a próxima data.'}</p>
    {!data.proximaInspecao ? <p className="text-sm text-amber-700">Defina a data da inspeção para calcular os testes.</p> : <ul className="space-y-1 text-sm text-slate-600">{data.testes.map(test => <li key={test.testId}><strong>{test.label}</strong> — {test.status} · {test.reason} · preço por definir</li>)}</ul>}
    <h3 className="font-bold text-slate-800">Sugestões de fecho do contentor</h3>
    <p className="text-sm text-slate-600">Cintas: 6 € por unidade. As restantes linhas são sugestões de catálogo, sujeitas a confirmação técnica e excluídas do subtotal; não representam necessariamente artigos obrigatórios.</p>
    {!data.cintaIdentificada && <p className="text-sm text-amber-700">Quantidade de cintas não identificada para este modelo; confirmar manualmente.</p>}
    <ul className="space-y-1 text-sm text-slate-700">{data.fecho.map(item => <li key={item.key}>{item.descricao} — {item.quantidade} × {item.unitario === null ? 'preço por definir' : euro(item.unitario)} = {item.total === null ? 'por definir' : euro(item.total)} {item.certainty && item.certainty !== 'exact' ? '(confirmar correspondência)' : ''}</li>)}</ul>
    {data.notasFecho.length > 0 && <div className="rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900"><p className="font-bold">Verificações no manual</p><ul className="mt-2 list-disc space-y-1 pl-5">{data.notasFecho.map(note => <li key={note}>{note}</li>)}</ul></div>}
    <p className="font-bold text-slate-800">Subtotal conhecido de materiais, sem IVA: {euro(data.subtotalConhecido)}</p>
    {(data.semPreco > 0 || data.pendentes.length > 0) && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{data.semPreco} artigo(s) previsto(s) sem preço; {data.pendentes.length} artigo(s) com validade ou data de inspeção por confirmar. O subtotal é incompleto.</p>}
  </section>;
}
