'use client';

import React, { useState } from 'react';
import { Edit, Trash2, Search } from 'lucide-react';
import { getEstadoCalibracao, rotuloTipo } from '@/lib/calibracoes';
import type { CalibracaoRegisto } from '@/lib/calibracoes';

type Props = {
  registos: CalibracaoRegisto[];
  loading: boolean;
  onEdit: (registo: CalibracaoRegisto) => void;
  onDelete: (id: number) => void;
  vazioTexto: string;
};

export function CalibracaoLista({ registos, loading, onEdit, onDelete, vazioTexto }: Props) {
  const [search, setSearch] = useState('');

  const q = search.trim().toLowerCase();
  const filtrados = q
    ? registos.filter(
        i =>
          i.nome.toLowerCase().includes(q) ||
          i.referencia.toLowerCase().includes(q) ||
          i.tipo.includes(q),
      )
    : registos;

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Pesquisar por nome, referência ou tipo..."
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-600"
          />
        </div>
        <span className="text-xs font-semibold text-slate-400 ml-auto">
          {filtrados.length} resultado{filtrados.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-600 border-b border-slate-100 font-bold">
              <th className="p-4">Referência</th>
              <th className="p-4">Nome do Equipamento</th>
              <th className="p-4">Tipo</th>
              <th className="p-4">Última Data</th>
              <th className="p-4">Próxima Data</th>
              <th className="p-4">Certificado / Doc</th>
              <th className="p-4">Estado</th>
              <th className="p-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center py-10 text-slate-500">
                  A carregar...
                </td>
              </tr>
            ) : filtrados.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-10 text-slate-400 italic">
                  {vazioTexto}
                </td>
              </tr>
            ) : (
              filtrados.map(item => {
                const estado = getEstadoCalibracao(item.dataProxCalibracao);
                return (
                  <tr key={item.id} className="hover:bg-slate-50/50">
                    <td className="p-4 font-mono font-bold text-slate-800">{item.referencia}</td>
                    <td className="p-4 font-bold text-slate-900">{item.nome}</td>
                    <td className="p-4">
                      <span className="bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded text-xs uppercase font-semibold">
                        {rotuloTipo(item.tipo)}
                      </span>
                    </td>
                    <td className="p-4 text-slate-600">
                      {new Date(item.dataCalibracao).toLocaleDateString('pt-PT')}
                    </td>
                    <td className="p-4 font-semibold text-slate-900">
                      {new Date(item.dataProxCalibracao).toLocaleDateString('pt-PT')}
                    </td>
                    <td className="p-4 text-slate-500 font-mono text-xs">
                      <div className="flex items-center gap-1.5">
                        <span>{item.certificadoNum || '—'}</span>
                        {item.certificadoUrl && (
                          <a
                            href={`/api/documentacao/${item.certificadoUrl}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:text-indigo-800 p-0.5 rounded hover:bg-slate-100 inline-flex items-center"
                            title="Ver Certificado"
                          >
                            📎
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-bold border ${estado.color}`}
                      >
                        {estado.label}
                      </span>
                    </td>
                    <td className="p-4 text-right space-x-2">
                      <button
                        onClick={() => onEdit(item)}
                        className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 inline-flex items-center"
                        title="Editar"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onDelete(item.id)}
                        className="p-1.5 hover:bg-red-50 rounded-lg text-slate-500 hover:text-red-600 inline-flex items-center"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
