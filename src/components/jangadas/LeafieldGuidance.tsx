import React from 'react';

export default function LeafieldGuidance({ sistema }: { sistema?: string | null }) {
  const value = String(sistema || '').trim().toUpperCase();
  if (!value.includes('LEAFIELD')) return null;
  const exact = ['LEAFIELD GIST TORSIONAL', 'LEAFIELD CUTTER', 'LEAFIELD COM MANÓMETRO'].includes(value);
  return <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
    <h3 className="font-bold">Verificação Leafield</h3>
    <p className="mt-1">{exact ? `Sistema registado: ${value}. Confirme a identificação no equipamento e a revisão do manual aplicável.` : 'O tipo de sistema Leafield não está confirmado. Identifique o mecanismo antes de aplicar um procedimento ou escolher peças.'}</p>
    <p className="mt-2">Verifique o estado das mangueiras, ligações e cabeça de disparo; confirme referência, idade e histórico de disparos quando aplicável. Utilize apenas peças compatíveis e aprovadas.</p>
    {value === 'LEAFIELD GIST TORSIONAL' && <div className="mt-3 rounded-lg border border-amber-200 bg-white p-3">
      <h4 className="font-bold">Torques de referência — GIST torsional</h4>
      <p className="mt-1">Mangueira ou adaptador de ligação direta: 12,2 Nm; porca M16: 20 Nm. Fonte: M-07-UM-GIST rev. 12, secção 8, p. 21 (PDF 23).</p>
      <p className="mt-1">Válvula de entrada GIVT: conector M16 Quick-Fit 9–12 Nm; porca M24 30 Nm. Fonte: M-07-IS-GIVT rev. 8, secção 3, p. 5 e 7.</p>
      <p className="mt-1">O SB 38/16 Ver.1 corrige para 10,5 ± 1,5 Nm o conector M16 da válvula de entrada nos manuais listados, incluindo M251 e M269-00. Confirme o manual, a revisão e a peça antes de aplicar.</p>
      <p className="mt-1">Para mangueiras Polar PD11541, o manual específico indica 11–13 Nm para Saginaw M16. Confirme a ligação exata e a instrução aplicável; não trate estes valores como intercambiáveis.</p>
      <p className="mt-1">SB 17/19 Ver.1: os parafusos das cabeças GIST de desenho antigo e novo não são intercambiáveis. Confirme o desenho instalado e a revisão do boletim antes de selecionar peças.</p>
    </div>}
    {value === 'LEAFIELD CUTTER' && <p className="mt-2">No manual cutter LEL-20018 issue 7, secção 9, a ligação da mangueira segue o procedimento do fabricante da jangada; não aplicar automaticamente o torque do sistema GIST.</p>}
    <p className="mt-2">Aviso consultivo: não calcula substituições nem aprova a inspeção. Consulte o manual do fabricante da jangada e do componente.</p>
  </section>;
}
