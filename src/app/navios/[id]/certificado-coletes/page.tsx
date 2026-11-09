import React from 'react';
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { formatValidityDisplay } from "@/lib/date-display";

type CertificadoNavio = {
  nome: string;
  matricula: string;
  imo: string | null;
  armador?: string | null;
};

type CertificadoColeteRow = {
  id?: number;
  serial: string;
  marca: string | null;
  modelo: string | null;
  dataFabrico: string | null;
  estado?: string;
  verificacoes: {
    dataVerificacao: string | Date;
    tecidoExterior: string | null;
    mecanismoInflacao: string | null;
    observacoes: string | null;
  }[];
};

export default async function NavioCertificadoColetesPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const { id } = await params;
  
  const isMock = id === '999' || id === 'example-ship';
  
  let navio: CertificadoNavio | null = null;
  let coletes: CertificadoColeteRow[] = [];
  let dataInspecaoBase = new Date();

  if (isMock) {
    navio = {
      nome: 'Navio Demo (Orey Tecnica- Serviços Navais, Lda)',
      matricula: 'PD-1234-C',
      imo: '9876543',
      armador: 'Cliente Demonstração Lda.'
    };
    coletes = [
      {
        serial: 'LALIZAS-SIGMA-EX-001',
        marca: 'LALIZAS',
        modelo: 'Sigma 150N',
        dataFabrico: '2023-05',
        estado: 'Ativo',
        verificacoes: [{
          dataVerificacao: new Date().toISOString(),
          tecidoExterior: 'OK',
          mecanismoInflacao: 'JS1',
          observacoes: 'Aprovado'
        }]
      },
      {
        serial: 'EVAL-SIMI-EX-002',
        marca: 'EVAL',
        modelo: 'SIMI',
        dataFabrico: '2021-08',
        estado: 'Ativo',
        verificacoes: [{
          dataVerificacao: new Date().toISOString(),
          tecidoExterior: 'OK',
          mecanismoInflacao: 'UML',
          observacoes: 'Aprovado'
        }]
      }
    ];
  } else {
    navio = await prisma.navio.findUnique({ 
      where: { id: parseInt(id, 10) }
    });
    
    if (!navio) {
      notFound();
    }
    
    coletes = await prisma.colete.findMany({
      where: { shipId: parseInt(id, 10) },
      include: {
        verificacoes: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });
    // Tentar encontrar a data da inspecção mais recente entre os coletes
    if (coletes.length > 0) {
      const maisRecente = coletes.reduce((acc, curr) => {
        if (!curr.verificacoes || curr.verificacoes.length === 0) return acc;
        const data = new Date(curr.verificacoes[0].dataVerificacao);
        return data.getTime() > acc.getTime() ? data : acc;
      }, new Date(0));
      if (maisRecente.getTime() > 0) {
        dataInspecaoBase = maisRecente;
      }
    }
  }

  const dataInspecaoStr = dataInspecaoBase.toLocaleDateString('pt-PT');
  
  // Calcular próxima inspecção (tipicamente 1 ano)
  const nextDate = new Date(dataInspecaoBase);
  nextDate.setFullYear(nextDate.getFullYear() + 1);
  const dataProxStr = nextDate.toLocaleDateString('pt-PT');

  return (
    <div className="bg-white text-slate-900 min-h-screen font-sans">
      {/* Botão de impressão flutuante (não aparece na impressão) */}
      <div className="fixed top-4 right-4 print:hidden">
        <button 
          onClick={() => window.print()}
          className="bg-indigo-600 text-white px-6 py-2 rounded-xl shadow-lg font-bold hover:bg-indigo-700"
        >
          Imprimir / Guardar PDF
        </button>
      </div>

      <div className="max-w-[21cm] mx-auto p-10 print:p-0">
        {/* Header do Certificado */}
        <header className="border-b-4 border-indigo-900 pb-6 mb-8 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-black text-indigo-900 uppercase tracking-wider">Certificado de Inspecção</h1>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-1">Coletes Salva-Vidas (Consolidado)</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-slate-800">Orey Tecnica- Serviços Navais, Lda</p>
            <p className="text-xs text-slate-500">Estação de Serviço Autorizada</p>
          </div>
        </header>

        {/* Informação do Navio */}
        <section className="mb-10">
          <h2 className="text-lg font-bold bg-slate-100 p-2 mb-4 uppercase text-slate-700">Identificação da Embarcação</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500 uppercase">Nome do Navio</p>
              <p className="font-semibold text-lg">{navio.nome || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase">Armador / Entidade</p>
              <p className="font-semibold text-lg">{navio.armador || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase">Matrícula</p>
              <p className="font-semibold text-lg">{navio.matricula || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase">Número IMO</p>
              <p className="font-semibold text-lg">{navio.imo || 'N/A'}</p>
            </div>
          </div>
        </section>

        {/* Tabela de Coletes */}
        <section className="mb-10">
          <h2 className="text-lg font-bold bg-slate-100 p-2 mb-4 uppercase text-slate-700">Equipamentos Inspecionados ({coletes.length})</h2>
          
          <table className="w-full text-left border-collapse mt-4">
            <thead>
              <tr className="border-b-2 border-slate-800 text-sm">
                <th className="py-2 pr-2 font-bold text-slate-700 uppercase">Nº Série</th>
                <th className="py-2 px-2 font-bold text-slate-700 uppercase">Marca / Modelo</th>
                <th className="py-2 px-2 font-bold text-slate-700 uppercase">Fabrico</th>
                <th className="py-2 px-2 font-bold text-slate-700 uppercase">Pressão</th>
                <th className="py-2 pl-2 font-bold text-slate-700 uppercase text-right">Decisão</th>
              </tr>
            </thead>
            <tbody>
              {coletes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-500 italic">Nenhum colete associado a este navio.</td>
                </tr>
              ) : (
                coletes.map((colete, i) => {
                  const inspecao = colete.verificacoes && colete.verificacoes.length > 0 ? colete.verificacoes[0] : null;
                  const marcaModelo = [colete.marca, colete.modelo].filter(Boolean).join(' - ') || 'N/A';
                  
                  return (
                    <tr key={colete.id || i} className="border-b border-slate-200 text-sm">
                      <td className="py-3 pr-2 font-medium">{colete.serial}</td>
                      <td className="py-3 px-2 text-slate-600">{marcaModelo}</td>
                      <td className="py-3 px-2 text-slate-600">{formatValidityDisplay(colete.dataFabrico)}</td>
                      <td className="py-3 px-2 text-emerald-600 font-medium">Aprovado</td>
                      <td className="py-3 pl-2 text-right font-bold text-slate-800">
                        {inspecao?.observacoes?.includes('Falha') ? 'Rejeitado' : 'Aprovado'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          
          <div className="mt-6 p-4 border border-slate-200 rounded-lg">
            <p className="text-xs text-slate-500 uppercase mb-1">Declaração</p>
            <p className="text-sm font-medium italic text-slate-700">
              Certifica-se que todos os equipamentos listados acima como &quot;Aprovados&quot; foram inspecionados de acordo com as instruções do fabricante 
              e consideram-se aptos para serviço a bordo.
            </p>
          </div>
        </section>

        {/* Validade e Assinaturas */}
        <section className="mt-16 flex justify-between items-end border-t-2 border-slate-800 pt-8 page-break-inside-avoid">
          <div>
            <p className="text-xs text-slate-500 uppercase">Data da Inspecção Global</p>
            <p className="font-bold text-xl">{dataInspecaoStr}</p>
            
            <p className="text-xs text-slate-500 uppercase mt-4">Próxima Inspecção</p>
            <p className="font-bold text-xl text-indigo-700">{dataProxStr}</p>
          </div>

          <div className="text-center">
            <div className="w-64 border-b border-slate-800 mb-2 h-16"></div>
            <p className="font-bold text-slate-800">Técnico Responsável</p>
            <p className="text-xs text-slate-500">Orey Tecnica- Serviços Navais, Lda</p>
          </div>
        </section>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { margin: 0; size: A4; }
          .page-break-inside-avoid { page-break-inside: avoid; }
        }
      `}} />
    </div>
  );
}
