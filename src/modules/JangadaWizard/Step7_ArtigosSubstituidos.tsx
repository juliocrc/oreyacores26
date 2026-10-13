"use client";
import React from 'react';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import { ListChecks, PackageSearch, Info, ClipboardCheck, FileSpreadsheet, Send } from 'lucide-react';
import { isComponenteSubstituido, isPackItemSubstituido } from '@/lib/substituicoes-inspecao';
import { getStepNumberByKey } from './steps';
import { appToast } from '@/lib/app-toast';
import * as XLSX from 'xlsx';

type ArtigoSubstituido = {
  id: string;
  referencia: string;
  descricao: string;
  quantidade: number;
  validade?: string | null;
  origem: string;
};

export default function Step7_ArtigosSubstituidos() {
  const { inspectionData, setInspectionData, hideOrcamento } = useJangadaWizardStore();
  const stepNo = getStepNumberByKey(inspectionData, 'artigos', { hideOrcamento });

  const artigos: ArtigoSubstituido[] = [
    ...Object.values(inspectionData.packItems || {})
      .filter((item: any) => isPackItemSubstituido(item))
      .map((item: any, idx: number): ArtigoSubstituido => ({
        id: `pack-${item.referencia || item.name || idx}`,
        referencia: item.referencia || '',
        descricao: item.descricao || item.name || item.checklistName || 'Consumível',
        quantidade: Number(item.quantidade) || 0,
        validade: item.validade || null,
        origem: 'Pack',
      })),
    ...(inspectionData.componentes || [])
      .filter((comp: any) => isComponenteSubstituido(comp))
      .map((comp: any, idx: number): ArtigoSubstituido => ({
        id: `comp-${comp.id || idx}`,
        referencia: comp.reference || '',
        descricao: comp.name || comp.type || 'Componente',
        quantidade: 1,
        validade: comp.validade || null,
        origem: 'Componente',
      })),
    ...(inspectionData.containerClosureItems || [])
      .filter((item: any) => Number(item.quantidade) > 0)
      .map((item: any, idx: number): ArtigoSubstituido => ({
        id: `closure-${item.key || idx}`,
        referencia: item.referencia || '',
        descricao: item.descricao || 'Equipamento de fecho do contentor',
        quantidade: Number(item.quantidade) || 0,
        validade: null,
        origem: 'Fecho Contentor',
      })),
    ...(inspectionData.reparacoes || [])
      .filter((r: any) => r.tipo || r.descricao)
      .map((r: any, idx: number): ArtigoSubstituido => ({
        id: `repair-${r.id || idx}`,
        referencia: '',
        descricao: `${r.tipo || 'Reparação'}${r.zona ? ` — ${r.zona}` : ''}${r.descricao ? `: ${r.descricao}` : ''}`.trim(),
        quantidade: 1,
        validade: null,
        origem: 'Reparação',
      })),
  ];

  const numeroObra = inspectionData.numeroObra || '';
  const navio = inspectionData.shipName || inspectionData.shipNameManual || (inspectionData.shipDetails as any)?.nome || '—';
  const aprovacao = inspectionData.orcamento?.aprovacaoWhatsApp;
  const status = aprovacao?.status || 'rascunho';
  const jaEnviado = status === 'enviado' || status === 'aprovado' || status === 'rejeitado';

  // Submete os artigos consumidos para a Ordem de Serviço associada à jangada.
  // A OS leva o orçamento para o módulo de Orçamentos, onde a equipa precifica e aprova.
  const enviarParaOrdemOuOrcamento = () => {
    if (artigos.length === 0) {
      appToast.warning("Não existem artigos substituídos para enviar.");
      return;
    }
    if (status === 'aprovado') {
      appToast.warning("Este orçamento já está aprovado no módulo de Orçamentos.");
      return;
    }
    setInspectionData({
      orcamento: {
        linhas: inspectionData.orcamento?.linhas || [],
        valorMaoObra: inspectionData.orcamento?.valorMaoObra ?? 0,
        valorDesconto: inspectionData.orcamento?.valorDesconto ?? 0,
        isIsentoIva: inspectionData.orcamento?.isIsentoIva ?? false,
        usarOrcamento: true,
        removedIds: inspectionData.orcamento?.removedIds || [],
        certificadoRevisao: inspectionData.orcamento?.certificadoRevisao,
        aprovacaoWhatsApp: {
          ...(aprovacao || {}),
          status: 'enviado',
          aprovadoPorUtilizador: false,
          respondidoEm: undefined,
          alteracoesPedidas: undefined,
          enviadoEm: new Date().toISOString(),
        },
      },
    });
    appToast.success("Artigos enviados para a ordem de serviço. A equipa precifica e aprova no módulo de Orçamentos.");
  };

  // Ficha Excel do material consumido na inspeção (nº de obra, navio e artigos).
  const exportFichaXlsx = () => {
    if (artigos.length === 0) {
      appToast.warning("Não existem artigos consumidos para gerar a ficha.");
      return;
    }
    const rows: (string | number)[][] = [
      ["Ficha de Material Consumido na Inspeção"],
      [],
      ["Número da Obra", numeroObra || "—"],
      ["Navio", navio],
      ["Jangada / Série", `${inspectionData.brand || ''} ${inspectionData.model || ''}`.trim() || '—'],
      ["Nº Série", inspectionData.serial || "—"],
      ["Certificado", inspectionData.certificadoNumero || "—"],
      ["Data da Inspeção", inspectionData.dataInspecao || "—"],
      [],
      ["Referência", "Descrição", "Origem", "Quantidade", "Validade"],
      ...artigos.map((a) => [a.referencia || "—", a.descricao, a.origem, a.quantidade, a.validade || "—"]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 34 }, { wch: 42 }, { wch: 18 }, { wch: 12 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Material Consumido");
    const base = (numeroObra || inspectionData.serial || 'inspecao').toString().replace(/[^\w.-]+/g, '_');
    XLSX.writeFile(wb, `ficha-${base}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    appToast.success("Ficha Excel gerada e descarregada.");
  };

  const statusLabel = {
    rascunho: "Por enviar",
    enviado: "Enviado para a ordem · em análise",
    aprovado: "Aprovado no módulo de Orçamentos",
    rejeitado: "Rejeitado no módulo de Orçamentos",
  }[status] || status;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">{stepNo > 0 ? `${stepNo}. ` : ''}Artigos Substituídos</h2>
        <p className="text-slate-600 mt-1">
          Lista dos artigos efetivamente substituídos durante a inspeção. A gestão de preços e o
          orçamento são feitos pela equipa administrativa no módulo de Orçamentos.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 bg-slate-50 border-b border-slate-200 px-6 py-4">
          <ListChecks className="text-slate-500" size={20} />
          <h3 className="text-lg font-bold text-slate-800">Artigos substituídos</h3>
          {artigos.length > 0 && (
            <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full px-3 py-1.5">
              {artigos.length} artigo{artigos.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        <div className="p-6">
          {artigos.length === 0 ? (
            <div className="border-2 border-dashed border-slate-200 bg-slate-50 rounded-2xl p-10 flex flex-col items-center justify-center text-center">
              <PackageSearch className="w-10 h-10 text-slate-300 mb-3" />
              <h3 className="text-base font-semibold text-slate-700 mb-1">Sem artigos substituídos</h3>
              <p className="text-sm text-slate-500 max-w-md">
                Não foi registada qualquer substituição no pack, componentes, fecho do contentor ou reparações.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Artigo</th>
                    <th className="w-20 px-2 py-2 text-left font-semibold">Origem</th>
                    <th className="w-16 px-2 py-2 text-right font-semibold">Qtd</th>
                    <th className="w-28 px-2 py-2 text-left font-semibold">Validade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {artigos.map((artigo) => (
                    <tr key={artigo.id}>
                      <td className="px-3 py-2">
                        <div className="font-bold text-slate-800">{artigo.referencia || '—'}</div>
                        <div className="text-slate-500">{artigo.descricao}</div>
                      </td>
                      <td className="px-2 py-2 text-slate-500">{artigo.origem}</td>
                      <td className="px-2 py-2 text-right font-semibold text-slate-800">{artigo.quantidade}</td>
                      <td className="px-2 py-2 text-slate-600">{artigo.validade || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 bg-gradient-to-r from-emerald-600 to-green-500 px-6 py-4">
          <Send className="text-white" size={20} />
          <h3 className="text-lg font-bold text-white">Enviar para ordem ou orçamento</h3>
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold text-emerald-900 bg-white/90 rounded-full px-3 py-1.5">
            Estado: {statusLabel}
          </span>
        </div>

        <div className="p-6 space-y-5">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 flex gap-3 items-start">
            <Info className="text-emerald-600 shrink-0 mt-0.5" size={18} />
            <p className="text-xs text-emerald-900 leading-relaxed">
              Envie os artigos consumidos para a <b>ordem de serviço</b> desta jangada. O orçamento segue
              para o <b>módulo de Orçamentos</b>, onde a equipa revê, precifica, aprova e emite a fatura.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={enviarParaOrdemOuOrcamento}
              disabled={artigos.length === 0 || status === 'aprovado'}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold shadow-md transition-all"
              title="Enviar os artigos para a ordem de serviço / módulo de Orçamentos"
            >
              <ClipboardCheck size={16} />
              {jaEnviado ? 'Reenviar para a ordem' : 'Enviar para ordem ou orçamento'}
            </button>
            <button
              type="button"
              onClick={exportFichaXlsx}
              disabled={artigos.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 bg-white text-emerald-700 rounded-xl font-bold border border-emerald-200 hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Gerar a ficha Excel com o número da obra, navio e material consumido"
            >
              <FileSpreadsheet size={16} />
              Ficha Excel
            </button>
          </div>
        </div>
      </div>

      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex gap-3 items-start">
        <Info className="text-indigo-600 shrink-0 mt-0.5" size={20} />
        <div>
          <h4 className="text-sm font-bold text-indigo-900">Só os artigos consumidos</h4>
          <p className="text-xs text-indigo-800 mt-1">
            Apenas entram os artigos registados como substituídos. O que foi inspecionado e dado como bom não é listado.
          </p>
        </div>
      </div>
    </div>
  );
}
