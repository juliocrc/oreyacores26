"use client"

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Box, Plus, Edit, Trash2, Save } from 'lucide-react'

interface StockItem {
  id: number
  referencia?: string
  descricao: string
  nome?: string
  categoria?: string
  associavelJangada: boolean
  aplicavelMarcaJangada?: string
  aplicavelModeloJangada?: string
  precoCompra?: number
  codigoFabricante?: string
  inventario?: string
  lote?: string
  validade?: string
  testeHidraulico?: string
  estadoCargaCilindro?: string
  precoVenda: number
  quantidade: number
  quantidadeMinima?: number
  localizacao?: string
  codigoBarras?: string
  estadoArtigo: string
  referenciaSubstituta?: string
}

export default function StockManagementDemo() {
  const queryClient = useQueryClient()

  const { data: stockItems, isLoading, error } = useQuery<StockItem[]>({
    queryKey: ['stockItems'],
    queryFn: async () => {
      const response = await fetch('/api/stock')
      if (!response.ok) throw new Error('Failed to fetch stock items')
      return response.json()
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  })

  const createStockMutation = useMutation({
    mutationFn: async (data: Partial<StockItem>) => {
      const response = await fetch('/api/actions/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) throw new Error('Failed to create stock item')
      return response.json()
    },
    onSuccess: (newStock) => {
      queryClient.setQueryData(['stockItems'], (old: StockItem[] | undefined) => [...(old || []), newStock])
    },
    onError: (error) => {
      console.error('Error creating stock item:', error)
    },
  })

  const updateStockMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<StockItem> }) => {
      const response = await fetch('/api/actions/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...data, operacao: 'atualizar' }),
      })
      if (!response.ok) throw new Error('Failed to update stock item')
      return response.json()
    },
    onSuccess: (updatedStock) => {
      queryClient.setQueryData(['stockItems'], (old: StockItem[] | undefined) =>
        old?.map(item => item.id === updatedStock.id ? updatedStock : item) || []
      )
    },
  })

  const deleteStockMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/actions/stock?id=${id}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error('Failed to delete stock item')
      return response.json()
    },
    onSuccess: (_, variables) => {
      queryClient.setQueryData(['stockItems'], (old: StockItem[] | undefined) =>
        old?.filter(item => item.id !== variables) || []
      )
    },
  })

  const [formData, setFormData] = useState({
    descricao: '',
    quantidade: 0,
    precoVenda: 0,
    associavelJangada: false,
    estadoArtigo: 'ATIVO',
    categoria: undefined as string | undefined,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createStockMutation.mutateAsync(formData)
      setFormData({
        descricao: '',
        quantidade: 0,
        precoVenda: 0,
        associavelJangada: false,
        estadoArtigo: 'ATIVO',
        categoria: undefined,
      })
    } catch (error) {
      console.error('Form submission error:', error)
    }
  }

  const handleUpdateStock = async (id: number, quantidadeExtra: number) => {
    try {
      await updateStockMutation.mutateAsync({
        id,
        data: { quantidade: (stockItems?.find(item => item.id === id)?.quantidade || 0) + quantidadeExtra }
      })
    } catch (error) {
      console.error('Update error:', error)
    }
  }

  const handleDeleteStock = async (id: number) => {
    if (confirm('Tem certeza que deseja eliminar este item do stock?')) {
      try {
        await deleteStockMutation.mutateAsync(id)
      } catch (error) {
        console.error('Delete error:', error)
      }
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 m-4">
        <h3 className="text-red-800 font-semibold">Erro ao carregar dados</h3>
        <p className="text-red-600">{error.message}</p>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Plus className="text-indigo-600" />
          Adicionar Novo Item de Stock
        </h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Descrição *</label>
            <input
              type="text"
              value={formData.descricao}
              onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Ex: Cilindro CO2 12kg"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Quantidade</label>
            <input
              type="number"
              value={formData.quantidade}
              onChange={(e) => setFormData({ ...formData, quantidade: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Preço de Venda</label>
            <input
              type="number"
              step="0.01"
              value={formData.precoVenda}
              onChange={(e) => setFormData({ ...formData, precoVenda: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Categoria</label>
            <select
              value={formData.categoria || ''}
              onChange={(e) => setFormData({ ...formData, categoria: e.target.value || undefined })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">Selecione...</option>
              <option value="CILINDROS">Cilindros</option>
              <option value="EQUIPAMENTOS">Equipamentos</option>
              <option value="CONSUMIVEIS">Consumíveis</option>
            </select>
          </div>

          <div className="lg:col-span-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.associavelJangada}
                onChange={(e) => setFormData({ ...formData, associavelJangada: e.target.checked })}
                className="w-4 h-4 text-indigo-600 rounded"
              />
              <span className="text-sm font-medium text-slate-700">Associável a Jangada</span>
            </label>
          </div>

          <div className="lg:col-span-4">
            <button
              type="submit"
              disabled={createStockMutation.isPending}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors disabled:bg-indigo-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Save size={18} />
              {createStockMutation.isPending ? 'Salvando...' : 'Salvar Item'}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
          <h3 className="text-lg font-semibold text-slate-800">Inventário de Stock</h3>
          <p className="text-sm text-slate-600 mt-1">
            {stockItems?.length || 0} items total • {stockItems?.filter(item => item.quantidade <= 5)?.length || 0} items com baixo estoque
          </p>
        </div>

        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="sticky top-0 z-30 bg-slate-50 left-0 border-r border-slate-200 px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Referência</th>
                <th className="sticky top-0 z-20 bg-slate-50 px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Descrição</th>
                <th className="sticky top-0 z-20 bg-slate-50 px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Categoria</th>
                <th className="sticky top-0 z-20 bg-slate-50 px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Quantidade</th>
                <th className="sticky top-0 z-20 bg-slate-50 px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Preço Unitário</th>
                <th className="sticky top-0 z-30 bg-slate-50 right-0 border-l border-slate-200 px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {stockItems?.map((item: StockItem) => (
                <tr key={item.id} className="bg-white hover:bg-slate-50 transition-colors">
                  <td className="sticky left-0 z-10 bg-inherit border-r border-slate-200 px-6 py-4 text-sm font-mono text-slate-600">{item.referencia || '-'}</td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-800">{item.descricao}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full
                      ${item.categoria === 'CILINDROS' ? 'bg-blue-100 text-blue-800' :
                         item.categoria === 'EQUIPAMENTOS' ? 'bg-green-100 text-green-800' :
                         item.categoria === 'CONSUMIVEIS' ? 'bg-amber-100 text-amber-800' :
                         'bg-slate-100 text-slate-800'}`}
                    >
                      {item.categoria}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-semibold
                    ${item.quantidade <= 5 ? 'text-red-600' : item.quantidade <= 20 ? 'text-amber-600' : 'text-slate-800'}">
                    {item.quantidade}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">€{item.precoVenda?.toFixed(2) || '0.00'}</td>
                  <td className="sticky right-0 z-10 bg-inherit border-l border-slate-200 px-6 py-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleUpdateStock(item.id, 10)}
                        className="p-1 text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                        title="Adicionar 10 unidades"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteStock(item.id)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Eliminar item"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {stockItems?.length === 0 && (
          <div className="text-center py-12">
            <Box className="mx-auto h-12 w-12 text-slate-400 mb-4" />
            <h3 className="text-lg font-medium text-slate-600 mb-2">Nenhum item de stock</h3>
            <p className="text-slate-500">Adicione o seu primeiro item de stock acima</p>
          </div>
        )}
      </div>
    </div>
  )
}
