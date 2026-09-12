'use client';

import { useState } from 'react';
import BarcodeScanner from '@/components/shared/BarcodeScanner';
import { ScanLine } from 'lucide-react';
import { toast } from '@/components/shared/Toast';

interface Stock {
  referencia: string;
  descricao: string;
  precoVenda: number;
  quantidade: number;
  quantidadeMinima?: number | null;
  categoria?: string | null;
  codigoFabricante?: string;
}

interface ArtigoJangada {
  id: number;
  name: string;
  quantidade: number;
  referencia: string;
}

interface SubstituirArtigoProps {
  jangadaId: number;
  artigo: ArtigoJangada;
  onSuccess?: () => void;
}

export function SubstituirArtigoDialog({
  jangadaId,
  artigo,
  onSuccess,
}: SubstituirArtigoProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [novaReferencia, setNovaReferencia] = useState('');
  const [novaQuantidade, setNovaQuantidade] = useState(artigo.quantidade);
  const [opcoes, setOpcoes] = useState<Array<Stock>>([]);
  const [filtro, setFiltro] = useState<'all' | 'hru' | 'available' | 'outOfStock'>('all');
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [showScanner, setShowScanner] = useState(false);

  const handleAbrirDialog = async () => {
    setOpen(true);
    // Buscar opções de substituição
    try {
      const res = await fetch(
        `/api/jangadas/substituir-artigo?jangadaId=${jangadaId}&artigoId=${artigo.id}&referencia=${encodeURIComponent(artigo.referencia || '')}`
      );
      const data = await res.json();
      setOpcoes(data.stockDisponivel || []);
    } catch (err) {
      console.error('Erro ao buscar opções:', err);
      setErro('Erro ao buscar opções de substituição');
    }
  };

  const handleSubstituir = async () => {
    if (!novaReferencia) {
      setErro('Seleccione um novo artigo');
      return;
    }

    setLoading(true);
    setErro('');
    setSucesso('');

    try {
      const res = await fetch('/api/jangadas/substituir-artigo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jangadaId,
          artigoId: artigo.id,
          referenciaAtual: artigo.referencia || '',
          novaReferencia,
          quantidade: novaQuantidade,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const message = data.error || 'Erro ao substituir artigo';
        toast.error(message, 'Substituição falhou');
        setErro(message);
        return;
      }

      const consumed = data.stock?.quantidadeAntes != null && data.stock?.quantidadeDepois != null
        ? data.stock.quantidadeAntes - data.stock.quantidadeDepois
        : novaQuantidade;
      const stockMessage = data.stock
        ? `Stock usado: ${consumed} (${data.stock.referencia})`
        : `Stock usado: ${consumed}`;
      const movimentacaoMessage = data.movimentacaoStock ? 'Movimentação de stock registada.' : 'Movimentação de stock não registada.';

      toast.success(
        `Substituído ${data.originalArticle?.name || artigo.name} → ${data.artigo?.name || novaReferencia}. ${stockMessage} ${movimentacaoMessage}`,
        'Substituição concluída',
        7000,
      );

      setSucesso('✅ Artigo substituído com sucesso!');
      setTimeout(() => {
        setOpen(false);
        onSuccess?.();
      }, 1500);
    } catch (err) {
      setErro('Erro ao processar substituição');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const novoArtigo = opcoes.find((o) => o.referencia === novaReferencia);

  const sortedOpcoes = [...opcoes].sort((a, b) =>
    (b.quantidade - a.quantidade) || a.descricao.localeCompare(b.descricao),
  );

  const isHruOption = (opcao: Stock) => {
    const value = `${opcao.categoria || ''} ${opcao.descricao}`.toLowerCase();
    return value.includes('hru') || value.includes('disparo') || opcao.referencia?.toLowerCase().includes('20701002');
  };

  const filteredOpcoes = sortedOpcoes.filter((opcao) => {
    switch (filtro) {
      case 'hru':
        return isHruOption(opcao);
      case 'available':
        return opcao.quantidade > 0;
      case 'outOfStock':
        return opcao.quantidade <= 0;
      default:
        return true;
    }
  });

  return (
    <div>
      <button
        type="button"
        onClick={handleAbrirDialog}
        className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
      >
        🔄 Substituir
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="border-b px-6 py-4">
              <h2 className="text-lg font-semibold">Substituir Artigo na Jangada</h2>
              <p className="mt-1 text-sm text-gray-600">
                Escolha um novo artigo do stock para substituir o atual
              </p>
            </div>

            <div className="space-y-4 p-6">
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                <label className="text-sm font-semibold text-yellow-900">
                  Artigo Atual
                </label>
                <div className="mt-2 space-y-1">
                  <p className="font-medium">{artigo.name}</p>
                  <p className="text-sm text-gray-600">Referência: {artigo.referencia}</p>
                  <p className="text-sm text-gray-600">Quantidade: {artigo.quantidade}</p>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="novo-artigo" className="block text-sm font-medium text-gray-700">
                  Novo Artigo (Stock)
                </label>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: 'all', label: 'Todos' },
                      { key: 'hru', label: 'Só HRU' },
                      { key: 'available', label: 'Só disponíveis' },
                      { key: 'outOfStock', label: 'Só esgotados' },
                    ].map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setFiltro(option.key as typeof filtro)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                          filtro === option.key
                            ? 'bg-indigo-600 text-white'
                            : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-2 flex-col lg:flex-row">
                    <select
                      id="novo-artigo"
                      value={novaReferencia}
                      onChange={(e) => setNovaReferencia(e.target.value)}
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">Seleccione um artigo...</option>
                      {filteredOpcoes.map((opcao) => (
                        <option key={opcao.referencia} value={opcao.referencia}>
                          {opcao.descricao} | REF: {opcao.referencia} | Stock: {opcao.quantidade}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowScanner(true)}
                      className="shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 flex items-center gap-1"
                      title="Ler código de barras"
                    >
                      <ScanLine size={16} /> Scan
                    </button>
                  </div>

                  {filteredOpcoes.length > 0 && (
                    <div className="grid gap-2 pt-3 sm:grid-cols-2">
                      {filteredOpcoes.map((opcao) => {
                        const isOutOfStock = opcao.quantidade <= 0;
                        return (
                          <button
                            key={opcao.referencia}
                            type="button"
                            onClick={() => !isOutOfStock && setNovaReferencia(opcao.referencia)}
                            disabled={isOutOfStock}
                            className={`rounded-xl border p-3 text-left transition-all ${
                              isOutOfStock
                                ? 'border-red-200 bg-red-50 text-red-700 cursor-not-allowed opacity-80'
                                : novaReferencia === opcao.referencia
                                ? 'border-blue-500 bg-blue-50 shadow-sm'
                                : 'border-gray-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-900 truncate">{opcao.descricao}</p>
                                <p className="mt-1 text-xs text-slate-500 truncate">REF: {opcao.referencia}</p>
                              </div>
                              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${isOutOfStock ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                {isOutOfStock ? 'Sem stock' : `Stock ${opcao.quantidade}`}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <p className="text-sm text-slate-500">
                    {novaReferencia ? (
                      novoArtigo ? (
                        <span>
                          Quantidade disponível em stock:{' '}
                          <span className="font-semibold text-slate-900">{novoArtigo.quantidade}</span>
                        </span>
                      ) : (
                        <span>Artigo selecionado não encontrado no stock.</span>
                      )
                    ) : (
                      <span>Selecione um artigo para ver a quantidade disponível em stock.</span>
                    )}
                  </p>
                  {opcoes.length === 0 && (
                    <p className="text-sm text-gray-500">Nenhum artigo disponível</p>
                  )}
                </div>

                {showScanner && (
                  <BarcodeScanner
                    onScan={async (code) => {
                      setShowScanner(false);
                      const found = opcoes.find(
                        (o) =>
                          o.referencia.toUpperCase() === code.toUpperCase() ||
                          o.codigoFabricante?.toUpperCase() === code.toUpperCase(),
                      );
                      if (found) {
                        setNovaReferencia(found.referencia);
                      } else {
                        try {
                          const res = await fetch(`/api/stock?q=${encodeURIComponent(code)}`);
                          const data = await res.json();
                          if (Array.isArray(data) && data.length > 0) {
                            setNovaReferencia(data[0].referencia);
                          } else {
                            setErro(`Artigo com código "${code}" não encontrado no stock.`);
                          }
                        } catch {
                          setErro('Erro ao procurar código.');
                        }
                      }
                    }}
                    onClose={() => setShowScanner(false)}
                  />
                )}

                {novoArtigo && (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                    <label className="text-sm font-semibold text-green-900">
                      Novo Artigo (Pré-visualização)
                    </label>
                    <div className="mt-2 space-y-1">
                      <p className="font-medium">{novoArtigo.descricao}</p>
                      <p className="text-sm text-gray-600">Referência: {novoArtigo.referencia}</p>
                      <p className="text-sm text-gray-600">Disponível em stock: {novoArtigo.quantidade}</p>
                      <p className="text-sm text-gray-600">Categoria: {novoArtigo.categoria || '—'}</p>
                      <p className="text-sm text-gray-600">Preço: €{novoArtigo.precoVenda}</p>
                      {novoArtigo.codigoFabricante && (
                        <p className="text-sm text-gray-600">Código Fabricante: {novoArtigo.codigoFabricante}</p>
                      )}
                      {novoArtigo.quantidadeMinima != null && (
                        <p className="text-sm text-gray-600">Min. stock: {novoArtigo.quantidadeMinima}</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label htmlFor="quantidade" className="block text-sm font-medium text-gray-700">
                    Quantidade
                  </label>
                  <input
                    id="quantidade"
                    type="number"
                    min="1"
                    value={novaQuantidade}
                    onChange={(e) => setNovaQuantidade(parseInt((e.target as HTMLInputElement).value, 10) || 1)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>

                {erro && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="text-sm text-red-700">{erro}</p>
                  </div>
                )}

                {sucesso && (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                    <p className="text-sm text-green-700">{sucesso}</p>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-4">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    disabled={loading}
                    className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSubstituir}
                    disabled={loading || !novaReferencia}
                    className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading ? 'Processando...' : '✅ Substituir Artigo'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

