'use client';

import { useState } from 'react';
import React from 'react';
import { Edit2, X, Plus } from 'lucide-react';

interface ArtigoJangada {
  id?: number;
  name: string;
  quantidade: number;
  referencia: string | null;
  validade: string | Date | null;
  codigoFabricante: string | null;
  substituidoId?: number | null;
  quantidadeSubstituida?: number | null;
  lastInspecaoId?: number | null;
}

const toMonthInput = (val: string | Date | null | undefined): string => {
  if (!val) return '';
  const str = String(val);
  if (/^\d{4}-\d{2}/.test(str)) return str.substring(0, 7);
  const mmYyyy = str.match(/^(\d{1,2})\/(\d{4})$/);
  if (mmYyyy) return `${mmYyyy[2]}-${mmYyyy[1].padStart(2, '0')}`;
  const d = new Date(str);
  if (isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
};

interface EditarArtigoProps {
  jangadaId: number;
  artigo: ArtigoJangada;
  onSuccess?: () => void;
  siblingArticles?: ArtigoJangada[];
}

export function EditarArtigoDialog({
  jangadaId,
  artigo,
  onSuccess,
  siblingArticles,
}: EditarArtigoProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [propagate, setPropagate] = useState(false);

  const [name, setName] = useState(artigo.name || '');
  const [referencia, setReferencia] = useState(artigo.referencia || '');
  const [quantidade, setQuantidade] = useState(artigo.quantidade || 1);
  const [validade, setValidade] = useState(toMonthInput(artigo.validade));
  const [codigoFabricante, setCodigoFabricante] = useState(artigo.codigoFabricante || '');
  const [quantidadeSubstituida, setQuantidadeSubstituida] = useState(artigo.quantidadeSubstituida || 0);

  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  const handleAbrirDialog = () => {
    setName(artigo.name || '');
    setReferencia(artigo.referencia || '');
    setQuantidade(artigo.quantidade || 1);
    setValidade(toMonthInput(artigo.validade));
    setCodigoFabricante(artigo.codigoFabricante || '');
    setQuantidadeSubstituida(artigo.quantidadeSubstituida || 0);
    setErro('');
    setSucesso('');
    setPropagate(false);
    setOpen(true);
  };

  const handleSalvar = async () => {
    if (!name) {
      setErro('Nome do artigo é obrigatório');
      return;
    }

    setLoading(true);
    setErro('');
    setSucesso('');

    try {
      const isEdit = !!(artigo.id && artigo.id > 0);
      const url = isEdit
        ? `/api/jangadas/${jangadaId}/artigos/${artigo.id}`
        : `/api/jangadas/${jangadaId}/artigos`;
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          referencia: referencia || null,
          quantidade: Number(quantidade),
          validade: validade ? `${validade}-01T00:00:00.000Z` : null,
          codigoFabricante: codigoFabricante || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || `Erro ao ${isEdit ? 'atualizar' : 'registar'} artigo`);
        return;
      }

      // Propagação inteligente para artigos irmãos
      if (isEdit && propagate && siblingArticles) {
        const siblingsToUpdate = siblingArticles.filter(
          (art) => art.id !== artigo.id && (art.name === name || (art.referencia && art.referencia === referencia))
        );

        await Promise.all(
          siblingsToUpdate.map((sibling) => {
            if (!sibling.id) return Promise.resolve();
            return fetch(`/api/jangadas/${jangadaId}/artigos/${sibling.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: sibling.name,
                referencia: sibling.referencia,
                quantidade: sibling.quantidade,
                validade: validade ? `${validade}-01T00:00:00.000Z` : null,
                codigoFabricante: codigoFabricante || null,
              }),
            });
          })
        );
      }

      if (artigo.lastInspecaoId) {
        const hasChanged = quantidadeSubstituida !== (artigo.quantidadeSubstituida || 0);
        if (hasChanged) {
          if (artigo.substituidoId && artigo.substituidoId > 0) {
            await fetch(`/api/jangadas/${jangadaId}/artigos/${artigo.substituidoId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                quantidade: Number(quantidadeSubstituida),
              }),
            });
          } else if (quantidadeSubstituida > 0) {
            await fetch(`/api/jangadas/${jangadaId}/artigos`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name,
                referencia: referencia || null,
                quantidade: Number(quantidadeSubstituida),
                validade: validade ? `${validade}-01T00:00:00.000Z` : null,
                codigoFabricante: codigoFabricante || null,
                inspecaoId: artigo.lastInspecaoId,
              }),
            });
          }
        }
      }

      setSucesso(`✅ Artigo ${isEdit ? 'atualizado' : 'registado'} com sucesso!`);
      setTimeout(() => {
        setOpen(false);
        onSuccess?.();
      }, 1200);
    } catch (err) {
      setErro('Erro ao processar atualização');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const isEdit = !!(artigo.id && artigo.id > 0);
  const siblingsCount = isEdit && siblingArticles
    ? siblingArticles.filter(
        (art) => art.id !== artigo.id && (art.name === artigo.name || (art.referencia && art.referencia === artigo.referencia))
      ).length
    : 0;

  return (
    <>
      <button
        type="button"
        onClick={handleAbrirDialog}
        className={`rounded border border-slate-200 p-1.5 text-xs font-medium flex items-center gap-1 transition-colors no-print ${
          isEdit 
            ? 'text-slate-700 hover:bg-slate-50 hover:border-slate-300' 
            : 'text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100/80 hover:border-indigo-300'
        }`}
        title={isEdit ? "Editar Artigo" : "Adicionar Artigo ao Pack"}
      >
        {isEdit ? (
          <Edit2 size={14} className="text-slate-500" />
        ) : (
          <>
            <Plus size={14} className="text-indigo-600" />
            <span className="font-semibold text-[11px]">Adicionar</span>
          </>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto border border-slate-200">
            <div className="border-b border-slate-100 px-6 py-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-800">
                  {isEdit ? "Editar Artigo da Jangada" : "Adicionar Artigo ao Pack"}
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  {isEdit 
                    ? "Modifique as propriedades deste consumível na jangada." 
                    : "Registe este consumível obrigatório na jangada."
                  }
                </p>
              </div>
              <button 
                onClick={() => setOpen(false)} 
                className="text-slate-400 hover:text-slate-650 hover:bg-slate-50 p-1.5 rounded-xl transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-5 p-6 text-left">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Nome do Artigo *</label>
                <input
                  type="text"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Referência</label>
                  <input
                    type="text"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                    value={referencia}
                    onChange={(e) => setReferencia(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Fabricante Cód.</label>
                  <input
                    type="text"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                    value={codigoFabricante}
                    onChange={(e) => setCodigoFabricante(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Quantidade</label>
                  <input
                    type="number"
                    min="1"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                    value={quantidade}
                    onChange={(e) => setQuantidade(parseInt(e.target.value) || 1)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Validade</label>
                  <input
                    type="month"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                    value={validade}
                    onChange={(e) => setValidade(e.target.value)}
                  />
                </div>
              </div>

              {artigo.lastInspecaoId ? (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Quantidade Substituída (Na Inspeção)</label>
                  <input
                    type="number"
                    min="0"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                    value={quantidadeSubstituida}
                    onChange={(e) => setQuantidadeSubstituida(parseInt(e.target.value, 10) || 0)}
                  />
                </div>
              ) : (
                <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                  💡 A quantidade substituída na inspeção só está disponível para edição após o registo de uma inspeção para esta jangada.
                </div>
              )}

              {siblingsCount > 0 && (
                <div className="bg-indigo-50/50 border border-indigo-150 rounded-xl p-3 flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    id="propagate"
                    className="mt-0.5 rounded text-indigo-650 focus:ring-indigo-500 cursor-pointer h-4 w-4"
                    checked={propagate}
                    onChange={(e) => setPropagate(e.target.checked)}
                  />
                  <label htmlFor="propagate" className="text-xs font-semibold text-slate-700 select-none cursor-pointer leading-tight">
                    Propagar Lote e Validade para os restantes <strong className="text-indigo-700 font-bold">{siblingsCount}</strong> artigos do tipo <strong className="text-slate-800">&quot;{name}&quot;</strong>.
                  </label>
                </div>
              )}

              {erro && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                  <p className="text-sm font-semibold text-red-700">{erro}</p>
                </div>
              )}

              {sucesso && (
                <div className="rounded-xl border border-green-200 bg-green-50 p-3">
                  <p className="text-sm font-semibold text-green-700">{sucesso}</p>
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={loading}
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSalvar}
                  disabled={loading}
                  className="rounded-xl bg-indigo-600 hover:bg-indigo-700 px-5 py-2.5 text-sm font-bold text-white transition-all shadow-md shadow-indigo-600/10 disabled:opacity-50"
                >
                  {loading ? 'A guardar...' : 'Guardar Alterações'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
