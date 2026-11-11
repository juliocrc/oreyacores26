import React from 'react';
import { containerLabelChecklist } from '@/lib/container-labels';
import JangadaArticleThumbnail from '@/app/jangadas/[id]/JangadaArticleThumbnail';

type Stock = { id: number; codigoFabricante?: string | null; referencia?: string | null; quantidade?: number; foto?: string | null };
export default function ContainerLabels({ raft, stock = [], stockStatus = 'loading' }: { raft: Parameters<typeof containerLabelChecklist>[0]; stock?: Stock[]; stockStatus?: 'loading' | 'ready' | 'error' }) {
  const result = containerLabelChecklist(raft);
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="container-labels-title">
    <h3 id="container-labels-title" className="mb-2 font-bold text-slate-800">Autocolantes do contentor</h3>
    {result.supported ? <>
      <p className="mb-3 text-sm text-slate-600">Referências identificadas para este contentor, segundo o {result.source}. Verifique estado, posicionamento, aprovação e edição do manual; substitua conforme necessário.</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="p-2">Posição</th><th className="p-2">Autocolante</th><th className="p-2">Código fabricante</th><th className="p-2">Quantidade no contentor</th><th className="p-2">Stock consultado</th></tr></thead><tbody>{result.labels.map(label => {
        const matches = stock.filter(item => String(item.codigoFabricante || '').trim().toUpperCase() === label.reference.toUpperCase());
        const photo = matches.find(item => item.foto)?.foto || null;
        const quantity = matches.reduce((total, item) => total + (Number(item.quantidade) || 0), 0);
        return <tr key={label.position} className="border-b border-slate-100"><td className="p-2">{label.position}</td><td className="p-2"><span className="flex items-center gap-2"><JangadaArticleThumbnail photo={photo} name={label.name} />{label.name}</span></td><td className="p-2">{label.reference}</td><td className="p-2">{label.quantity}</td><td className="p-2">{stockStatus === 'loading' ? 'A consultar…' : stockStatus === 'error' ? 'Consulta indisponível' : matches.length ? `Registado: ${quantity} un. (${matches.length} registo(s))` : 'Sem correspondência por código'}</td></tr>;
      })}</tbody></table></div>
      <p className="mt-3 text-xs text-amber-800">Esta lista não inclui todos os autocolantes de marca, de aprovação ou de variantes. Consulte as figuras e tabelas correspondentes antes de encomendar. As quantidades indicam o instalado, não uma substituição automática.</p>
      {result.source?.includes('MK IV') && <p className="mt-2 text-xs text-amber-800">O SB 75/15 Ver.1 introduz um kit de etiquetas universais diferente para determinadas RFD Surviva MK IV. Confirme o boletim, a configuração e as etiquetas instaladas antes de encomendar; esta tabela não determina automaticamente o kit aplicável.</p>}
    </> : <p className="text-sm text-amber-800">Não foi possível determinar com segurança os autocolantes deste modelo e contentor. Confirme marca, modelo, lançamento, família e tamanho no manual aplicável; não serão atribuídas referências por aproximação.</p>}
  </section>;
}
