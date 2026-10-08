"use client";

import React from "react";
import { Activity, Cpu, Filter, Gauge, KeyRound, Scale, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getEstadoCalibracao } from "@/lib/calibracoes";
import type { CalibracaoRegisto } from "@/lib/calibracoes";

const ICONES: Record<string, LucideIcon> = {
  barometro: Gauge,
  manometro: Activity,
  balanca: Scale,
  chave_dinamometrica: KeyRound,
  calibracao: Gauge,
  compressor_filtro: Filter,
  compressor_oleo: Cpu,
  compressor_ar: Activity,
  compressor_valvula: Cpu,
};

export { ICONES as CALIBRACAO_ICONES };

type Props = {
  registos: CalibracaoRegisto[];
  onEdit: (registo: CalibracaoRegisto) => void;
  rotuloData: string;
  rotuloAtualizacao: string;
  acaoEditar: string;
  acaoRecalibrar: string;
};

export function CalibracaoBancada({
  registos,
  onEdit,
  rotuloData,
  rotuloAtualizacao,
  acaoEditar,
  acaoRecalibrar,
}: Props) {
  const bancada = registos.filter((i) => i.ativo);
  const prontos = bancada.filter((i) => getEstadoCalibracao(i.dataProxCalibracao).type === "ok");
  const pct = bancada.length ? Math.round((prontos.length / bancada.length) * 100) : 0;

  return (
    <div className="bg-sky-50 border border-sky-200 rounded-3xl p-5 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
        <div>
          <h2 className="text-slate-900 font-black flex items-center gap-2">
            <Wrench className="w-5 h-5 text-sky-600" />
            Mesa de Trabalho
          </h2>
          <p className="text-slate-600 text-xs mt-0.5">
            Bancada de ensaio — equipamento pronto para a próxima inspeção
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Prontidão da Bancada</p>
            <p className="text-lg font-black text-sky-700">
              {prontos.length} / {bancada.length}
            </p>
          </div>
          <div className="w-40 h-2.5 bg-white border border-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                pct === 100 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : "bg-red-500"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {bancada.length === 0 ? (
        <p className="text-slate-500 italic text-sm text-center py-6">Sem equipamentos ativos na bancada.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {bancada.map((item) => {
            const estado = getEstadoCalibracao(item.dataProxCalibracao);
            const Icon = ICONES[item.tipo] || Gauge;
            const atualizado = item.updatedAt ? new Date(item.updatedAt) : null;
            return (
              <div
                key={item.id}
                className={`relative rounded-2xl p-4 border flex flex-col gap-3 transition-all hover:shadow-lg ${
                  estado.type === "ok"
                    ? "bg-white border-emerald-200"
                    : estado.type === "soon"
                      ? "bg-orange-50 border-orange-300"
                      : "bg-red-50 border-red-300"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div
                    className={`p-3 rounded-xl ${
                      estado.type === "ok"
                        ? "bg-emerald-100 text-emerald-700"
                        : estado.type === "soon"
                          ? "bg-orange-100 text-orange-700"
                          : "bg-red-100 text-red-700"
                    }`}
                  >
                    <Icon className="w-7 h-7" />
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold ${estado.color}`}
                  >
                    <span className="relative inline-flex">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          estado.type === "ok"
                            ? "bg-emerald-500"
                            : estado.type === "soon"
                              ? "bg-orange-500"
                              : "bg-red-500"
                        } ${estado.type !== "expired" ? "animate-pulse" : ""}`}
                      />
                      {estado.type !== "expired" && (
                        <span
                          className={`absolute inline-flex h-full w-full rounded-full ${
                            estado.type === "ok" ? "bg-emerald-500" : "bg-orange-500"
                          } opacity-60 animate-ping`}
                        />
                      )}
                    </span>
                    {estado.label}
                  </span>
                </div>

                <div>
                  <p className="text-slate-900 font-bold text-sm leading-tight">{item.nome}</p>
                  <p className="text-slate-500 font-mono text-xs mt-1">{item.referencia}</p>
                </div>

                <div className="text-xs text-slate-600 space-y-1 mt-auto">
                  <p className="flex items-center justify-between">
                    <span>{rotuloData}</span>
                    <span className="font-semibold text-slate-900">
                      {new Date(item.dataProxCalibracao).toLocaleDateString("pt-PT")}
                    </span>
                  </p>
                  <p className="flex items-center justify-between">
                    <span>{rotuloAtualizacao}</span>
                    <span className="font-semibold text-slate-700">
                      {atualizado ? atualizado.toLocaleDateString("pt-PT") : "—"}
                    </span>
                  </p>
                </div>

                {estado.type === "expired" && (
                  <div className="absolute inset-x-3 bottom-3 bg-red-100 border border-red-300 text-red-700 text-[10px] font-bold rounded-lg px-2 py-1 text-center uppercase tracking-wide">
                    Fora de serviço — {acaoRecalibrar.toLowerCase()}
                  </div>
                )}

                <button
                  onClick={() => onEdit(item)}
                  className={`mt-1 w-full py-2 rounded-xl text-xs font-bold border transition-colors ${
                    estado.type === "expired"
                      ? "bg-red-600 text-white border-red-600 hover:bg-red-500"
                      : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                  }`}
                >
                  {estado.type === "expired" ? acaoRecalibrar : acaoEditar}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
