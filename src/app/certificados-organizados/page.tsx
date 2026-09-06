"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  FolderOpen,
  FileText,
  FileSpreadsheet,
  Search,
  Filter,
  Download,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Calendar,
  X,
  Zap,
  Archive,
  Eye,
  ExternalLink,
} from "lucide-react";
import { appToast } from "@/lib/app-toast";

type FileItem = {
  name: string;
  type: "certificado" | "quadro" | "externo" | "outro";
  serial: string | null;
  date: string | null;
  size: number;
  modified: string;
  year?: number;
  shipName?: string;
  folderType: "certificados" | "navio";
  path: string;
  url: string;
  hash?: string;
  blobPath?: string;
  jangada?: { serial: string; brand: string; model: string; capacity: number | string } | null;
};

type FilterState = {
  year: string;
  shipName: string;
  serial: string;
  type: string;
  startDate: string;
  endDate: string;
};

export default function CertificadosOrganizadosPage() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<FilterState>({
    year: "",
    shipName: "",
    serial: "",
    type: "",
    startDate: "",
    endDate: "",
  });
  const [pagination, setPagination] = useState({ total: 0, limit: 100, offset: 0, hasMore: false });
  const [years, setYears] = useState<number[]>([]);
  const [ships, setShips] = useState<string[]>([]);

  const fetchFiles = useCallback(async (resetOffset = true) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.year) params.set("year", filters.year);
      if (filters.shipName) params.set("shipName", filters.shipName);
      if (filters.serial) params.set("serial", filters.serial);
      if (filters.type) params.set("type", filters.type);
      if (filters.startDate) params.set("startDate", filters.startDate);
      if (filters.endDate) params.set("endDate", filters.endDate);
      params.set("limit", String(pagination.limit));
      params.set("offset", String(resetOffset ? 0 : pagination.offset));

      const res = await fetch(`/api/certificados-organizados/search?${params.toString()}`);
      const data = await res.json();
      if (data.files) {
        setFiles(resetOffset ? data.files : [...files, ...data.files]);
        setPagination(prev => ({ ...prev, ...data.pagination }));
      }
      // Extrair anos e navios únicos para filtros
      if (data.files) {
        const ys = [...new Set(data.files.map((f: FileItem) => f.year).filter(Boolean) as number[])].sort((a, b) => b - a);
        const ss = [...new Set(data.files.map((f: FileItem) => f.shipName).filter(Boolean) as string[])].sort();
        if (ys.length) setYears(ys);
        if (ss.length) setShips(ss);
      }
    } catch (e) {
      console.error(e);
      appToast.error("Erro ao carregar ficheiros");
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.limit, pagination.offset, files]);

  useEffect(() => {
    fetchFiles(true);
  }, [filters.year, filters.shipName, filters.serial, filters.type, filters.startDate, filters.endDate]);

  const toggleFolder = (key: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelect = (filePath: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedFiles.size === files.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(files.map(f => f.path)));
    }
  };

  const downloadSelected = async () => {
    if (selectedFiles.size === 0) return;
    // Para múltiplos, criar ZIP no cliente (usar JSZip se disponível) ou abrir múltiplos
    if (selectedFiles.size === 1) {
      const path = Array.from(selectedFiles)[0];
      window.open(`/${path}`, "_blank");
    } else {
      // Abrir cada um em nova tab (browser pode bloquear popups)
      for (const path of selectedFiles) {
        window.open(`/${path}`, "_blank");
      }
    }
  };

  const loadMore = () => {
    if (!pagination.hasMore || loading) return;
    setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }));
    fetchFiles(false);
  };

  const clearFilters = () => {
    setFilters({ year: "", shipName: "", serial: "", type: "", startDate: "", endDate: "" });
  };

  const hasActiveFilters = Object.values(filters).some(v => v !== "");

  // Agrupar por ano (certificados) e navio (navios)
  const grouped = files.reduce((acc, file) => {
    const key = file.folderType === "certificados" 
      ? `CERTIFICADOS AÇORES ${file.year || "—"}`
      : `NAVIOS / ${file.shipName || "—"}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(file);
    return acc;
  }, {} as Record<string, FileItem[]>);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch { return iso; }
  };

  const getTypeIcon = (type: FileItem["type"]) => {
    switch (type) {
      case "certificado": return <FileText className="text-emerald-500" size={16} />;
      case "quadro": return <FileSpreadsheet className="text-blue-500" size={16} />;
      case "externo": return <FileText className="text-amber-500" size={16} />;
      default: return <FileText className="text-slate-400" size={16} />;
    }
  };

  const getTypeLabel = (type: FileItem["type"]) => {
    switch (type) {
      case "certificado": return "Certificado";
      case "quadro": return "Quadro";
      case "externo": return "Externo";
      default: return "Outro";
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Certificados Organizados</h1>
              <p className="text-sm text-slate-500 mt-1">
                Estrutura: <code className="text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded text-xs">CERTIFICADOS AÇORES {new Date().getFullYear()}</code> / <code className="text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded text-xs">NAVIOS / Nome do Navio</code>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchFiles(true)}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors"
              >
                <RefreshCw className={loading ? "animate-spin" : ""} size={18} />
                Atualizar
              </button>
              <button
                onClick={downloadSelected}
                disabled={selectedFiles.size === 0}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-medium transition-colors"
              >
                <Download size={18} />
                {selectedFiles.size === 1 ? "Descarregar" : `Descarregar ${selectedFiles.size}`}
              </button>
              <button
                onClick={async () => {
                  const res = await fetch("/api/cron/certificados-maintenance?action=all", { method: "POST" });
                  const data = await res.json();
                  appToast.success(`Limpeza: ${data.results.cleanTmp?.deleted || 0} ficheiros tmp, ${data.results.deduplicate?.removed || 0} duplicados`);
                  fetchFiles(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-medium transition-colors"
              >
                <Zap size={18} />
                Manutenção
              </button>
            </div>
          </div>

          {/* Filtros */}
          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Filtrar por nº de série..."
                value={filters.serial}
                onChange={e => setFilters({ ...filters, serial: e.target.value })}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
              />
            </div>
            <div className="flex flex-wrap gap-2 sm:flex-1">
              <select
                value={filters.year}
                onChange={e => setFilters({ ...filters, year: e.target.value })}
                className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-200 bg-white"
              >
                <option value="">Todos os anos</option>
                {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
              </select>
              <select
                value={filters.shipName}
                onChange={e => setFilters({ ...filters, shipName: e.target.value })}
                className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-200 bg-white min-w-[180px]"
              >
                <option value="">Todos os navios</option>
                {ships.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select
                value={filters.type}
                onChange={e => setFilters({ ...filters, type: e.target.value })}
                className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-200 bg-white"
              >
                <option value="">Todos os tipos</option>
                <option value="certificado">Certificado</option>
                <option value="quadro">Quadro</option>
                <option value="externo">Externo</option>
              </select>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={e => setFilters({ ...filters, startDate: e.target.value })}
                  className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-200 bg-white"
                  title="Data início"
                />
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={e => setFilters({ ...filters, endDate: e.target.value })}
                  className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-200 bg-white"
                  title="Data fim"
                />
              </div>
            </div>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="px-4 py-2.5 text-slate-500 hover:text-slate-700 font-medium flex items-center gap-1"
              >
                <X size={18} />
                Limpar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Lista de ficheiros */}
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-slate-500">
            {pagination.total} ficheiro(s) • {selectedFiles.size} selecionado(s)
          </p>
        </div>

        {Object.keys(grouped).length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <FolderOpen className="mx-auto text-slate-300 mb-4" size={48} />
            <h3 className="text-lg font-medium text-slate-700">Nenhum ficheiro encontrado</h3>
            <p className="mt-1">Ajuste os filtros ou aguarde a geração de certificados/quadros.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([folderKey, folderFiles]) => {
              const folderId = folderKey.replace(/[^a-zA-Z0-9]/g, "_");
              const isExpanded = expandedFolders.has(folderId);
              return (
                <div key={folderKey} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  <button
                    onClick={() => toggleFolder(folderId)}
                    className="w-full px-6 py-4 flex items-center gap-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                  >
                    <ChevronRight className={`text-slate-500 transition-transform ${isExpanded ? "rotate-90" : ""}`} size={20} />
                    <FolderOpen className="text-indigo-500" size={22} />
                    <span className="font-semibold text-slate-800">{folderKey}</span>
                    <span className="ml-auto px-3 py-1 bg-slate-100 text-slate-600 text-xs font-semibold rounded-full">
                      {folderFiles.length}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="divide-y divide-slate-100">
                      {folderFiles.map((file, idx) => {
                        const isSelected = selectedFiles.has(file.path);
                        return (
                          <label
                            key={file.path}
                            className={`flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors cursor-pointer ${isSelected ? "bg-indigo-50 border-l-4 border-indigo-500" : ""}`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(file.path)}
                              className="w-5 h-5 text-indigo-500 border-slate-300 rounded focus:ring-indigo-500"
                            />
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="p-2 bg-slate-100 rounded-xl">{getTypeIcon(file.type)}</div>
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-slate-800 truncate">{file.name}</p>
                                <div className="flex flex-wrap gap-4 mt-1 text-xs text-slate-500">
                                  <span className="flex items-center gap-1">
                                    <span className="font-semibold text-slate-600">{getTypeLabel(file.type)}</span>
                                  </span>
                                  {file.serial && (
                                    <span className="flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                                      S/N: {file.serial}
                                    </span>
                                  )}
                                  {file.jangada && (
                                    <span className="flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                                      {file.jangada.brand} {file.jangada.model} ({file.jangada.capacity}P)
                                    </span>
                                  )}
                                  <span>{formatSize(file.size)}</span>
                                  <span>{formatDate(file.modified)}</span>
                                  {file.date && <span>📅 {formatDate(file.date + "T00:00:00")}</span>}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <a
                                  href={file.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-2 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-xl transition-colors"
                                  title="Abrir em nova aba"
                                >
                                  <ExternalLink size={18} />
                                </a>
                                <button
                                  onClick={e => { e.stopPropagation(); window.open(`/${file.path}`, "_blank"); }}
                                  className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-xl transition-colors"
                                  title="Descarregar"
                                >
                                  <Download size={18} />
                                </button>
                                <button
                                  onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(`/${file.path}`); appToast.success("Caminho copiado"); }}
                                  className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-colors"
                                  title="Copiar caminho"
                                >
                                  <Eye size={18} />
                                </button>
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {pagination.hasMore && (
          <div className="mt-6 text-center">
            <button
              onClick={loadMore}
              disabled={loading}
              className="px-8 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors disabled:opacity-50"
            >
              {loading ? "A carregar..." : `Carregar mais ${pagination.limit}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}