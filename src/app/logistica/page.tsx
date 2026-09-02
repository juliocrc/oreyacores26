"use client";

import { useEffect, useState, useMemo } from "react";
import { Ship, Truck, Download, Upload, RefreshCw, Search, Filter, Calendar, AlertTriangle, CheckCircle, Clock, Loader2, X, ChevronDown, ChevronUp, Eye, Package, MapPin, Building2, Wrench, ShieldCheck, AlertCircle, Plus, Minus } from "lucide-react";
import { formatDate } from "@/lib/date-utils";
import type { JangadaLogistica, FilterState } from "@/types/logistica-page";

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; class: string; bg: string; dot: string }> = {
  recebida: { label: "Recebida", icon: <Download className="h-3 w-3" />, class: "text-blue-700", bg: "bg-blue-50", dot: "bg-blue-500" },
  em_inspecao: { label: "Em Inspeção", icon: <Wrench className="h-3 w-3" />, class: "text-amber-700", bg: "bg-amber-50", dot: "bg-amber-500" },
  em_inspecção: { label: "Em Inspeção", icon: <Wrench className="h-3 w-3" />, class: "text-amber-700", bg: "bg-amber-50", dot: "bg-amber-500" },
  concluida: { label: "Concluída", icon: <CheckCircle className="h-3 w-3" />, class: "text-emerald-700", bg: "bg-emerald-50", dot: "bg-emerald-500" },
  concluída: { label: "Concluída", icon: <CheckCircle className="h-3 w-3" />, class: "text-emerald-700", bg: "bg-emerald-50", dot: "bg-emerald-500" },
  expedida: { label: "Expedida", icon: <Upload className="h-3 w-3" />, class: "text-indigo-700", bg: "bg-indigo-50", dot: "bg-indigo-500" },
  agendada: { label: "Agendada", icon: <Calendar className="h-3 w-3" />, class: "text-violet-700", bg: "bg-violet-50", dot: "bg-violet-500" },
  aguardando: { label: "Aguardando", icon: <Clock className="h-3 w-3" />, class: "text-slate-600", bg: "bg-slate-100", dot: "bg-slate-400" },
};

const STATUS_ORDER = ["aguardando", "recebida", "em_inspecao", "em_inspecção", "concluida", "concluída", "expedida", "agendada"];

function StatusBadge({ status }: { status: string | null }) {
  const s = (status || "").toLowerCase();
  const config = STATUS_CONFIG[s] || { label: status || "—", icon: <Package className="h-3 w-3" />, class: "text-slate-600", bg: "bg-slate-100", dot: "bg-slate-400" };
  const order = STATUS_ORDER.indexOf(s);
  
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${config.bg} ${config.class}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      <span className="flex items-center gap-1">{config.icon} {config.label}</span>
      {order >= 0 && <span className="ml-1 px-1.5 py-0.5 bg-white/50 rounded text-[9px] font-mono">{order + 1}</span>}
    </span>
  );
}

function InspectionDate({ dateStr }: { dateStr: string | null }) {
  if (!dateStr) return <span className="text-slate-400 text-sm">—</span>;
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(dateStr); target.setHours(0,0,0,0);
  const diff = Math.ceil((target.getTime() - today.getTime()) / 86400000);
  const formatted = formatDate(dateStr);
  
  if (diff < 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-50 text-red-700 text-xs font-medium">
        <AlertCircle className="h-3 w-3" /> {formatted} <span className="px-1.5 py-0.5 bg-red-100 rounded text-[9px] font-bold">Expirado {Math.abs(diff)}d</span>
      </span>
    );
  }
  if (diff <= 30) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-700 text-xs font-medium">
        <AlertTriangle className="h-3 w-3" /> {formatted} <span className="px-1.5 py-0.5 bg-amber-100 rounded text-[9px] font-bold">{diff}d</span>
      </span>
    );
  }
  return <span className="text-slate-700 text-sm font-medium">{formatted}</span>;
}

function ActionButton({ children, onClick, variant = "primary", icon, disabled, className = "" }: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const variants = {
    primary: "bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/25",
    secondary: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/25",
    ghost: "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm",
    danger: "bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/25",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 ${variants[variant]} ${disabled ? "opacity-50 cursor-not-allowed" : ""} ${className}`}
    >
      {icon && <span>{icon}</span>}
      {children}
    </button>
  );
}

function Modal({ isOpen, onClose, title, icon, children, footer }: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
        <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-xl text-indigo-600">{icon}</div>
            <h3 className="text-lg font-bold text-slate-800">{title}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-5">{children}</div>
        <div className="border-t border-slate-100 px-6 py-4 flex justify-end gap-3">{footer}</div>
      </div>
    </div>
  );
}

export default function LogisticaPage() {
  const [jangadas, setJangadas] = useState<JangadaLogistica[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    search: "",
    status: "todos",
    island: "todas",
    station: "todas",
    dateFrom: "",
    dateTo: "",
  });
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [actionMode, setActionMode] = useState<"receber" | "expedir" | null>(null);
  const [actionData, setActionData] = useState({
    stationId: "",
    tecnico: "",
    observacoes: "",
    dataPrevistaEntrega: "",
  });
  const [stations, setStations] = useState<Array<{id: number; codigo: string; nome: string}>>([]);
  const [tecnicos, setTecnicos] = useState<Array<{nome: string}>>([]);
  const [islands, setIslands] = useState<string[]>([]);
  const [filterExpanded, setFilterExpanded] = useState(true);
  const [printData, setPrintData] = useState<{jangadas: JangadaLogistica[], tipo: "rececao" | "expedicao", data: string, responsavel: string, observacoes: string} | null>(null);

  const getFilteredJangadas = () => {
    return jangadas.filter(j => {
      if (filters.search) {
        const s = filters.search.toLowerCase();
        if (!j.serial.toLowerCase().includes(s) &&
            !j.brand.toLowerCase().includes(s) &&
            !j.model.toLowerCase().includes(s) &&
            !j.shipName?.toLowerCase().includes(s) &&
            !j.owner.toLowerCase().includes(s) &&
            !j.numeroObra?.toLowerCase().includes(s)) {
          return false;
        }
      }
      if (filters.status !== "todos" && j.queueStatus !== filters.status) return false;
      if (filters.island !== "todas" && j.island !== filters.island) return false;
      if (filters.station !== "todas" && j.serviceStationId?.toString() !== filters.station) return false;
      if (filters.dateFrom && j.queueDataChegada && j.queueDataChegada < filters.dateFrom) return false;
      if (filters.dateTo && j.queueDataChegada && j.queueDataChegada > filters.dateTo) return false;
      return true;
    });
  };

  const filteredJangadas = getFilteredJangadas();

  const stats = useMemo(() => ({
    total: filteredJangadas.length,
    receber: filteredJangadas.filter(j => j.queueStatus === "aguardando" || !j.inQueue).length,
    emProcesso: filteredJangadas.filter(j => j.queueStatus === "recebida" || j.queueStatus === "em_inspecao" || j.queueStatus === "em_inspecção").length,
    expedir: filteredJangadas.filter(j => j.queueStatus === "concluida" || j.queueStatus === "concluída").length,
    expedidas: filteredJangadas.filter(j => j.queueStatus === "expedida").length,
  }), [filteredJangadas]);

  useEffect(() => {
    fetchStations();
    fetchTecnicos();
  }, []);

  useEffect(() => {
    loadJangadas();
  }, [filters]);

  async function fetchStations() {
    try {
      const res = await fetch("/api/service-stations");
      if (res.ok) {
        const data = await res.json();
        setStations(Array.isArray(data) ? data : (data.stations || []));
      }
    } catch (e) { console.error(e); }
  }

  async function fetchTecnicos() {
    try {
      const res = await fetch("/api/tecnicos?includeInactive=false");
      if (res.ok) {
        const data = await res.json();
        const all: Array<{nome: string}> = [];
        if (Array.isArray(data.stations)) {
          data.stations.forEach((s: any) => s.tecnicos?.forEach((t: any) => all.push({nome: t.nome})));
        }
        if (Array.isArray(data.unassigned)) {
          data.unassigned.forEach((t: any) => all.push({nome: t.nome}));
        }
        const unique = all.filter((t, i, arr) => arr.findIndex(x => x.nome === t.nome) === i);
        setTecnicos(unique);
      }
    } catch (e) { console.error(e); }
  }

  async function loadJangadas() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.search) params.set("search", filters.search);
      if (filters.status !== "todos") params.set("status", filters.status);
      if (filters.island !== "todas") params.set("island", filters.island);
      if (filters.station !== "todas") params.set("station", filters.station);
      if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
      if (filters.dateTo) params.set("dateTo", filters.dateTo);
      params.set("includeQueue", "true");

      const res = await fetch(`/api/jangadas?${params.toString()}`);
      if (!res.ok) throw new Error("Erro ao carregar jangadas");
      const data = await res.json();
      
      const islandList: string[] = data.map((j: Record<string, unknown>) => String(j.ilha ?? "")).filter(Boolean);
      const uniqueIslands = [...new Set(islandList)].sort();
      setIslands(uniqueIslands);
      setJangadas(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const handleSelectAll = () => {
    const filtered = getFilteredJangadas();
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(j => j.id)));
    }
  };

  const openActionModal = (mode: "receber" | "expedir") => {
    const sel = filteredJangadas.filter(j => selectedIds.has(j.id));
    if (sel.length === 0) return alert("Selecione pelo menos uma jangada");
    setActionMode(mode);
    setActionData({
      stationId: mode === "receber" ? (sel[0].serviceStationId?.toString() || "") : "",
      tecnico: "",
      observacoes: "",
      dataPrevistaEntrega: "",
    });
  };

  const closeActionModal = () => {
    setActionMode(null);
    setActionData({ stationId: "", tecnico: "", observacoes: "", dataPrevistaEntrega: "" });
  };

  const handleActionSubmit = async () => {
    if (!actionMode) return;
    const sel = filteredJangadas.filter(j => selectedIds.has(j.id));
    if (sel.length === 0) return;

    try {
      for (const jangada of sel) {
        if (actionMode === "receber") {
          await fetch("/api/service-station", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              raftId: jangada.id,
              status: "recebida",
              tecnico: actionData.tecnico,
              observacao: actionData.observacoes,
              dataChegada: new Date().toISOString(),
              dataPrevistaEntrega: actionData.dataPrevistaEntrega || undefined,
            }),
          });
        } else {
          await fetch("/api/service-station", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              raftId: jangada.id,
              status: "expedida",
              tecnico: actionData.tecnico,
              observacao: actionData.observacoes,
              dataEntrega: new Date().toISOString(),
            }),
          });
        }
      }
      closeActionModal();
      setSelectedIds(new Set());
      loadJangadas();
    } catch (e) {
      alert("Erro ao processar: " + (e as Error).message);
    }
  };

  const handlePrintGuide = () => {
    const sel = filteredJangadas.filter(j => selectedIds.has(j.id));
    if (sel.length === 0) return alert("Selecione jangadas para gerar o documento");
    
    setPrintData({
      jangadas: sel,
      tipo: actionMode === "receber" ? "rececao" : "expedicao",
      data: new Date().toLocaleDateString("pt-PT"),
      responsavel: actionData.tecnico || "Operador",
      observacoes: actionData.observacoes,
    });
  };

  if (printData) {
    const { jangadas, tipo, data, responsavel, observacoes } = printData;
    const itemRows = jangadas.map((j, i) => `
      <tr style="border-bottom: 1px solid #000;">
        <td style="padding: 6px 8px; border: 1px solid #000; font-weight: bold;">${j.brand || ""} ${j.model || "Jangada"}</td>
        <td style="padding: 6px 8px; text-align: center; border: 1px solid #000;">1</td>
        <td style="padding: 6px 8px; text-align: center; border: 1px solid #000; font-family: monospace;">${j.serial || "—"}</td>
      </tr>
    `).join("");

    const clientName = jangadas[0]?.owner || "Cliente / Armador";
    const shipName = jangadas[0]?.shipName || "Embarcação";
    const island = jangadas[0]?.portoRegisto || jangadas[0]?.island || "";
    const oreyDestino = "Orey Técnica Serviços Navais, Lda, NIF 501117334 (Zona Industrial dos Portões Vermelhos, Armazém 19, 9560-350 Cabouco)";

    const origem = shipName;
    const destino = oreyDestino;

    const html = `
      <html>
        <head>
          <title>Documento Comprovativo do Transporte de Bens do Ativo Imobilizado</title>
          <style>
            @page { size: A4; margin: 25mm 20mm 25mm 20mm; }
            body { font-family: "Times New Roman", Times, serif; margin: 0; padding: 20px 30px; color: #000; font-size: 13px; line-height: 1.5; }
            .title-block { text-align: center; margin-bottom: 24px; }
            .title-block h1 { font-size: 15px; font-weight: bold; text-transform: uppercase; margin: 0 0 4px 0; letter-spacing: 0.5px; }
            .title-block h2 { font-size: 15px; font-weight: bold; text-transform: uppercase; margin: 0 0 8px 0; letter-spacing: 0.5px; }
            .title-block .legal-ref { font-size: 11px; color: #333; margin-top: 8px; }
            .declaration { text-align: justify; margin: 20px 0; line-height: 2; }
            .declaration .blank-line { display: inline-block; min-width: 200px; border-bottom: 1px solid #000; margin: 0 2px; font-weight: bold; }
            .declaration .blank-short { display: inline-block; min-width: 120px; border-bottom: 1px solid #000; margin: 0 2px; font-weight: bold; }
            .items-table { width: 100%; border-collapse: collapse; margin: 24px 0; }
            .items-table th, .items-table td { border: 1px solid #000; padding: 8px 10px; font-size: 12px; }
            .items-table th { font-weight: bold; text-align: center; background: none; }
            .destination { text-align: justify; margin: 20px 0; line-height: 2; }
            .destination .blank-line { display: inline-block; min-width: 250px; border-bottom: 1px solid #000; margin: 0 2px; font-weight: bold; }
            .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; margin-top: 60px; padding-top: 0; }
            .sig-block { text-align: center; }
            .sig-line { border-top: 1px solid #000; padding-top: 6px; margin-top: 50px; font-size: 12px; }
            .footnote { font-size: 10px; color: #555; margin-top: 30px; text-align: justify; line-height: 1.4; }
          </style>
        </head>
        <body onload="window.print(); setTimeout(() => window.close(), 500);">
          <div class="title-block">
            <h1>DOCUMENTO COMPROVATIVO DO TRANSPORTE DE BENS</h1>
            <h2>PERTENCENTES AO ATIVO IMOBILIZADO</h2>
            <div class="legal-ref">(n.º 1, alínea c) e n.ºs 3 e 4 do artigo 3.º do Decreto-Lei n.º 147/2003, de 11 de julho)</div>
          </div>

          <div class="declaration">
            <span class="blank-line">${clientName}</span> (nome
            ou designação), contribuinte n.º <span class="blank-short">Consulte Ficha</span>, declaro que os bens
            transportados, que constam do meu ativo imobilizado<sup>2</sup>, provenientes de
            <span class="blank-line">${shipName}</span>
            <span class="blank-line" style="min-width: 100px;">${island}</span> (local) a seguir discriminados:
          </div>

          <table class="items-table">
            <thead>
              <tr>
                <th style="width: 60%;">Designação / natureza dos bens</th>
                <th style="width: 20%;">Quantidades</th>
                <th style="width: 20%;">Nº Série</th>
              </tr>
            </thead>
            <tbody>
              ${itemRows}
              ${Array(Math.max(0, 6 - jangadas.length)).fill(`
                <tr>
                  <td style="border: 1px solid #000; padding: 8px 10px;">&nbsp;</td>
                  <td style="border: 1px solid #000; padding: 8px 10px;">&nbsp;</td>
                  <td style="border: 1px solid #000; padding: 8px 10px;">&nbsp;</td>
                </tr>
              `).join("")}
            </tbody>
          </table>

          <div class="destination">
            Destinam-se a <span class="blank-line">${destino}</span> (local de destino)
          </div>

          <div style="text-align: justify; margin: 16px 0; line-height: 2;">
            O transporte é efetuado por <span class="blank-line">${responsavel}</span> (transportador / motorista).
          </div>

          <div style="text-align: justify; margin: 16px 0; line-height: 2;">
            Data: <span class="blank-short">${data}</span>
            ${observacoes ? `<br/>Observações: <span class="blank-line">${observacoes}</span>` : ""}
          </div>

          <div class="signatures">
            <div class="sig-block">
              <div class="sig-line">Assinatura e carimbo do declarante<br/><small>(ENTE REPETENTE OU SUA REPR.)</small></div>
            </div>
            <div class="sig-block">
              <div class="sig-line">Assinatura do transportador<br/><small>(ENTE REPETENTE OU SUA REPR.)</small></div>
            </div>
          </div>

          <div class="footnote">
            <sup>1</sup> Alínea c) do n.º 1 e n.ºs 3 e 4 do artigo 3.º do Decreto-Lei n.º 147/2003, de 11 de julho.<br/>
            <sup>2</sup> O conceito de ativo imobilizado abrange os bens destinados a ser utilizados na atividade da empresa de forma duradoura, não se destinando à venda.
          </div>
        </body>
      </html>
    `;

    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
    }
    setPrintData(null);
    return null;
  };

  const handleDownloadWord = () => {
    const sel = filteredJangadas.filter(j => selectedIds.has(j.id));
    if (sel.length === 0) return alert("Selecione jangadas para gerar o documento");

    const itemRows = sel.map((j, i) => `
      <tr>
        <td style="padding: 6px 8px; text-align: center; border: 1px solid #000;">${i + 1}</td>
        <td style="padding: 6px 8px; border: 1px solid #000; font-weight: bold;">${j.brand || ""} ${j.model || ""} (S/N: ${j.serial || "—"})</td>
        <td style="padding: 6px 8px; border: 1px solid #000; text-align: center;">1</td>
      </tr>
    `).join("");

    const stationName = sel[0]?.serviceStationName || "—";
    const origem = sel[0]?.owner || "Armador";
    const destino = stationName;
    const data = new Date().toLocaleDateString("pt-PT");
    const responsavel = "Operador";

    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <meta charset="UTF-8">
          <title>Documento Comprovativo do Transporte de Bens</title>
          <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
          <style>
            @page { size: A4; margin: 25mm 20mm 25mm 20mm; }
            body { font-family: "Times New Roman", Times, serif; margin: 0; padding: 20px 30px; color: #000; font-size: 13px; line-height: 1.5; }
            .title-block { text-align: center; margin-bottom: 24px; }
            .title-block h1 { font-size: 15px; font-weight: bold; text-transform: uppercase; margin: 0 0 4px 0; letter-spacing: 0.5px; }
            .title-block h2 { font-size: 15px; font-weight: bold; text-transform: uppercase; margin: 0 0 8px 0; letter-spacing: 0.5px; }
            .title-block .legal-ref { font-size: 11px; color: #333; margin-top: 8px; }
            .declaration { text-align: justify; margin: 20px 0; line-height: 2; }
            .declaration .blank-line { display: inline-block; min-width: 200px; border-bottom: 1px solid #000; margin: 0 2px; }
            .declaration .blank-short { display: inline-block; min-width: 120px; border-bottom: 1px solid #000; margin: 0 2px; }
            .items-table { width: 100%; border-collapse: collapse; margin: 24px 0; }
            .items-table th, .items-table td { border: 1px solid #000; padding: 8px 10px; font-size: 12px; }
            .items-table th { font-weight: bold; text-align: center; background: none; }
            .destination { text-align: justify; margin: 20px 0; line-height: 2; }
            .destination .blank-line { display: inline-block; min-width: 250px; border-bottom: 1px solid #000; margin: 0 2px; }
            .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; margin-top: 60px; }
            .sig-block { text-align: center; }
            .sig-line { border-top: 1px solid #000; padding-top: 6px; margin-top: 50px; font-size: 12px; }
            .date-line { text-align: right; margin-top: 30px; font-size: 12px; }
            .footnote { font-size: 10px; color: #555; margin-top: 30px; text-align: justify; line-height: 1.4; }
          </style>
        </head>
        <body>
          <div class="title-block">
            <h1>DOCUMENTO COMPROVATIVO DO TRANSPORTE DE BENS</h1>
            <h2>PERTENCENTES AO ATIVO IMOBILIZADO</h2>
            <div class="legal-ref">(n.º 1, alínea c) e n.ºs 3 e 4 do artigo 3.º do Decreto-Lei n.º 147/2003, de 11 de julho)</div>
          </div>

          <div class="declaration">
            <span class="blank-line">OREY TECNICA ACORES, LDA.</span> (nome
            ou designação), contribuinte n.º <span class="blank-short">501117334</span>, declaro que os bens
            transportados, que constam do meu ativo imobilizado<sup>2</sup>, provenientes de
            <span class="blank-line">${origem}</span>
            <span class="blank-line" style="min-width: 100px;">${sel[0]?.portoRegisto || sel[0]?.island || ""}</span> (local) a seguir discriminados:
          </div>

          <table class="items-table">
            <thead>
              <tr>
                <th style="width: 60%;">Designação / natureza dos bens</th>
                <th style="width: 20%;">Quantidades</th>
                <th style="width: 20%;">Nº Série</th>
              </tr>
            </thead>
            <tbody>
              ${itemRows}
              ${Array(Math.max(0, 6 - sel.length)).fill(`
                <tr>
                  <td style="border: 1px solid #000; padding: 8px 10px;">&nbsp;</td>
                  <td style="border: 1px solid #000; padding: 8px 10px;">&nbsp;</td>
                  <td style="border: 1px solid #000; padding: 8px 10px;">&nbsp;</td>
                </tr>
              `).join("")}
            </tbody>
          </table>

          <div class="destination">
            Destinam-se a <span class="blank-line">${destino}</span> (local de destino)
          </div>

          <div style="text-align: justify; margin: 16px 0; line-height: 2;">
            O transporte é efetuado por <span class="blank-line">${responsavel}</span> (transportador / motorista).
          </div>

          <div style="text-align: justify; margin: 16px 0; line-height: 2;">
            Data: <span class="blank-short">${data}</span>
          </div>

          <div class="signatures">
            <div class="sig-block">
              <div class="sig-line">Assinatura e carimbo do declarante<br/><small>(ENTE REPETENTE OU SUA REPR.)</small></div>
            </div>
            <div class="sig-block">
              <div class="sig-line">Assinatura do transportador<br/><small>(ENTE REPETENTE OU SUA REPR.)</small></div>
            </div>
          </div>

          <div class="footnote">
            <sup>1</sup> Alínea c) do n.º 1 e n.ºs 3 e 4 do artigo 3.º do Decreto-Lei n.º 147/2003, de 11 de julho.<br/>
            <sup>2</sup> O conceito de ativo imobilizado abrange os bens destinados a ser utilizados na atividade da empresa de forma duradoura, não se destinando à venda.
          </div>
        </body>
      </html>
    `;

    const blob = new Blob([html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Transporte_Bens_${data.replace(/\//g, '-')}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="max-w-[1500px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-700 to-indigo-800 p-6 sm:p-8 shadow-xl shadow-indigo-500/25">
          <div className="absolute inset-0 opacity-50" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />
          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-white/90 text-sm font-medium mb-4">
                <Truck className="h-4 w-4" />
                <span>LOGÍSTICA INTERNA</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white">Gestão de Jangadas</h1>
              <p className="text-indigo-100 mt-1 max-w-xl">Receção, acompanhamento e expedição de jangadas na estação de serviço</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={loadJangadas}
                disabled={loading}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
                aria-label="Atualizar dados"
              >
                <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="relative flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-100 text-red-800 animate-in slide-in-from-top-2">
            <div className="p-2 bg-red-100 rounded-lg"><AlertTriangle className="h-5 w-5" /></div>
            <div className="flex-1">
              <p className="font-medium">{error}</p>
              <p className="text-sm text-red-600 mt-0.5">Verifique a conexão e tente atualizar a página</p>
            </div>
            <button onClick={loadJangadas} className="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded-lg transition-colors">Tentar novamente</button>
          </div>
        )}

        {/* Filters Panel */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <button
            onClick={() => setFilterExpanded(!filterExpanded)}
            className="w-full px-6 py-4 flex items-center justify-between bg-slate-50 border-b border-slate-100 hover:bg-slate-50/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-xl"><Filter className="h-5 w-5 text-indigo-600" /></div>
              <div>
                <h3 className="font-semibold text-slate-800">Filtros Avançados</h3>
                <p className="text-xs text-slate-500">Refine a pesquisa por status, localização, estação ou datas</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-slate-500">
              <span className="text-sm font-medium">{Object.values(filters).filter(v => v && v !== "todos" && v !== "todas").length} ativos</span>
              <ChevronDown className={`h-5 w-5 transition-transform ${filterExpanded ? "rotate-180" : ""}`} />
            </div>
          </button>

          <div className={`${filterExpanded ? "animate-in slide-in-from-top-2 duration-200" : "animate-out slide-out-to-top-2 duration-150 opacity-0"}`} style={{ display: filterExpanded ? "block" : "none" }}>
            <div className="p-6 space-y-5">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Pesquisar por série, marca, modelo, navio, armador, nº obra..."
                  value={filters.search}
                  onChange={(e) => setFilters({...filters, search: e.target.value})}
                  className="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm transition-all"
                />
              </div>

              {/* Filter Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <FilterSelect
                  label="Status Logístico"
                  value={filters.status}
                  onChange={(e) => setFilters({...filters, status: e.target.value})}
                  options={[
                    { value: "todos", label: "Todos os Status" },
                    { value: "aguardando", label: "⏳ Aguardando" },
                    { value: "recebida", label: "📥 Recebida" },
                    { value: "em_inspecao", label: "🔧 Em Inspeção" },
                    { value: "concluida", label: "✅ Concluída" },
                    { value: "expedida", label: "📦 Expedida" },
                    { value: "agendada", label: "📅 Agendada" },
                  ]}
                />
                <FilterSelect
                  label="Ilha"
                  value={filters.island}
                  onChange={(e) => setFilters({...filters, island: e.target.value})}
                  options={[{ value: "todas", label: "Todas as Ilhas" }, ...islands.map(i => ({ value: i, label: i }))]}
                />
                <FilterSelect
                  label="Estação"
                  value={filters.station}
                  onChange={(e) => setFilters({...filters, station: e.target.value})}
                  options={[{ value: "todas", label: "Todas as Estações" }, ...stations.map(s => ({ value: s.id.toString(), label: `${s.codigo} - ${s.nome}` }))]}
                />
                <FilterDateRange
                  label="Data Chegada"
                  from={filters.dateFrom}
                  to={filters.dateTo}
                  onFromChange={(e) => setFilters({...filters, dateFrom: e.target.value})}
                  onToChange={(e) => setFilters({...filters, dateTo: e.target.value})}
                />
              </div>

              {/* Stats Bar */}
              <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center gap-3">
                <StatChip label="Total" value={stats.total} color="slate" icon={<Package className="h-3 w-3" />} />
                <StatChip label="Para Receber" value={stats.receber} color="blue" icon={<Download className="h-3 w-3" />} />
                <StatChip label="Em Processo" value={stats.emProcesso} color="amber" icon={<Wrench className="h-3 w-3" />} />
                <StatChip label="Para Expedir" value={stats.expedir} color="emerald" icon={<Upload className="h-3 w-3" />} />
                <StatChip label="Expedidas" value={stats.expedidas} color="indigo" icon={<ShieldCheck className="h-3 w-3" />} />
              </div>
            </div>
          </div>
        </div>

        {/* Action Bar */}
        {selectedIds.size > 0 && (
          <div className="bg-gradient-to-r from-indigo-50 to-indigo-100 border border-indigo-200 rounded-2xl p-4 sm:p-6 animate-in slide-in-from-bottom-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm border border-slate-100">
                  <div className="p-2 bg-indigo-100 rounded-xl"><Ship className="h-5 w-5 text-indigo-600" /></div>
                  <div>
                    <p className="font-semibold text-slate-800">{selectedIds.size} jangada(s) selecionada(s)</p>
                    <p className="text-xs text-slate-500">Ações em lote disponíveis</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ActionButton
                    onClick={() => openActionModal("receber")}
                    icon={<Download className="h-4 w-4" />}
                    variant="primary"
                  >
                    Rececionar na Estação
                  </ActionButton>
                  <ActionButton
                    onClick={() => openActionModal("expedir")}
                    icon={<Upload className="h-4 w-4" />}
                    variant="secondary"
                  >
                    Expedir / Entregar
                  </ActionButton>
                  <ActionButton
                    onClick={handlePrintGuide}
                    icon={<Package className="h-4 w-4" />}
                    variant="ghost"
                  >
                    Gerar Documento
                  </ActionButton>
                </div>
              </div>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-sm text-slate-500 hover:text-slate-700 font-medium flex items-center gap-1"
              >
                <X className="h-4 w-4" /> Limpar seleção
              </button>
            </div>
          </div>
        )}

        {/* Table Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
              <div className="relative">
                <Loader2 className="h-10 w-10 text-indigo-600 animate-spin" />
                <div className="absolute inset-0 border-4 border-indigo-100 rounded-full animate-ping opacity-75" />
              </div>
              <div className="text-slate-500 font-medium">A carregar dados das jangadas...</div>
              <div className="h-1 w-48 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 animate-pulse" style={{ width: "60%" }} />
              </div>
            </div>
          ) : filteredJangadas.length === 0 ? (
            <div className="text-center py-16">
              <div className="mx-auto mb-4 p-4 bg-slate-100 rounded-2xl w-fit"><Truck className="h-12 w-12 text-slate-300" /></div>
              <h3 className="font-semibold text-slate-700 mb-1">Nenhuma jangada encontrada</h3>
              <p className="text-sm text-slate-500">Ajuste os filtros ou aguarde a sincronização dos dados</p>
              <button onClick={loadJangadas} className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors">
                <RefreshCw className="h-4 w-4" /> Atualizar agora
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="p-3 pl-4 w-12 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === filteredJangadas.length && filteredJangadas.length > 0}
                        onChange={handleSelectAll}
                        className="h-4 w-4 text-indigo-600 rounded border-slate-300 cursor-pointer transition-colors hover:bg-indigo-50"
                        aria-label="Selecionar todas"
                      />
                    </th>
                    <th className="p-3 text-left">Nº Série</th>
                    <th className="p-3 text-left">Marca / Modelo</th>
                    <th className="p-3 text-center">Cap.</th>
                    <th className="p-3 text-left">Navio</th>
                    <th className="p-3 text-left">Armador</th>
                    <th className="p-3 text-left">Ilha</th>
                    <th className="p-3 text-left">Estação</th>
                    <th className="p-3 text-left">Nº Obra</th>
                    <th className="p-3 text-left">Próx. Insp.</th>
                    <th className="p-3 text-left">Status</th>
                    <th className="p-3 text-center">Chegada</th>
                    <th className="p-3 text-center">Prev. Entrega</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredJangadas.map((jangada) => (
                    <tr key={jangada.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="p-3 pl-4 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(jangada.id)}
                          onChange={() => {
                            const next = new Set(selectedIds);
                            if (next.has(jangada.id)) next.delete(jangada.id);
                            else next.add(jangada.id);
                            setSelectedIds(next);
                          }}
                          className="h-4 w-4 text-indigo-600 rounded border-slate-300 cursor-pointer transition-colors hover:bg-indigo-50"
                        />
                      </td>
                      <td className="p-3 font-semibold text-slate-800 font-mono text-xs">{jangada.serial}</td>
                      <td className="p-3 text-slate-700">{jangada.brand} {jangada.model}</td>
                      <td className="p-3 text-center font-medium text-slate-700">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold">{jangada.capacity}P</span>
                      </td>
                      <td className="p-3 text-slate-600 truncate max-w-[150px]">
                        {jangada.shipName ? (
                          <span className="flex items-center gap-1"><Ship className="h-3 w-3 text-slate-400" /> {jangada.shipName}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="p-3 text-slate-600 truncate max-w-[150px]">
                        {jangada.owner ? (
                          <span className="flex items-center gap-1"><Building2 className="h-3 w-3 text-slate-400" /> {jangada.owner}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="p-3 text-slate-600">
                        {jangada.island ? (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-slate-100 rounded text-xs font-medium"><MapPin className="h-3 w-3" /> {jangada.island}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="p-3 text-slate-600 text-xs">
                        {jangada.serviceStationName ? (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[10px] font-medium">
                            <Building2 className="h-2.5 w-2.5" /> {jangada.serviceStationName}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="p-3 text-slate-600 font-mono text-xs">{jangada.numeroObra || <span className="text-slate-400">—</span>}</td>
                      <td className="p-3"><InspectionDate dateStr={jangada.dataProxInspecao} /></td>
                      <td className="p-3"><StatusBadge status={jangada.queueStatus} /></td>
                      <td className="p-3 text-center text-slate-500 text-xs">{jangada.queueDataChegada ? formatDate(jangada.queueDataChegada) : <span className="text-slate-400">—</span>}</td>
                      <td className="p-3 text-center text-slate-500 text-xs">{jangada.queueDataPrevistaEntrega ? formatDate(jangada.queueDataPrevistaEntrega) : <span className="text-slate-400">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Empty state for selected but no filter results */}
        {selectedIds.size > 0 && filteredJangadas.length === 0 && !loading && (
          <div className="text-center py-8 text-slate-500">
            <AlertCircle className="mx-auto mb-2 h-8 w-8 text-slate-300" />
            <p>As jangadas selecionadas não correspondem aos filtros atuais</p>
            <button onClick={() => setSelectedIds(new Set())} className="mt-2 text-sm text-indigo-600 hover:underline">Limpar seleção</button>
          </div>
        )}

        {/* Modals */}
        <Modal
          isOpen={actionMode === "receber"}
          onClose={closeActionModal}
          title="Rececionar Jangada(s)"
          icon={<Download className="h-5 w-5" />}
          footer={
            <>
              <ActionButton onClick={closeActionModal} variant="ghost">Cancelar</ActionButton>
              <ActionButton onClick={handleActionSubmit} variant="primary" disabled={!actionData.stationId}>
                Confirmar Receção
              </ActionButton>
            </>
          }
        >
          <ActionForm
            actionData={actionData}
            setActionData={setActionData}
            stations={stations}
            tecnicos={tecnicos}
            mode="receber"
            selectedCount={selectedIds.size}
            jangadas={jangadas}
            selectedIds={selectedIds}
          />
        </Modal>

        <Modal
          isOpen={actionMode === "expedir"}
          onClose={closeActionModal}
          title="Expedir Jangada(s)"
          icon={<Upload className="h-5 w-5" />}
          footer={
            <>
              <ActionButton onClick={closeActionModal} variant="ghost">Cancelar</ActionButton>
              <ActionButton onClick={handleActionSubmit} variant="secondary">
                Confirmar Expedição
              </ActionButton>
            </>
          }
        >
          <ActionForm
            actionData={actionData}
            setActionData={setActionData}
            stations={stations}
            tecnicos={tecnicos}
            mode="expedir"
            selectedCount={selectedIds.size}
            jangadas={jangadas}
            selectedIds={selectedIds}
          />
        </Modal>
      </div>
    </div>
  );
}

// Helper Components
function FilterSelect({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">{label}</label>
      <select value={value} onChange={onChange} className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm transition-all appearance-none bg-no-repeat bg-right pr-10 bg-[url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22none%22 viewBox=%220 0 24 24%22 stroke=%22%2394a3b8%22%3E%3Cpath stroke-linecap=%22round%22 stroke-linejoin=%22round%22 stroke-width=%222%22 d=%22M19 9l-7 7-7-7%22/%3E%3C/svg%3E')] bg-[right_0.75rem_center]">
        {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
    </div>
  );
}

function FilterDateRange({ label, from, to, onFromChange, onToChange }: {
  label: string;
  from: string;
  to: string;
  onFromChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onToChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="lg:col-span-2">
      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">{label}</label>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input type="date" value={from} onChange={onFromChange} className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm transition-all placeholder-slate-400" placeholder="De" />
        </div>
        <span className="text-slate-400 font-medium px-1">a</span>
        <div className="relative flex-1">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input type="date" value={to} onChange={onToChange} className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm transition-all placeholder-slate-400" placeholder="Até" />
        </div>
      </div>
    </div>
  );
}

function StatChip({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  const colors = {
    slate: "bg-slate-100 text-slate-700 border-slate-200",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-100",
  };
  return (
    <button className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border ${colors[color as keyof typeof colors] || colors.slate} hover:shadow-md transition-all`}>
      <span className="p-0.5 bg-white/50 rounded">{icon}</span>
      <span>{label}</span>
      <span className="w-5 h-5 flex items-center justify-center bg-white/50 rounded-lg font-bold text-[10px]">{value}</span>
    </button>
  );
}

function ActionForm({ actionData, setActionData, stations, tecnicos, mode, selectedCount, jangadas, selectedIds }: {
  actionData: { stationId: string; tecnico: string; observacoes: string; dataPrevistaEntrega: string };
  setActionData: React.Dispatch<React.SetStateAction<{ stationId: string; tecnico: string; observacoes: string; dataPrevistaEntrega: string }>>;
  stations: Array<{id: number; codigo: string; nome: string}>;
  tecnicos: Array<{nome: string}>;
  mode: "receber" | "expedir";
  selectedCount: number;
  jangadas: JangadaLogistica[];
  selectedIds: Set<number>;
}) {
  return (
    <div className="space-y-5">
      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
        <p className="text-sm text-slate-600">
          <strong>{selectedCount}</strong> jangada(s) selecionada(s):{" "}
          {Array.from(selectedIds).slice(0, 5).map(id => {
            const j = jangadas.find(x => x.id === id);
            return j ? <span key={j.id} className="font-mono text-xs bg-white px-1.5 py-0.5 rounded mx-0.5 border border-slate-100">{j.serial}</span> : null;
          })}
          {selectedIds.size > 5 && <span className="text-slate-400 text-xs"> +{selectedIds.size - 5} mais</span>}
        </p>
      </div>

      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Estação de Serviço <span className="text-red-500">*</span></label>
        <select
          value={actionData.stationId}
          onChange={(e) => setActionData({...actionData, stationId: e.target.value})}
          className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm transition-all appearance-none bg-no-repeat bg-right pr-10 bg-[url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22none%22 viewBox=%220 0 24 24%22 stroke=%22%2394a3b8%22%3E%3Cpath stroke-linecap=%22round%22 stroke-linejoin=%22round%22 stroke-width=%222%22 d=%22M19 9l-7 7-7-7%22/%3E%3C/svg%3E')] bg-[right_0.75rem_center]"
          required
        >
          <option value="">Selecionar estação...</option>
          {stations.map(s => <option key={s.id} value={s.id.toString()}>{s.codigo} - {s.nome}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Técnico Responsável</label>
        <input
          type="text"
          list="tecnicos-list"
          value={actionData.tecnico}
          onChange={(e) => setActionData({...actionData, tecnico: e.target.value})}
          className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm transition-all"
          placeholder="Nome do técnico"
        />
        <datalist id="tecnicos-list">
          {tecnicos.map(t => <option key={t.nome} value={t.nome} />)}
        </datalist>
      </div>

      {mode === "receber" && (
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Data Prevista de Entrega</label>
          <input
            type="date"
            value={actionData.dataPrevistaEntrega}
            onChange={(e) => setActionData({...actionData, dataPrevistaEntrega: e.target.value})}
            className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm transition-all"
          />
        </div>
      )}

      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Observações</label>
        <textarea
          value={actionData.observacoes}
          onChange={(e) => setActionData({...actionData, observacoes: e.target.value})}
          rows={3}
          className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm transition-all resize-none"
          placeholder={mode === "receber" ? "Observações sobre o estado da jangada, danos no transporte, documentação..." : "Observações sobre a entrega, condição da jangada, confirmação do cliente..."}
        />
      </div>
    </div>
  );
}