import React from 'react';
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { formatValidityDisplay } from "@/lib/date-display";
import PrintButton from "./PrintButton";

type ColeteCertificado = {
  serial: string;
  marca: string | null;
  modelo: string | null;
  dataFabrico: string | null;
};

type InspecaoCertificado = {
  id: number;
  dataVerificacao: string | Date;
  inspectorNome: string | null;
  observacoes: string | null;
  tecidoExterior: string | null;
  mecanismoInflacao: string | null;
};

export default async function CertificadoColetePrintPage({ 
  params 
}: { 
  params: Promise<{ id: string, inspecaoId: string }> 
}) {
  const { id, inspecaoId } = await params;
  
  const isLalizasMock = id === 'example-lalizas';
  const isEvalMock = id === 'example-eval';
  
  let colete: ColeteCertificado | null = null;
  let inspecao: InspecaoCertificado | null = null;

  if (isLalizasMock) {
    colete = {
      serial: 'LALIZAS-SIGMA-EX-001',
      marca: 'LALIZAS',
      modelo: 'Sigma 150N',
      dataFabrico: '2023-05',
    };
    inspecao = {
      id: 8888,
      dataVerificacao: new Date().toISOString(),
      inspectorNome: 'Técnico Exemplo',
      observacoes: 'Inspecção de exemplo aprovada.',
      tecidoExterior: 'OK',
      mecanismoInflacao: 'JS1',
    };
  } else if (isEvalMock) {
    colete = {
      serial: 'EVAL-SIMI-EX-002',
      marca: 'EVAL',
      modelo: 'SIMI',
      dataFabrico: '2021-08',
    };
    inspecao = {
      id: 8889,
      dataVerificacao: new Date().toISOString(),
      inspectorNome: 'Técnico Exemplo',
      observacoes: 'Inspecção de exemplo baseada nos requisitos EVAL SIMI.',
      tecidoExterior: 'OK',
      mecanismoInflacao: 'UML',
    };
  } else {
    colete = await prisma.colete.findUnique({ where: { id: parseInt(id, 10) } });
    inspecao = await prisma.verificacaoColete.findUnique({ where: { id: parseInt(inspecaoId, 10) } });
    
    if (!colete || !inspecao) {
      notFound();
    }
  }

  const dataInspecaoStr = new Date(inspecao.dataVerificacao).toLocaleDateString('pt-PT');
  
  // Calcular próxima inspecção (tipicamente 1 ano)
  const nextDate = new Date(inspecao.dataVerificacao);
  nextDate.setFullYear(nextDate.getFullYear() + 1);
  const dataProxStr = nextDate.toLocaleDateString('pt-PT');

  return (
    <div className="bg-white text-slate-900 min-h-screen font-sans">
      {/* Botão de impressão flutuante (não aparece na impressão) */}
      <div className="fixed top-4 right-4 print:hidden">
        <PrintButton />
      </div>

      <div className="max-w-[21cm] mx-auto p-10 print:p-0">
        {/* Header do Certificado */}
        <header className="border-b-4 border-indigo-900 pb-6 mb-8 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-black text-indigo-900 uppercase tracking-wider">Certificado de Inspecção</h1>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-1">Colete Salva-Vidas Insuflável</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-slate-800">Orey Azores</p>
            <p className="text-xs text-slate-500">Estação de Serviço Autorizada</p>
          </div>
        </header>

        {/* Informação do Equipamento */}
        <section className="mb-10">
          <h2 className="text-lg font-bold bg-slate-100 p-2 mb-4 uppercase text-slate-700">Identificação do Equipamento</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500 uppercase">Marca</p>
              <p className="font-semibold text-lg">{colete.marca || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase">Modelo</p>
              <p className="font-semibold text-lg">{colete.modelo || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase">Nº de Série</p>
              <p className="font-semibold text-lg">{colete.serial}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase">Data de Fabrico</p>
                <p className="font-semibold text-lg">{formatValidityDisplay(colete.dataFabrico)}</p>
            </div>
          </div>
        </section>

        {/* Resumo da Inspecção */}
        <section className="mb-10">
          <h2 className="text-lg font-bold bg-slate-100 p-2 mb-4 uppercase text-slate-700">Resultados da Inspecção</h2>
          <div className="grid grid-cols-2 gap-y-4">
            <div className="flex border-b border-dashed border-slate-300 pb-2">
              <span className="w-1/2 text-sm text-slate-600">Teste de Pressão</span>
              <span className="w-1/2 font-bold text-emerald-700">Aprovado</span>
            </div>
            <div className="flex border-b border-dashed border-slate-300 pb-2">
              <span className="w-1/2 text-sm text-slate-600">Estado Exterior</span>
              <span className="w-1/2 font-bold text-emerald-700">{inspecao.tecidoExterior || 'OK'}</span>
            </div>
            <div className="flex border-b border-dashed border-slate-300 pb-2">
              <span className="w-1/2 text-sm text-slate-600">Mecanismo</span>
              <span className="w-1/2 font-bold text-slate-800">{inspecao.mecanismoInflacao || 'Verificado'}</span>
            </div>
            <div className="flex border-b border-dashed border-slate-300 pb-2">
              <span className="w-1/2 text-sm text-slate-600">Peças Substituídas</span>
              <span className="w-1/2 font-bold text-slate-800">Conforme Registo</span>
            </div>
          </div>
          
          <div className="mt-4 p-4 border border-slate-200 rounded-lg">
            <p className="text-xs text-slate-500 uppercase mb-1">Observações do Inspetor</p>
            <p className="text-sm font-medium italic text-slate-700">{inspecao.observacoes || 'Nenhuma anomalia registada. Equipamento aprovado para serviço.'}</p>
          </div>
        </section>

        {/* Validade e Assinaturas */}
        <section className="mt-16 flex justify-between items-end border-t-2 border-slate-800 pt-8">
          <div>
            <p className="text-xs text-slate-500 uppercase">Data da Inspecção</p>
            <p className="font-bold text-xl">{dataInspecaoStr}</p>
            
            <p className="text-xs text-slate-500 uppercase mt-4">Próxima Inspecção</p>
            <p className="font-bold text-xl text-indigo-700">{dataProxStr}</p>
          </div>

          <div className="text-center">
            <div className="w-64 border-b border-slate-800 mb-2 h-16"></div>
            <p className="font-bold text-slate-800">{inspecao.inspectorNome || 'Técnico Responsável'}</p>
            <p className="text-xs text-slate-500">Assinatura</p>
          </div>
        </section>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { margin: 0; size: A4; }
        }
      `}} />
    </div>
  );
}
