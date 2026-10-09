"use client";

import { useEffect, useState, use } from "react";
import { Loader2, ShieldCheck, AlertCircle, CreditCard } from "lucide-react";

const PAGAMENTO_BADGE_CLASSES: Record<string, string> = {
  Pendente: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "Pago Parcialmente": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  Pago: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  Vencido: "bg-rose-500/20 text-rose-300 border-rose-500/30",
};

type PublicOrder = {
  id: number;
  numeroOrdem?: string | null;
  status?: string | null;
  orcamentoStatus?: string | null;
  valorPecas?: number | null;
  valorMaoObra?: number | null;
  valorDesconto?: number | null;
  isIsentoIva?: boolean | null;
  valorTotal?: number | null;
  metadados?: any;
  createdAt?: string | null;
  jangada?: { serial?: string | null; brand?: string | null; model?: string | null; owner?: string | null; shipNameManual?: string | null } | null;
  cliente?: { nome?: string | null; nif?: string | null; morada?: string | null; localidade?: string | null; ilha?: string | null } | null;
  serviceStation?: { nome?: string | null } | null;
};

export default function PublicOrcamentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadOrder() {
      try {
        const res = await fetch(`/api/ordens-servico/${id}`, { cache: "no-store" });
        if (!res.ok) throw new Error("Orçamento não encontrado.");
        const data = await res.json();
        setOrder(data);
      } catch (err: any) {
        setError(err?.message || "Erro ao carregar orçamento.");
      } finally {
        setLoading(false);
      }
    }
    loadOrder();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="flex items-center gap-2 text-teal-400">
          <Loader2 className="animate-spin" size={24} /> A carregar orçamento...
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-4">
          <AlertCircle className="mx-auto text-rose-500" size={48} />
          <h1 className="text-lg font-bold text-white">Orçamento Indisponível</h1>
          <p className="text-sm text-slate-400">{error || "Não foi possível encontrar este orçamento."}</p>
        </div>
      </div>
    );
  }

  const pecas = Number(order.valorPecas || 0);
  const maoObra = Number(order.valorMaoObra || 0);
  const desconto = Number(order.valorDesconto || 0);
  const subtotal = Math.max(0, pecas + maoObra - desconto);
  const iva = order.isIsentoIva ? 0 : subtotal * 0.16;
  const total = subtotal + iva;

  const meta = order.metadados || {};
  const pagamentoStatus = meta.pagamentoStatus || "Pendente";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 text-teal-400 font-bold text-sm mb-1">
              <ShieldCheck size={18} /> Orçamento de Inspeção / Serviço
            </div>
            <h1 className="text-2xl font-black text-white">Ordem #{order.numeroOrdem || order.id}</h1>
            <p className="text-xs text-slate-400 mt-1">Emitido por: {order.serviceStation?.nome || "Orey Técnica"}</p>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
            <div className={`px-4 py-1.5 rounded-full text-xs font-bold border ${
                order.orcamentoStatus === "Aprovado" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" :
                order.orcamentoStatus === "Rejeitado" ? "bg-rose-500/20 text-rose-300 border-rose-500/30" :
                "bg-amber-500/20 text-amber-300 border-amber-500/30"
              }`}>
                Estado: {order.orcamentoStatus || "Em análise"}
              </div>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${PAGAMENTO_BADGE_CLASSES[pagamentoStatus] || PAGAMENTO_BADGE_CLASSES.Pendente}`}>
              <CreditCard size={12} /> Pagamento: {pagamentoStatus}
            </span>
          </div>
        </div>

        {/* Client & Equipment info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
            <div className="text-xs font-semibold text-slate-400 uppercase">Cliente</div>
            <div className="font-bold text-white text-base">{order.cliente?.nome || order.jangada?.owner || "Cliente Particular"}</div>
            <div className="text-xs text-slate-400">NIF: <span className="text-slate-200 font-mono">{order.cliente?.nif || "—"}</span></div>
            <div className="text-xs text-slate-400">Morada: <span className="text-slate-200">{order.cliente?.morada || "—"}</span></div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
            <div className="text-xs font-semibold text-slate-400 uppercase">Equipamento / Embarcação</div>
            <div className="font-bold text-white text-base">{order.jangada?.shipNameManual || "Embarcação Geral"}</div>
            <div className="text-xs text-slate-400">Jangada: <span className="text-slate-200">{order.jangada?.brand || ""} {order.jangada?.model || ""}</span></div>
            <div className="text-xs text-slate-400">Nº de Série: <span className="text-teal-300 font-mono">{order.jangada?.serial || "—"}</span></div>
          </div>
        </div>

        {/* Costs Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-teal-400">Detalhe de Custos</h2>
          <div className="border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-800/80 text-xs font-semibold text-slate-200 uppercase">
                  <th className="p-3">Descrição</th>
                  <th className="p-3 text-center">Qtd</th>
                  <th className="p-3 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono text-xs">
                <tr>
                  <td className="p-3 text-slate-200 font-sans">Mão-de-obra (serviços técnicos)</td>
                  <td className="p-3 text-center">1</td>
                  <td className="p-3 text-right font-bold">€ {maoObra.toFixed(2)}</td>
                </tr>
                <tr>
                  <td className="p-3 text-slate-200 font-sans">Peças e Materiais aplicados</td>
                  <td className="p-3 text-center">1</td>
                  <td className="p-3 text-right font-bold">€ {pecas.toFixed(2)}</td>
                </tr>
                {desconto > 0 && (
                  <tr className="text-rose-400">
                    <td className="p-3 font-sans">Desconto Comercial</td>
                    <td className="p-3 text-center">1</td>
                    <td className="p-3 text-right font-bold">- € {desconto.toFixed(2)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col items-end space-y-1.5 font-mono text-sm">
            <div className="flex justify-between w-64 text-slate-400 text-xs">
              <span>Subtotal:</span>
              <span>€ {subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between w-64 text-slate-400 text-xs">
              <span>IVA ({order.isIsentoIva ? "Isento" : "16%"}):</span>
              <span>€ {iva.toFixed(2)}</span>
            </div>
            <div className="flex justify-between w-64 text-teal-400 font-bold text-base pt-2 border-t border-slate-800">
              <span>TOTAL:</span>
              <span>€ {total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Status notice — decisão da equipa Orey (aprovada no módulo de Orçamentos) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-3">
          {order.orcamentoStatus === "Aprovado" ? (
            <>
              <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <ShieldCheck className="text-emerald-400" size={26} />
              </div>
              <h2 className="text-base font-bold text-emerald-300">Orçamento aprovado</h2>
              <p className="text-sm text-slate-400">
                A equipa Orey confirmou esta proposta. Será contactado para combinar a execução do serviço e o pagamento.
              </p>
            </>
          ) : order.orcamentoStatus === "Rejeitado" ? (
            <>
              <div className="mx-auto w-12 h-12 rounded-full bg-rose-500/15 flex items-center justify-center">
                <AlertCircle className="text-rose-400" size={26} />
              </div>
              <h2 className="text-base font-bold text-rose-300">Orçamento não aprovado</h2>
              <p className="text-sm text-slate-400">
                Esta proposta não avançou. Se tiver dúvidas, contacte a Orey Açores.
              </p>
            </>
          ) : (
            <>
              <div className="mx-auto w-12 h-12 rounded-full bg-amber-500/15 flex items-center justify-center">
                <Loader2 className="text-amber-400 animate-spin" size={26} />
              </div>
              <h2 className="text-base font-bold text-amber-300">Orçamento em análise</h2>
              <p className="text-sm text-slate-400">
                A proposta foi recebida pela equipa Orey e encontra-se em análise técnica. A decisão será comunicada,
                geralmente dentro de 1–2 dias úteis.
              </p>
              <p className="text-xs text-slate-500">
                Para esclarecimentos contacte-nos com a referência {order.numeroOrdem || `#${order.id}`}.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
