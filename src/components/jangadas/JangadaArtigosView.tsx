'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { SubstituirArtigoDialog } from '@/components/jangadas/SubstituirArtigoDialog';

interface Jangada {
  id: number;
  serial: string;
  artigos: Array<{
    id: number;
    name: string;
    quantidade: number;
    referencia: string;
    validade?: string;
  }>;
}

interface JangadaArtigosViewProps {
  jangadaId: number;
}

export const JangadaArtigosView = React.memo(function JangadaArtigosView({ jangadaId }: JangadaArtigosViewProps) {
  const [jangada, setJangada] = useState<Jangada | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  const carregarJangada = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/jangadas/${jangadaId}`);
      const data = await res.json();
      setJangada(data);
    } catch (err) {
      setErro('Erro ao carregar jangada');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [jangadaId]);

  useEffect(() => {
    carregarJangada();
  }, [carregarJangada]);

  if (loading) {
    return <div className="p-4">Carregando...</div>;
  }

  if (erro) {
    return <div className="p-4 text-red-600">{erro}</div>;
  }

  if (!jangada) {
    return <div className="p-4">Jangada não encontrada</div>;
  }

  // Agrupar artigos por categoria
  const artigos = {
    emergencia: jangada.artigos.filter(
      (a) =>
        a.referencia?.startsWith('205') ||
        a.name?.includes('Paraquedas') ||
        a.name?.includes('Facho') ||
        a.name?.includes('Pote')
    ),
    primeirosSocorros: jangada.artigos.filter((a) => a.referencia === '30202050'),
    outros: jangada.artigos.filter(
      (a) =>
        !a.referencia?.startsWith('205') &&
        a.referencia !== '30202050'
    ),
  };

  const validadeStatus = (validade?: string) => {
    if (!validade) return null;
    let exp: Date;
    const mm = validade.match(/^(\d{1,2})\/(\d{4})$/);
    if (mm) exp = new Date(Number(mm[2]), Number(mm[1]) - 1, 1);
    else exp = new Date(validade);
    if (isNaN(exp.getTime())) return null;
    const days = Math.ceil((exp.getTime() - Date.now()) / 86400000);
    return { days };
  };

  const artigosComValidade = jangada.artigos
    .map((a) => ({ a, status: validadeStatus(a.validade) }))
    .filter((x) => x.status !== null) as Array<{ a: (typeof jangada.artigos)[number]; status: { days: number } }>;

  const countCaducados = artigosComValidade.filter((x) => x.status.days < 0).length;
  const countCaducando = artigosComValidade.filter((x) => x.status.days >= 0 && x.status.days <= 60).length;
  const countValidos = artigosComValidade.filter((x) => x.status.days > 60).length;
  const countSemValidade = jangada.artigos.length - artigosComValidade.length;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border p-4">
        <h2 className="text-lg font-semibold">Artigos - {jangada.serial}</h2>
        <p className="text-sm text-gray-600">Total: {jangada.artigos.length} artigos</p>
      </div>

      {/* Validade summary strip */}
      <div className="bg-sky-50 rounded-lg shadow-sm border border-sky-200 p-4 text-slate-900 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="grid grid-cols-4 gap-3 flex-1 text-center">
          <div className="bg-emerald-50 border border-emerald-300 rounded-lg py-2 shadow-sm">
            <p className="text-lg font-black text-emerald-700">{countValidos}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Válidos</p>
          </div>
          <div className="bg-amber-50 border border-amber-300 rounded-lg py-2 shadow-sm">
            <p className="text-lg font-black text-amber-700">{countCaducando}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">A caducar</p>
          </div>
          <div className="bg-red-50 border border-red-300 rounded-lg py-2 shadow-sm">
            <p className="text-lg font-black text-red-700">{countCaducados}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Caducados</p>
          </div>
          <div className="bg-slate-100 border border-slate-300 rounded-lg py-2 shadow-sm">
            <p className="text-lg font-black text-slate-700">{countSemValidade}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">S/ validade</p>
          </div>
        </div>
        <div className="hidden sm:block text-right text-xs font-bold uppercase tracking-wider text-slate-600">
          {countCaducados > 0 || countCaducando > 0
            ? 'Requer substituição'
            : 'Dossier conforme'}
        </div>
      </div>

      {/* Artigos de Emergência */}
      {artigos.emergencia.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="bg-orange-50 border-b p-4">
            <h3 className="font-semibold text-orange-900">🆘 Artigos de Emergência</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-medium">Artigo</th>
                  <th className="px-4 py-2 text-left text-sm font-medium">Referência</th>
                  <th className="px-4 py-2 text-center text-sm font-medium">Quantidade</th>
                  <th className="px-4 py-2 text-left text-sm font-medium">Validade</th>
                  <th className="px-4 py-2 text-center text-sm font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {artigos.emergencia.map((artigo) => (
                  <tr key={artigo.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{artigo.name}</td>
                    <td className="px-4 py-2 text-sm text-gray-600">{artigo.referencia}</td>
                    <td className="px-4 py-2 text-center">
                      <span className="inline-block bg-orange-100 text-orange-800 px-2 py-1 rounded text-sm font-medium">
                        {artigo.quantidade}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm">
                      {(() => {
                        const s = validadeStatus(artigo.validade);
                        if (!s) return <span className="text-gray-400">-</span>;
                        if (s.days < 0) return <span className="inline-flex px-2 py-1 rounded-md text-xs font-bold bg-red-100 text-red-700 border border-red-200">Caducado</span>;
                        if (s.days <= 60) return <span className="inline-flex px-2 py-1 rounded-md text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">A caducar ({s.days}d)</span>;
                        return <span className="inline-flex px-2 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">Válido</span>;
                      })()}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <SubstituirArtigoDialog
                        jangadaId={jangadaId}
                        artigo={artigo}
                        onSuccess={carregarJangada}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Primeiros Socorros */}
      {artigos.primeirosSocorros.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="bg-green-50 border-b p-4">
            <h3 className="font-semibold text-green-900">🏥 Primeiros Socorros</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-medium">Artigo</th>
                  <th className="px-4 py-2 text-left text-sm font-medium">Referência</th>
                  <th className="px-4 py-2 text-center text-sm font-medium">Quantidade</th>
                  <th className="px-4 py-2 text-left text-sm font-medium">Validade</th>
                  <th className="px-4 py-2 text-center text-sm font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {artigos.primeirosSocorros.map((artigo) => (
                  <tr key={artigo.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{artigo.name}</td>
                    <td className="px-4 py-2 text-sm text-gray-600">{artigo.referencia}</td>
                    <td className="px-4 py-2 text-center">
                      <span className="inline-block bg-green-100 text-green-800 px-2 py-1 rounded text-sm font-medium">
                        {artigo.quantidade}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm">
                      {(() => {
                        const s = validadeStatus(artigo.validade);
                        if (!s) return <span className="text-gray-400">-</span>;
                        if (s.days < 0) return <span className="inline-flex px-2 py-1 rounded-md text-xs font-bold bg-red-100 text-red-700 border border-red-200">Caducado</span>;
                        if (s.days <= 60) return <span className="inline-flex px-2 py-1 rounded-md text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">A caducar ({s.days}d)</span>;
                        return <span className="inline-flex px-2 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">Válido</span>;
                      })()}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <SubstituirArtigoDialog
                        jangadaId={jangadaId}
                        artigo={artigo}
                        onSuccess={carregarJangada}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Outros Artigos */}
      {artigos.outros.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="bg-blue-50 border-b p-4">
            <h3 className="font-semibold text-blue-900">📦 Outros Artigos</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-medium">Artigo</th>
                  <th className="px-4 py-2 text-left text-sm font-medium">Referência</th>
                  <th className="px-4 py-2 text-center text-sm font-medium">Quantidade</th>
                  <th className="px-4 py-2 text-left text-sm font-medium">Validade</th>
                  <th className="px-4 py-2 text-center text-sm font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {artigos.outros.map((artigo) => (
                  <tr key={artigo.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{artigo.name}</td>
                    <td className="px-4 py-2 text-sm text-gray-600">{artigo.referencia}</td>
                    <td className="px-4 py-2 text-center">
                      <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm font-medium">
                        {artigo.quantidade}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm">
                      {(() => {
                        const s = validadeStatus(artigo.validade);
                        if (!s) return <span className="text-gray-400">-</span>;
                        if (s.days < 0) return <span className="inline-flex px-2 py-1 rounded-md text-xs font-bold bg-red-100 text-red-700 border border-red-200">Caducado</span>;
                        if (s.days <= 60) return <span className="inline-flex px-2 py-1 rounded-md text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">A caducar ({s.days}d)</span>;
                        return <span className="inline-flex px-2 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">Válido</span>;
                      })()}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <SubstituirArtigoDialog
                        jangadaId={jangadaId}
                        artigo={artigo}
                        onSuccess={carregarJangada}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
});
