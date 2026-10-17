"use client";
import React, { useState, useMemo, useCallback } from "react";
import { Search, FileText, ChevronDown, ChevronRight, Activity, Calendar, Download, Loader2, CheckCircle2, Timer, XCircle, ListChecks } from "lucide-react";
import Link from "next/link";
import { formatValidityDisplay } from "@/lib/date-display";

type InspecaoData = {
  id: number;
  certificadoNumero: string;
  navioNome: string;
  jangadaSerial: string | null;
  jangadaId: number | null;
  dataInspecao: string;
  status: string;
  createdAt: string;
  artigos: {
    id: number;
    name: string;
    quantidade: number;
    validade: string | null;
    referencia: string | null;
  }[];
  jangada?: any;
};

type Props = {
  initialData: InspecaoData[];
  totalCount: number;
  pageSize: number;
};

export default function InspecoesClient({ initialData, totalCount, pageSize }: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "concluida" | "curso" | "condenada" | "sem_status">("all");
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [allData, setAllData] = useState<InspecaoData[]>(initialData);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialData.length < totalCount);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = currentPage + 1;
      const res = await fetch(`/api/inspecoes?page=${nextPage}&limit=${pageSize}`);
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      const items = Array.isArray(json) ? json : [];
      if (items.length > 0) {
        const normalized = items.map((insp: any) => ({
          ...insp,
          artigos: (insp.artigos || []).map((a: any) => ({
            ...a,
            validade: a.validade ? a.validade.slice(0, 10) : null,
          })),
        }));
        setAllData((prev) => [...prev, ...normalized]);
        setCurrentPage(nextPage);
        setHasMore(items.length === pageSize);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error("Error loading more inspections:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [currentPage, pageSize, loadingMore, hasMore]);

  const filteredData = useMemo(() => {
    let list = allData;
    if (statusFilter !== "all") {
      list = list.filter((insp) => {
        const s = (insp.status || "").toLowerCase();
        if (statusFilter === "concluida") return s === "concluída" || s === "concluida" || s === "aprovado";
        if (statusFilter === "curso") return s === "draft" || s === "rascunho" || s === "pendente" || s === "em curso";
        if (statusFilter === "condenada") return s === "condenada" || s === "reprovou";
        if (statusFilter === "sem_status") return !insp.status;
        return true;
      });
    }
    if (!searchTerm) return list;
    const lower = searchTerm.toLowerCase();
    return list.filter((insp) =>
      insp.certificadoNumero?.toLowerCase().includes(lower) ||
      insp.navioNome?.toLowerCase().includes(lower) ||
      insp.jangadaSerial?.toLowerCase().includes(lower)
    );
  }, [allData, searchTerm, statusFilter]);

  const statusInfo = (status: string | null | undefined) => {
    const s = (status || "").toLowerCase();
    if (s === "concluída" || s === "concluida" || s === "aprovado") {
      return { label: status || "Concluída", dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800", pulse: true };
    }
    if (s === "draft" || s === "rascunho" || s === "pendente" || s === "em curso") {
      return { label: status || "Em curso", dot: "bg-amber-500", badge: "bg-amber-100 text-amber-800", pulse: true };
    }
    if (s === "condenada" || s === "reprovou") {
      return { label: status || "Condenada", dot: "bg-red-500", badge: "bg-red-100 text-red-700", pulse: false };
    }
    return { label: status || "S/ estado", dot: "bg-slate-400", badge: "bg-slate-100 text-slate-600", pulse: false };
  };

  const counts = useMemo(() => {
    const c = { total: allData.length, concluida: 0, curso: 0, condenada: 0, sem_status: 0 };
    allData.forEach((insp) => {
      const s = (insp.status || "").toLowerCase();
      if (s === "concluída" || s === "concluida" || s === "aprovado") c.concluida++;
      else if (s === "draft" || s === "rascunho" || s === "pendente" || s === "em curso") c.curso++;
      else if (s === "condenada" || s === "reprovou") c.condenada++;
      else c.sem_status++;
    });
    return c;
  }, [allData]);

  const groupedData = useMemo(() => {
    const groups: Record<string, InspecaoData[]> = {};
    filteredData.forEach((insp) => {
      const dateParts = insp.dataInspecao.split("-");
      if (dateParts.length >= 2) {
        const year = dateParts[0];
        const monthNum = parseInt(dateParts[1], 10);
        const monthNames = [
          "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
          "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
        ];
        const monthName = monthNames[monthNum - 1] || monthNum;
        const groupKey = `${monthName} ${year}`;
        if (!groups[groupKey]) groups[groupKey] = [];
        groups[groupKey].push(insp);
      } else {
        const groupKey = "Desconhecido";
        if (!groups[groupKey]) groups[groupKey] = [];
        groups[groupKey].push(insp);
      }
    });
    return groups;
  }, [filteredData]);

  const toggleMonth = (monthKey: string) => {
    setExpandedMonths(prev => ({
      ...prev,
      [monthKey]: !prev[monthKey]
    }));
  };

  const toggleRow = (id: number) => {
    setExpandedRows(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleDownloadOrey = async (e: React.MouseEvent, insp: InspecaoData) => {
    e.stopPropagation();
    setDownloadingId(insp.id);
    try {
      window.open(`/jangadas/${insp.jangadaId || 'serial/' + insp.jangadaSerial}`, '_blank');
    } catch (e) {
      alert("Falha ao abrir a jangada.");
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Status Summary Strip */}
      <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3 shadow-sm">
        <button onClick={() => setStatusFilter("all")} className={`flex items-center gap-3 text-left rounded-xl p-2 transition-all ${statusFilter === "all" ? "bg-white ring-1 ring-sky-300 shadow-sm" : "hover:bg-white/60"}`}>
          <ListChecks className="w-8 h-8 text-sky-600 shrink-0" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Total Registos</p>
            <p className="text-xl font-black text-sky-700">{counts.total}</p>
          </div>
        </button>
        <button onClick={() => setStatusFilter("concluida")} className={`flex items-center gap-3 text-left rounded-xl p-2 transition-all ${statusFilter === "concluida" ? "bg-white ring-1 ring-emerald-300 shadow-sm" : "hover:bg-white/60"}`}>
          <CheckCircle2 className="w-8 h-8 text-emerald-600 shrink-0" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Concluídas</p>
            <p className="text-xl font-black text-emerald-700">{counts.concluida}</p>
          </div>
        </button>
        <button onClick={() => setStatusFilter("curso")} className={`flex items-center gap-3 text-left rounded-xl p-2 transition-all ${statusFilter === "curso" ? "bg-white ring-1 ring-amber-300 shadow-sm" : "hover:bg-white/60"}`}>
          <Timer className="w-8 h-8 text-amber-600 shrink-0" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Em Curso / Draft</p>
            <p className="text-xl font-black text-amber-700">{counts.curso}</p>
          </div>
        </button>
        <button onClick={() => setStatusFilter("condenada")} className={`flex items-center gap-3 text-left rounded-xl p-2 transition-all ${statusFilter === "condenada" ? "bg-white ring-1 ring-red-300 shadow-sm" : "hover:bg-white/60"}`}>
          <XCircle className="w-8 h-8 text-red-600 shrink-0" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Condenadas</p>
            <p className="text-xl font-black text-red-600">{counts.condenada}</p>
          </div>
        </button>
      </div>

      {/* Quick Filters */}
      <div className="flex flex-wrap gap-2">
        {([
          { key: "all" as const, label: "Todas" },
          { key: "concluida" as const, label: `Concluídas (${counts.concluida})` },
          { key: "curso" as const, label: `Em curso / Draft (${counts.curso})` },
          { key: "condenada" as const, label: `Condenadas (${counts.condenada})` },
          { key: "sem_status" as const, label: `S/ estado (${counts.sem_status})` },
        ]).map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
              statusFilter === f.key
                ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-3">
        <Search className="text-slate-400" />
        <input
          type="text"
          placeholder="Pesquisar por Certificado, Navio ou Série..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 bg-transparent border-none outline-none text-slate-700 placeholder-slate-400 font-medium"
        />
        <div className="text-sm text-slate-500 font-bold px-3 py-1 bg-slate-100 rounded-lg">
          {filteredData.length} de {totalCount} registos
        </div>
      </div>

      {/* Accordion List */}
      <div className="space-y-4">
        {Object.keys(groupedData).length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
            <FileText className="mx-auto text-slate-300 mb-3" size={48} />
            <p className="text-slate-500 font-medium">Nenhuma inspeção encontrada.</p>
          </div>
        ) : (
          Object.entries(groupedData).map(([monthKey, inspecoes]) => {
            const isExpanded = expandedMonths[monthKey] !== false;

            return (
              <div key={monthKey} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden transition-all">
                <button 
                  onClick={() => toggleMonth(monthKey)}
                  className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors border-b border-slate-200"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown className="text-slate-500" /> : <ChevronRight className="text-slate-500" />}
                    <h2 className="text-lg font-bold text-slate-800 capitalize">{monthKey}</h2>
                    <span className="bg-slate-200 text-slate-600 text-xs font-bold px-2 py-1 rounded-full">
                      {inspecoes.length}
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="divide-y divide-slate-100">
                    {inspecoes.map((insp) => {
                      const isRowExpanded = expandedRows[insp.id];

                      return (
                        <div key={insp.id} className="flex flex-col hover:bg-slate-50 transition-colors">
                          <div 
                            className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer"
                            onClick={() => toggleRow(insp.id)}
                          >
                            <div className="flex items-center gap-4">
                              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex items-center justify-center text-emerald-600">
                                <FileText size={24} />
                              </div>
                              <div>
                                <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                  {insp.certificadoNumero || "Sem Certificado"}
                                  {isRowExpanded ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                                </h3>
                                <div className="flex items-center gap-3 text-sm text-slate-500 mt-1">
                                  <span className="flex items-center gap-1 font-medium text-blue-700">
                                    {insp.navioNome}
                                  </span>
                                  <span>•</span>
                                  <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-xs text-slate-600">
                                    SN: {insp.jangadaSerial || "N/A"}
                                  </span>
                                  <span>•</span>
                                  <span className="flex items-center gap-1">
                                    <Calendar size={14} /> {formatValidityDisplay(insp.dataInspecao)}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              {(() => {
                                const st = statusInfo(insp.status);
                                return (
                                  <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold ${st.badge}`}>
                                    <span className="relative inline-flex">
                                      <span className={`w-2 h-2 rounded-full ${st.dot} ${st.pulse ? "animate-pulse" : ""}`} />
                                      {st.pulse && <span className={`absolute inline-flex h-full w-full rounded-full ${st.dot} opacity-60 animate-ping`} />}
                                    </span>
                                    {st.label}
                                  </span>
                                );
                              })()}
                              
                              <button
                                onClick={(e) => handleDownloadOrey(e, insp)}
                                disabled={downloadingId === insp.id}
                                className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-xl font-bold hover:bg-slate-50 hover:border-slate-300 transition-colors text-sm shadow-sm"
                              >
                                {downloadingId === insp.id ? <Loader2 className="animate-spin" size={16} /> : <Activity size={16} />}
                                Abrir Jangada
                              </button>
                            </div>
                          </div>

                          {isRowExpanded && (
                            <div className="border-t border-slate-100 bg-slate-50/50 p-6 pl-[5.5rem] animate-in slide-in-from-top-2 duration-200">
                              <div className="flex flex-col lg:flex-row gap-8">
                                <div className="flex-1">
                                  <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                                    <Activity size={16} className="text-indigo-500" />
                                    Artigos Substituídos no Pack ({insp.artigos?.length || 0})
                                  </h4>
                                  {insp.artigos?.length > 0 ? (
                                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                                      {insp.artigos.map((art) => (
                                        <div key={art.id} className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm flex flex-col gap-1">
                                          <span className="font-bold text-slate-700 text-sm">{art.name}</span>
                                          <div className="flex items-center justify-between text-xs text-slate-500">
                                            <span className="font-mono bg-slate-100 px-1 rounded">{art.referencia || "S/Ref"}</span>
                                            <span>Qtd: <strong>{art.quantidade}</strong></span>
                                          </div>
                                          {art.validade && (
                                            <div className="text-xs text-emerald-600 font-medium mt-1">
                                              Validade: {formatValidityDisplay(art.validade)}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-sm text-slate-500 italic bg-white p-3 border border-slate-200 rounded-lg">Nenhum artigo registado.</p>
                                  )}
                                </div>

                                {insp.jangada && (
                                  <div className="flex-1">
                                    <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                                      <Activity size={16} className="text-emerald-500" />
                                      Testes Realizados (Último Registo)
                                    </h4>
                                    <div className="grid grid-cols-2 gap-3">
                                      {['WP', 'GI', 'FS', 'NAP', 'DL'].map(testKey => {
                                        const testResult = (insp.jangada as any)[`teste${testKey}`];
                                        if (!testResult) return null;
                                        return (
                                          <div key={testKey} className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between shadow-sm">
                                            <span className="font-bold text-slate-700 text-sm">{testKey}</span>
                                            <span className={`text-xs font-bold px-2 py-1 rounded-md ${
                                              testResult === 'PASSOU' ? 'bg-emerald-100 text-emerald-700' :
                                              testResult === 'REPROVOU' ? 'bg-red-100 text-red-700' :
                                              'bg-slate-100 text-slate-600'
                                            }`}>
                                              {testResult}
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                    {!['WP', 'GI', 'FS', 'NAP', 'DL'].some(k => (insp.jangada as any)[`teste${k}`]) && (
                                      <p className="text-sm text-slate-500 italic bg-white p-3 border border-slate-200 rounded-lg">Nenhum teste registado.</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Load More */}
      {hasMore && !searchTerm && (
        <div className="flex justify-center pt-4">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50"
          >
            {loadingMore ? (
              <>
                <Loader2 className="animate-spin" size={16} />
                A carregar...
              </>
            ) : (
              <>
                Carregar mais inspeções
                <span className="text-xs text-slate-500 ml-1">({totalCount - allData.length} restantes)</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
