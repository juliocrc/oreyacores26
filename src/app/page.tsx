"use client";
import Link from "next/link";
import PremiumCharts from "@/components/dashboard/PremiumCharts";
import AcoesDeHojePanel from "@/components/dashboard/AcoesDeHojePanel";
import ExecutiveKpis from "@/components/dashboard/ExecutiveKpis";
import QuickImportActions from "@/components/dashboard/QuickImportActions";
import OfflineStatusIndicator from "@/components/OfflineStatusIndicator";
import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { formatDateCompact, getLocalDateKey } from "@/lib/date-utils";
import {
  type StatsPayload,
  type NeedsPayload,
  type AuditoriaPlaneamentoPayload,
  type OrdensKpisPayload,
  type OtOperationalAlertsPayload,
  type JangadaAlertPayload,
  type AlertsPayload,
  type AgendaMetricsPayload,
  type DataQualityPayload,
  itemVariants,
} from "@/types/home-page";
import {
  daysUntil,
  formatHoursFromMinutes,
  isDueWithinDays,
  formatAuditBadge,
} from "@/lib/home-page-helpers";

const PressureTestTimer = dynamic(() => import("@/app/components/PressureTestTimer"), {
  ssr: false,
  loading: () => (
    <div className="h-[200px] rounded-3xl border border-slate-200 bg-slate-50 flex items-center justify-center shadow-sm animate-pulse">
      <p className="text-sm text-slate-500 font-semibold">A carregar cronómetro...</p>
    </div>
  ),
});
import { Bar } from "react-chartjs-2";
import { motion } from "framer-motion";
import { APP_CONFIG } from "@/lib/app-config";
import { OT_CREATION_ROUTE } from "@/lib/permissions-catalog";
import {
  ShieldAlert,
  Ship,
  Users,
  Anchor,
  ChevronRight,
  Activity,
  ArrowRight,
  BarChart3,
  Wrench,
  LifeBuoy,
  Package,
  Calendar,
  AlertTriangle,
  TrendingUp,
  X,
} from "lucide-react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import {
  hasEditablePathPermission,
  hasVisiblePathPermission,
} from "@/lib/permission-access";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
);

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const { data: session } = useSession();
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [planeamentoNegativo12m, setPlaneamentoNegativo12m] = useState(0);
  const [stockCommand, setStockCommand] = useState<{
    itemsInAlert: number;
    reorderCost: number;
    coveragePercent: number;
    deficitUnits12m: number;
    topBuy: Array<{ nome: string; referencia?: string; reorderQty: number; orderLimitDate?: string; fornecedor?: string }>;
    monthly: Array<{ month: string; quantidade: number }>;
    pedidosAbertos: number;
    prateleirasSemLocal: number;
    rafts90d: number;
  }>({
    itemsInAlert: 0,
    reorderCost: 0,
    coveragePercent: 100,
    deficitUnits12m: 0,
    topBuy: [],
    monthly: [],
    pedidosAbertos: 0,
    prateleirasSemLocal: 0,
    rafts90d: 0,
  });
  const [auditoriaPlaneamento, setAuditoriaPlaneamento] =
    useState<AuditoriaPlaneamentoPayload | null>(null);
  const [ordensKpis, setOrdensKpis] = useState<OrdensKpisPayload | null>(null);
  const [otOperationalAlerts, setOtOperationalAlerts] =
    useState<OtOperationalAlertsPayload>({
      summary: {
        total: 0,
        critical: 0,
        warning: 0,
        info: 0,
        byType: { delayed: 0, runningTooLong: 0, stockInsufficient: 0 },
      },
      alerts: [],
    });
  const [alertsPayload, setAlertsPayload] = useState<AlertsPayload>({
    total: 0,
    inspecoes: 0,
    certificados: 0,
    pedidosAssistencia: 0,
    epirbs: 0,
    extintores: 0,
    alertas: [],
  });
  const [technicians, setTechnicians] = useState<{ id: number; nome: string }[]>([]);
  const [agendaMetrics, setAgendaMetrics] =
    useState<AgendaMetricsPayload | null>(null);
  const [dataQuality, setDataQuality] = useState<DataQualityPayload | null>(
    null,
  );
  const [expiringAlerts, setExpiringAlerts] = useState<any>(null);
  const [giThAlerts, setGiThAlerts] = useState<{
    gi30d: number;
    th30d: number;
    giVencidos: number;
    thVencidos: number;
    hruVencidos: number;
  }>({ gi30d: 0, th30d: 0, giVencidos: 0, thVencidos: 0, hruVencidos: 0 });
  const [giVencidosList, setGiVencidosList] = useState<any[]>([]);
  const [thVencidosList, setThVencidosList] = useState<any[]>([]);
  const [hruVencidosList, setHruVencidosList] = useState<any[]>([]);
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    title: string;
    items: any[];
    type: "gi" | "th" | "hru" | "";
  }>({ isOpen: false, title: "", items: [], type: "" });
  const [forecastDays, setForecastDays] = useState(60);
  const [forecastData, setForecastData] = useState<any>(null);
  const [loadingForecast, setLoadingForecast] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedMarca, setSelectedMarca] = useState<string>("__ALL__");
  const [otAlertSeverityFilter, setOtAlertSeverityFilter] = useState<
    "all" | "critical" | "warning" | "info"
  >("all");
  const [otAlertTypeFilter, setOtAlertTypeFilter] = useState<
    "all" | "delayed" | "running_too_long" | "stock_insufficient"
  >("all");

  const userRole = session?.user?.role || "USER";
  const userPermissions = session?.user?.permissions;
  const canAccessPath = (pathname: string) =>
    userRole === "ADMIN" ||
    hasVisiblePathPermission(userPermissions, pathname) ||
    hasEditablePathPermission(userPermissions, pathname);

  const canViewAgenda = canAccessPath("/agenda");
  const canViewJangadas = canAccessPath("/jangadas");
  const canViewEquipamentos = canAccessPath("/equipamentos");
  const canViewNavios = canAccessPath("/navios");
  const canViewEstacaoServico = canAccessPath("/estacao-servico");
  const canViewLogistica = canAccessPath("/logistica");
  const canViewOrdensServico = canAccessPath("/ordens-servico");
  const canViewAlertas = canAccessPath("/alertas");
  const canViewStock = canAccessPath("/stock");
  const canViewQualidadeDados = canAccessPath("/qualidade-dados");
  const canViewEpirbs = canAccessPath("/epirbs");
  const showLeanOperationalDashboard = userRole !== "ADMIN";

  const fetchStats = async () => {
    setLoading(true);
    try {
      const [
        statsRes,
        needsRes,
        auditoriaRes,
        ordensKpisRes,
        otAlertsRes,
        alertsRes,
        agendaMetricsRes,
        dataQualityRes,
        tecnicosRes,
        expiringRes,
        criticalStockRes,
        pedidosRes,
        prateleirasRes,
      ] = await Promise.all([
        fetch("/api/stats"),
        fetch("/api/stock/necessidades?stockScope=jangadas-ocean"),
        fetch("/api/auditorias/planeamento"),
        fetch("/api/ordens-servico/kpis"),
        fetch("/api/ordens-servico/alertas" + (userRole !== "ADMIN" && session?.user?.name ? `?tecnico=${encodeURIComponent(session.user.name)}` : "")),
        fetch("/api/alertas"),
        fetch("/api/agenda/metrics"),
        fetch("/api/data-quality"),
        fetch("/api/tecnicos"),
        fetch("/api/stock/expiring"),
        fetch("/api/stock/critical"),
        fetch("/api/stock/pedidos-reposicao"),
        fetch("/api/stock/prateleiras"),
      ]);

      const data = await statsRes.json();
      setStats(data);

      if (expiringRes.ok) {
        const expiringData = await expiringRes.json();
        setExpiringAlerts(expiringData);
      } else {
        setExpiringAlerts(null);
      }

      // Notificação stock zero
      if (criticalStockRes.ok) {
        const criticalData = await criticalStockRes.json();
        const zeroItems = (criticalData.criticalItems || []).filter((item: any) => item.quantidade === 0);
        if (zeroItems.length > 0 && typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
          zeroItems.slice(0, 3).forEach((item: any) => {
            new Notification(`Stock zero: ${item.referencia}`, {
              body: `${item.descricao} — sem stock!`,
              icon: "/app_icon.ico",
            });
          });
        }
      }

      if (needsRes.ok) {
        const needs = (await needsRes.json()) as NeedsPayload;
        const stockNeeds = needs.stockNeeds || [];
        const needsRows = needs.needs || [];
        const negativos = stockNeeds.filter(
          (item) => Number(item.saldoProjetado12m || 0) < 0,
        ).length;
        const deficitUnits12m = Math.abs(
          stockNeeds.reduce(
            (acc, item) =>
              Number(item.saldoProjetado12m || 0) < 0
                ? acc + Number(item.saldoProjetado12m || 0)
                : acc,
            0,
          ),
        );
        const topBuy = needsRows
          .filter((n) => Number(n.reorderQty || 0) > 0)
          .sort((a, b) => Number(b.reorderQty || 0) - Number(a.reorderQty || 0))
          .slice(0, 6)
          .map((n) => ({
            nome: n.nome || n.referencia || "Artigo",
            referencia: n.referencia,
            reorderQty: Number(n.reorderQty || 0),
            orderLimitDate: n.orderLimitDate,
            fornecedor: n.fornecedor,
          }));
        const monthly = (needs.summary?.necessidadesMensaisTotais || [])
          .map((m) => ({
            month: m.month,
            quantidade: Number(m.quantidade ?? m.qty ?? 0),
          }))
          .filter((m) => m.quantidade > 0)
          .slice(0, 6);

        setPlaneamentoNegativo12m(negativos || Number(needs.summary?.itemsInAlert || 0));
        setStockCommand((prev) => ({
          ...prev,
          itemsInAlert: Number(needs.summary?.itemsInAlert || negativos || topBuy.length),
          reorderCost: Number(needs.summary?.totalReorderCost || 0),
          coveragePercent: Number(needs.summary?.coveragePercent ?? 100),
          deficitUnits12m,
          topBuy,
          monthly,
          rafts90d: Number(needs.summary?.expiringRafts90d || 0),
        }));
      } else {
        setPlaneamentoNegativo12m(0);
      }

      if (pedidosRes.ok) {
        const pedidosData = await pedidosRes.json().catch(() => ({ pedidos: [] }));
        const list = Array.isArray(pedidosData?.pedidos) ? pedidosData.pedidos : [];
        const abertos = list.filter((p: any) =>
          ["rascunho", "encomendado", "parcial"].includes(String(p.status || "").toLowerCase())
        ).length;
        setStockCommand((prev) => ({ ...prev, pedidosAbertos: abertos }));
      }

      if (prateleirasRes.ok) {
        const prat = await prateleirasRes.json().catch(() => ({}));
        setStockCommand((prev) => ({
          ...prev,
          prateleirasSemLocal: Number(prat?.unassignedCount || 0),
        }));
      }

      if (auditoriaRes.ok) {
        const auditoriaData =
          (await auditoriaRes.json()) as AuditoriaPlaneamentoPayload;
        setAuditoriaPlaneamento(auditoriaData);
      } else {
        setAuditoriaPlaneamento(null);
      }

      if (ordensKpisRes.ok) {
        const ordensData = (await ordensKpisRes.json()) as OrdensKpisPayload;
        setOrdensKpis(ordensData);
      } else {
        setOrdensKpis(null);
      }

      if (otAlertsRes.ok) {
        const otAlertsData =
          (await otAlertsRes.json()) as OtOperationalAlertsPayload;
        setOtOperationalAlerts({
          summary: {
            total: Number(otAlertsData?.summary?.total || 0),
            critical: Number(otAlertsData?.summary?.critical || 0),
            warning: Number(otAlertsData?.summary?.warning || 0),
            info: Number(otAlertsData?.summary?.info || 0),
            byType: {
              delayed: Number(otAlertsData?.summary?.byType?.delayed || 0),
              runningTooLong: Number(
                otAlertsData?.summary?.byType?.runningTooLong || 0,
              ),
              stockInsufficient: Number(
                otAlertsData?.summary?.byType?.stockInsufficient || 0,
              ),
            },
          },
          alerts: Array.isArray(otAlertsData?.alerts)
            ? otAlertsData.alerts
            : [],
        });
      } else {
        setOtOperationalAlerts({
          summary: {
            total: 0,
            critical: 0,
            warning: 0,
            info: 0,
            byType: { delayed: 0, runningTooLong: 0, stockInsufficient: 0 },
          },
          alerts: [],
        });
      }

      if (alertsRes.ok) {
        const alertsData = (await alertsRes.json()) as AlertsPayload;
        setAlertsPayload({
          total: Number(alertsData?.total || 0),
          inspecoes: Number(alertsData?.inspecoes || 0),
          certificados: Number(alertsData?.certificados || 0),
          pedidosAssistencia: Number(alertsData?.pedidosAssistencia || 0),
          epirbs: Number(alertsData?.epirbs || 0),
          extintores: Number(alertsData?.extintores || 0),
          alertas: Array.isArray(alertsData?.alertas)
            ? alertsData.alertas
            : [],
        });
      } else {
        setAlertsPayload({
          total: 0,
          inspecoes: 0,
          certificados: 0,
          pedidosAssistencia: 0,
          alertas: [],
        });
      }

      if (agendaMetricsRes.ok) {
        const agendaData =
          (await agendaMetricsRes.json()) as AgendaMetricsPayload;
        setAgendaMetrics(agendaData);
      } else {
        setAgendaMetrics(null);
      }

      if (dataQualityRes.ok) {
        const qualityData =
          (await dataQualityRes.json()) as DataQualityPayload;
        setDataQuality(qualityData);
      } else {
        setDataQuality(null);
      }

      if (tecnicosRes.ok) {
        const tecnicosData = await tecnicosRes.json();
        const allTechs: { id: number; nome: string }[] = [];
        if (Array.isArray(tecnicosData.stations)) {
          tecnicosData.stations.forEach((station: any) => {
            if (Array.isArray(station.tecnicos)) {
              station.tecnicos.forEach((tech: any) => {
                allTechs.push({ id: tech.id, nome: tech.nome });
              });
            }
          });
        }
        if (Array.isArray(tecnicosData.unassigned)) {
          tecnicosData.unassigned.forEach((tech: any) => {
            allTechs.push({ id: tech.id, nome: tech.nome });
          });
        }
        setTechnicians(allTechs);
      }
    } catch (error) {
      console.error("Erro ao carregar dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const pendingAssistencia = useMemo(() => {
    return (alertsPayload.alertas || []).filter((a) => a.tipo === "assistencia");
  }, [alertsPayload.alertas]);

  const handleQuickAssign = async (orderId: number, tecnicoId: number) => {
    try {
      const res = await fetch(`/api/ordens-servico/${orderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tecnicoId, status: "em_curso" }),
      });
      if (res.ok) {
        fetchStats();
      } else {
        const errData = await res.json();
        alert(`Erro ao atribuir técnico: ${errData?.error || "Desconhecido"}`);
      }
    } catch (e) {
      console.error(e);
      alert("Erro ao atribuir técnico.");
    }
  };

  const handleQuickAccept = async (orderId: number) => {
    try {
      const res = await fetch(`/api/ordens-servico/${orderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "em_curso" }),
      });
      if (res.ok) {
        fetchStats();
      } else {
        const errData = await res.json();
        alert(`Erro ao aceitar pedido: ${errData?.error || "Desconhecido"}`);
      }
    } catch (e) {
      console.error(e);
      alert("Erro ao aceitar pedido.");
    }
  };

  const handleQuickDelete = async (orderId: number) => {
    if (!confirm("Tem a certeza que deseja eliminar este pedido de assistência?")) return;
    try {
      const res = await fetch(`/api/ordens-servico/${orderId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchStats();
      } else {
        const errData = await res.json();
        alert(`Erro ao eliminar pedido: ${errData?.error || "Desconhecido"}`);
      }
    } catch (e) {
      console.error(e);
      alert("Erro ao eliminar pedido.");
    }
  };

  useEffect(() => {
    async function fetchGiThAlerts() {
      try {
        const res = await fetch("/api/jangadas?scope=all", {
          cache: "no-store",
        });
        const payload = (await res
          .json()
          .catch(() => [])) as JangadaAlertPayload[];
        if (!res.ok || !Array.isArray(payload)) {
          setGiThAlerts({ gi30d: 0, th30d: 0, giVencidos: 0, thVencidos: 0, hruVencidos: 0 });
          return;
        }

        const now = new Date();
        now.setHours(0, 0, 0, 0);

        const gi30d = payload.filter((row) =>
          isDueWithinDays(row?.dataProxInspecao, 30),
        ).length;
        const th30d = payload.filter((row) =>
          isDueWithinDays(row?.cylinderDataProxTeste, 30),
        ).length;

        const giVencidosArr = payload.filter((row) => {
          if (!row?.dataProxInspecao) return false;
          const limit = new Date(row.dataProxInspecao);
          return !isNaN(limit.getTime()) && limit < now;
        });

        const thVencidosArr = payload.filter((row) => {
          if (!row?.cylinderDataProxTeste) return false;
          const limit = new Date(row.cylinderDataProxTeste);
          return !isNaN(limit.getTime()) && limit < now;
        });

        const hruVencidosArr = payload.filter((row) => {
          if (!row?.hruValidade) return false;
          const limit = new Date(row.hruValidade);
          return !isNaN(limit.getTime()) && limit < now;
        });

        setGiVencidosList(giVencidosArr);
        setThVencidosList(thVencidosArr);
        setHruVencidosList(hruVencidosArr);
        setGiThAlerts({
          gi30d,
          th30d,
          giVencidos: giVencidosArr.length,
          thVencidos: thVencidosArr.length,
          hruVencidos: hruVencidosArr.length
        });
      } catch {
        setGiVencidosList([]);
        setThVencidosList([]);
        setHruVencidosList([]);
        setGiThAlerts({ gi30d: 0, th30d: 0, giVencidos: 0, thVencidos: 0, hruVencidos: 0 });
      }
    }

    void fetchGiThAlerts();
  }, []);

  useEffect(() => {
    if (activeTab !== "logistics") return;
    async function fetchForecast() {
      setLoadingForecast(true);
      try {
        const res = await fetch(`/api/stats/previsao-compras?dias=${forecastDays}`);
        if (res.ok) {
          const data = await res.json();
          setForecastData(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingForecast(false);
      }
    }
    void fetchForecast();
  }, [activeTab, forecastDays]);

  const labels = stats?.naviosPorIlha?.map((x) => x.ilha) || [];
  const tipoByIlha = new Map(
    (stats?.naviosPorIlhaTipo || []).map((row) => [row.ilha, row]),
  );

  const data = {
    labels,
    datasets: [
      {
        label: "Pesca Local",
        data: labels.map((ilha) => tipoByIlha.get(ilha)?.pescaLocal || 0),
        backgroundColor: "#22c55e",
      },
      {
        label: "Pesca Costeira",
        data: labels.map((ilha) => tipoByIlha.get(ilha)?.pescaCosteira || 0),
        backgroundColor: "#3b82f6",
      },
      {
        label: "Pesca do Largo",
        data: labels.map((ilha) => tipoByIlha.get(ilha)?.pescaLargo || 0),
        backgroundColor: "#06b6d4",
      },
      {
        label: "Tráfego Local",
        data: labels.map((ilha) => tipoByIlha.get(ilha)?.trafegoLocal || 0),
        backgroundColor: "#8b5cf6",
      },
      {
        label: "Auxiliar Local",
        data: labels.map((ilha) => tipoByIlha.get(ilha)?.auxiliarLocal || 0),
        backgroundColor: "#64748b",
      },
      {
        label: "Marítimo-Turística",
        data: labels.map(
          (ilha) => tipoByIlha.get(ilha)?.maritimoTuristica || 0,
        ),
        backgroundColor: "#f59e0b",
      },
      {
        label: "Náutica de Recreio",
        data: labels.map((ilha) => tipoByIlha.get(ilha)?.nauticaRecreio || 0),
        backgroundColor: "#ec4899",
      },
      {
        label: "Outro",
        data: labels.map((ilha) => tipoByIlha.get(ilha)?.outro || 0),
        backgroundColor: "#d1d5db",
      },
    ],
  };

  const barOptions = {
    responsive: true,
    plugins: {
      legend: { display: true, position: "bottom" as const },
    },
    scales: {
      x: { stacked: true },
      y: { stacked: true, beginAtZero: true },
    },
  };

  const percentNaviosCompletos = stats?.navios
    ? Math.round(((stats.naviosComDadosMinimos || 0) / stats.navios) * 100)
    : 0;
  const diasParaAuditoria = daysUntil(auditoriaPlaneamento?.proximaAuditoria);
  const auditoriaBadge = formatAuditBadge(diasParaAuditoria);
  const marcas = stats?.jangadasPorMarca || [];
  const modelos =
    selectedMarca === "__ALL__"
      ? (stats?.jangadasPorModelo || []).slice(0, 20)
      : (stats?.jangadasPorMarcaModelo || [])
          .filter((row) => row.marca === selectedMarca)
          .sort((a, b) => b.total - a.total)
          .slice(0, 20)
          .map((row) => ({ modelo: row.modelo, total: row.total }));
  const lotacoes =
    selectedMarca === "__ALL__"
      ? stats?.jangadasPorLotacao || []
      : (stats?.jangadasPorMarcaLotacao || [])
          .filter((row) => row.marca === selectedMarca)
          .sort((a, b) => a.lotacao - b.lotacao)
          .map((row) => ({ lotacao: row.lotacao, total: row.total }));

  const totalAlertasCriticos =
    (stats?.artigosVencidosStock || 0) +
    (stats?.artigosEmRutura || 0) +
    (ordensKpis?.delayed || 0);
  const topTecnico = ordensKpis?.byTecnico?.[0] || null;
  const totalOTEmCurso = (ordensKpis?.total || 0) - (ordensKpis?.delayed || 0);
  const topAlerts = (alertsPayload.alertas || []).slice(0, 5);
  const topDataQualityIssues = (dataQuality?.issues || [])
    .filter((issue) => issue.count > 0)
    .slice(0, 4);
  const filteredOtAlerts = useMemo(() => {
    return (otOperationalAlerts.alerts || []).filter((alert) => {
      if (
        otAlertSeverityFilter !== "all" &&
        alert.severity !== otAlertSeverityFilter
      )
        return false;
      if (otAlertTypeFilter !== "all" && alert.type !== otAlertTypeFilter)
        return false;
      return true;
    });
  }, [otOperationalAlerts.alerts, otAlertSeverityFilter, otAlertTypeFilter]);
  const topOtOperationalAlerts = filteredOtAlerts.slice(0, 6);
  const heroHighlights = [
    canViewAgenda
      ? {
          title: "Inspeções hoje",
          value: `${stats?.inspecoesHoje ?? "—"}`,
          helper: "Fila operacional do dia.",
        }
      : null,
    canViewAgenda
      ? {
          title: "Agenda 7 dias",
          value: `${agendaMetrics?.upcomingNext7Days ?? 0}`,
          helper: `${agendaMetrics?.overdueCount ?? 0} evento(s) em atraso.`,
        }
      : null,
    canViewJangadas
      ? {
          title: "Jangadas sem associação",
          value: `${stats?.jangadasSemNavioAssociado ?? "—"}`,
          helper: "Pendências a reconciliar com navios.",
        }
      : null,
    canViewEquipamentos
      ? {
          title: "Alertas 30 dias",
          value: `${alertsPayload.total}`,
          helper: `${alertsPayload.inspecoes} inspeções · ${alertsPayload.certificados} certificados${alertsPayload.extintores ? ` · ${alertsPayload.extintores} extintores` : ""}${alertsPayload.fatos ? ` · ${alertsPayload.fatos} fatos` : ""}`,
        }
      : null,
  ].filter(Boolean) as Array<{ title: string; value: string; helper: string }>;
  const workbenchCards = [
    {
      title: "Inspeções de hoje",
      value: `${stats?.inspecoesHoje ?? 0}`,
      helper:
        (stats?.inspecoesHoje || 0) > 0
          ? "Há serviço planeado para hoje."
          : "Hoje está limpo nesta frente.",
      href: "/agenda",
      cta: "Abrir agenda",
      tone:
        (stats?.inspecoesHoje || 0) > 0
          ? "border-blue-200 bg-blue-50"
          : "border-slate-200 bg-slate-50",
      visible: canViewAgenda,
    },
    {
      title: "OT em atraso",
      value: `${ordensKpis?.delayed ?? 0}`,
      helper: `OT totais: ${ordensKpis?.total ?? 0}`,
      href: "/ordens-servico",
      cta: "Ver ordens",
      tone:
        (ordensKpis?.delayed || 0) > 0
          ? "border-rose-200 bg-rose-50"
          : "border-emerald-200 bg-emerald-50",
      visible: canViewOrdensServico,
    },
    {
      title: "Alertas 30 dias",
      value: `${alertsPayload.total}`,
      helper: `${alertsPayload.inspecoes} inspeções · ${alertsPayload.certificados} certificados${alertsPayload.extintores ? ` · ${alertsPayload.extintores} extintores` : ""}${alertsPayload.fatos ? ` · ${alertsPayload.fatos} fatos` : ""}`,
      href: "/alertas",
      cta: "Abrir alertas",
      tone:
        alertsPayload.total > 0
          ? "border-amber-200 bg-amber-50"
          : "border-emerald-200 bg-emerald-50",
      visible: canViewAlertas,
    },
    {
      title: "Agenda próxima semana",
      value: `${agendaMetrics?.upcomingNext7Days ?? 0}`,
      helper: `${agendaMetrics?.overdueCount ?? 0} evento(s) em atraso`,
      href: "/agenda",
      cta: "Planear semana",
      tone:
        (agendaMetrics?.overdueCount || 0) > 0
          ? "border-yellow-200 bg-yellow-50"
          : "border-cyan-200 bg-cyan-50",
      visible: canViewAgenda,
    },
  ] as const;
  const quickActions = [
    {
      href: "/jangadas",
      title: "Abrir inspeção",
      description: "Entrar diretamente na operação de jangadas.",
      tone: "border-blue-200 bg-blue-50 text-blue-900",
      visible: canViewJangadas,
      essential: true,
    },
    {
      href: "/ordens-servico",
      title: "Ordens de serviço",
      description: "Prioridades, execução e atrasos sem mudar de cais.",
      tone: "border-violet-200 bg-violet-50 text-violet-900",
      visible: canViewOrdensServico,
      essential: false,
    },
    {
      href: "/alertas",
      title: "Ver alertas",
      description: "Certificados, stock e prazos a pedir atenção.",
      tone: "border-rose-200 bg-rose-50 text-rose-900",
      visible: canViewAlertas,
      essential: false,
    },
    {
      href: "/agenda",
      title: "Abrir agenda",
      description: "Planeamento do dia, equipas e visitas em linha.",
      tone: "border-cyan-200 bg-cyan-50 text-cyan-900",
      visible: canViewAgenda,
      essential: true,
    },
    {
      href: "/estacao-servico",
      title: "Estação de serviço",
      description: "Receções, triagem e fluxo técnico sem passos a mais.",
      tone: "border-sky-200 bg-sky-50 text-sky-900",
      visible: canViewEstacaoServico,
      essential: true,
    },
    {
      href: "/logistica",
      title: "Logística",
      description: "Entregas, expedições e fecho operacional do dia.",
      tone: "border-lime-200 bg-lime-50 text-lime-900",
      visible: canViewLogistica,
      essential: true,
    },
    {
      href: "/navios",
      title: "Abrir navios",
      description: "Associar jangadas e coletes ao navio certo, à primeira.",
      tone: "border-slate-200 bg-slate-50 text-slate-900",
      visible: canViewNavios,
      essential: true,
    },
    {
      href: "/stock",
      title: "Gerir stock",
      description: "Rutura, mínimos e entradas sem dar voltas ao cais.",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-900",
      visible: canViewStock,
      essential: false,
    },
    {
      href: "/stock/reposicoes",
      title: "Reposições stock",
      description: "Necessidades mensais (validades), compra e pedidos.",
      tone: "border-amber-200 bg-amber-50 text-amber-900",
      visible: canViewStock,
      essential: true,
    },
    {
      href: "/equipamentos",
      title: "Abrir coletes",
      description: "Inspeções, associações e dossiês do equipamento.",
      tone: "border-orange-200 bg-orange-50 text-orange-900",
      visible: canViewEquipamentos,
      essential: true,
    },
    {
      href: "/epirbs",
      title: "Abrir EPIRBs",
      description: "Baterias, HEX ID e ligações ao navio num salto.",
      tone: "border-indigo-200 bg-indigo-50 text-indigo-900",
      visible: canViewEpirbs,
      essential: false,
    },
    {
      href: "/qualidade-dados",
      title: "Saúde de dados",
      description:
        "Pendências de associação, contactos e campos essenciais num só painel.",
      tone: "border-slate-200 bg-slate-50 text-slate-900",
      visible: canViewQualidadeDados,
      essential: false,
    },
    {
      href: "/criar-ot",
      title: "Nova OS",
      description: "Criar ordem de servico rapida sem sair do painel.",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-900",
      visible: true,
      essential: true,
    },
  ] as const;

  const priorityItems = [
    {
      title: "Fechar o dia de inspeções",
      value: `${stats?.inspecoesHoje ?? 0} previstas`,
      hint:
        (stats?.inspecoesHoje || 0) > 0
          ? "Há trabalho em pista hoje."
          : "Sem inspeções agendadas para hoje.",
      tone:
        (stats?.inspecoesHoje || 0) > 0
          ? "border-blue-200 bg-blue-50"
          : "border-slate-200 bg-slate-50",
    },
    {
      title: "Controlar risco operacional",
      value: `${totalAlertasCriticos} alertas prioritários`,
      hint: "Soma de rutura, vencidos em stock e OT em atraso.",
      tone:
        totalAlertasCriticos > 0
          ? "border-rose-200 bg-rose-50"
          : "border-emerald-200 bg-emerald-50",
    },
    {
      title: "Garantir documentação viva",
      value: `${stats?.certificadosAte30d ?? 0} cert. · ${giThAlerts.gi30d} GI · ${giThAlerts.th30d} TH`,
      hint: "Janela de 30 dias para certificados, GI e teste hidráulico.",
      tone:
        (stats?.certificadosAte30d || 0) > 0 ||
        giThAlerts.gi30d > 0 ||
        giThAlerts.th30d > 0
          ? "border-amber-200 bg-amber-50"
          : "border-emerald-200 bg-emerald-50",
    },
    {
      title: "Limpar pendências de planeamento",
      value: `${planeamentoNegativo12m} negativos / ${stats?.jangadasSemNavioAssociado ?? 0} sem associação`,
      hint: "Planeamento de stock e jangadas órfãs no mesmo radar.",
      tone:
        planeamentoNegativo12m > 0 ||
        (stats?.jangadasSemNavioAssociado || 0) > 0
          ? "border-yellow-200 bg-yellow-50"
          : "border-emerald-200 bg-emerald-50",
    },
  ] as const;

  const orderStatusSummary = (ordensKpis?.byStatus || []).slice(0, 4);
  const visibleWorkbenchCards = workbenchCards.filter(
    (item) =>
      item.visible &&
      (!showLeanOperationalDashboard || item.href !== "/alertas"),
  );
  const visibleQuickActions = quickActions.filter(
    (action) =>
      action.visible && (!showLeanOperationalDashboard || action.essential),
  );

  // --- Chart Data Computations ---
  const ordensStatusChartData = {
    labels: (ordensKpis?.byStatus || []).map((s: any) => s.status),
    datasets: [
      {
        label: "Ordens por Estado",
        data: (ordensKpis?.byStatus || []).map((s: any) => s.total),
        backgroundColor: "#6366f1",
        borderRadius: 4,
      },
    ],
  };

  const ordensTecnicoChartData = {
    labels: (ordensKpis?.byTecnico || []).map(
      (t: any) => t.tecnico || "Sem Técnico",
    ),
    datasets: [
      {
        label: "Ordens por Técnico",
        data: (ordensKpis?.byTecnico || []).map((t: any) => t.total),
        backgroundColor: "#06b6d4",
        borderRadius: 4,
      },
    ],
  };

  const naviosChartData = { labels: [], datasets: [] }; // Removed dependency on undefined data

  const oficinaMensalChartData = {
    labels: (stats?.inspecoesPorMes || []).map((m) => m.label),
    datasets: [
      {
        label: "Inspeções por Mês",
        data: (stats?.inspecoesPorMes || []).map((m) => m.total),
        backgroundColor: "#6366f1",
        borderRadius: 6,
      },
    ],
  };
  const inspecoesUltimos12m = (stats?.inspecoesPorMes || []).reduce(
    (acc, m) => acc + (Number(m.total) || 0),
    0,
  );
  const melhorMesProducao = (stats?.inspecoesPorMes || []).reduce<{ label: string; total: number } | null>(
    (best, m) => (best === null || m.total > best.total ? m : best),
    null,
  );

  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-800 selection:bg-blue-500/20">
      {/* Hero Section Premium Light */}
      <div className="relative pt-10 pb-20 px-4 sm:px-6 lg:px-8 border-b border-slate-200/60 overflow-hidden bg-white">
        {/* Background Gradients Light */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-5xl h-full pointer-events-none opacity-40">
          <div className="absolute top-[-20%] left-[-10%] w-[40%] h-[60%] bg-blue-400/30 rounded-full blur-[100px]" />
          <div className="absolute top-[10%] right-[-10%] w-[30%] h-[50%] bg-cyan-300/30 rounded-full blur-[90px]" />
        </div>

        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="mb-4 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] text-blue-600">
              <OfflineStatusIndicator />
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                {session?.user?.role === "ADMIN"
                  ? "Administração Global"
                  : "Operação"}
              </span>
              <span
                className={`px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200 normal-case tracking-normal ${auditoriaBadge.className}`}
              >
                {auditoriaBadge.label}
              </span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tight mb-4 text-slate-900">
              Centro de Comando
            </h1>
            <p className="text-slate-500 max-w-2xl font-medium text-lg leading-relaxed">
              Monitorização em tempo real da frota, inspeções ativas e gestão
              logística avançada.
            </p>
          </motion.div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 relative z-20">
        {/* Modern Segmented Control for Tabs Light */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="flex space-x-1 bg-white/80 backdrop-blur-xl p-1.5 rounded-2xl w-fit shadow-lg shadow-slate-200/50 mb-10 border border-slate-200"
        >
          {["overview", "operations", "logistics"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`relative px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${
                activeTab === tab
                  ? "text-white"
                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-100/50"
              }`}
            >
              {activeTab === tab && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 bg-blue-600 rounded-xl shadow-md shadow-blue-600/20"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <span className="relative z-10">
                {tab === "overview" && "Visão Geral"}
                {tab === "operations" && "Operacional & OTs"}
                {tab === "logistics" && "Logística & Frota"}
              </span>
            </button>
          ))}
        </motion.div>

        {/* --- TAB: OVERVIEW --- */}
        {activeTab === "overview" && (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              hidden: { opacity: 0 },
              visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
            }}
            className="space-y-10"
          >
            {/* Premium KPI Cards Light */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5">
              {[
                {
                  label: "Jangadas Registadas",
                  value: stats?.jangadas ?? "-",
                  icon: Anchor,
                  color: "from-blue-500 to-cyan-500",
                  glow: "group-hover:shadow-blue-500/20",
                  href: "/jangadas",
                },
                {
                  label: "Coletes Registados",
                  value: (stats as any)?.coletes ?? "-",
                  icon: LifeBuoy,
                  color: "from-orange-500 to-amber-500",
                  glow: "group-hover:shadow-orange-500/20",
                  href: "/equipamentos",
                },
                {
                  label: "Navios Ativos",
                  value: stats?.navios ?? "-",
                  icon: Ship,
                  color: "from-emerald-500 to-teal-500",
                  glow: "group-hover:shadow-emerald-500/20",
                  href: "/navios",
                },
                {
                  label: "Clientes",
                  value: stats?.clientes ?? "-",
                  icon: Users,
                  color: "from-purple-500 to-pink-500",
                  glow: "group-hover:shadow-purple-500/20",
                  href: "/clientes",
                },
                {
                  label: "Inspeções Realizadas",
                  value: stats?.inspecoes ?? "-",
                  icon: ShieldAlert,
                  color: "from-rose-500 to-red-500",
                  glow: "group-hover:shadow-rose-500/20",
                  href: "/jangadas",
                },
              ].map((s, idx) => (
                <motion.div key={idx} variants={itemVariants}>
                  <Link href={s.href || "#"} className="block group h-full">
                    <div
                      className={`bg-white rounded-3xl p-6 transition-all duration-500 hover:-translate-y-2 border border-slate-200/80 relative overflow-hidden h-full shadow-sm hover:shadow-xl ${s.glow}`}
                    >
                      {/* Gradient Line Top */}
                      <div
                        className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${s.color} opacity-80 group-hover:opacity-100 transition-opacity`}
                      />

                      <div className="absolute -bottom-6 -right-6 p-4 opacity-5 group-hover:opacity-[0.08] transition-all duration-500 group-hover:scale-125 group-hover:-rotate-12">
                        <s.icon size={120} className="text-slate-900" />
                      </div>

                      <div
                        className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-6 bg-gradient-to-br ${s.color} shadow-md shadow-slate-200`}
                      >
                        <s.icon
                          size={24}
                          strokeWidth={2.5}
                          className="text-white"
                        />
                      </div>
                      <h3 className="text-4xl font-black tracking-tight text-slate-800 mb-1">
                        {s.value}
                      </h3>
                      <p className="text-sm font-semibold text-slate-500 group-hover:text-slate-700 transition-colors">
                        {s.label}
                      </p>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>

            {/* KPIs Executivos (Financeiros) — apenas ADMIN */}
            {userRole === "ADMIN" && (
              <motion.div variants={itemVariants}>
                <ExecutiveKpis />
              </motion.div>
            )}

            {/* Sincronização & Importação — apenas ADMIN */}
            {userRole === "ADMIN" && (
              <motion.div variants={itemVariants}>
                <QuickImportActions />
              </motion.div>
            )}

            {/* Stock Command Panel */}
            {canViewStock && (
              <motion.div variants={itemVariants} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-md">
                <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                      <Package className="h-5 w-5 text-amber-600" />
                      Comando de stock & reposição
                    </h3>
                    <p className="text-sm text-slate-500">
                      Alertas de compra, necessidades mensais (só validades), pedidos abertos e prateleiras.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href="/stock/reposicoes"
                      className="inline-flex items-center gap-1 rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-white hover:bg-amber-600"
                    >
                      Abrir reposições <ArrowRight size={14} />
                    </Link>
                    <Link
                      href="/stock/reposicoes?tab=pedidos"
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
                    >
                      Pedidos ({stockCommand.pedidosAbertos})
                    </Link>
                    <Link
                      href="/stock?tab=prateleiras"
                      className="inline-flex items-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-800 hover:bg-indigo-100"
                    >
                      Prateleiras
                    </Link>
                  </div>
                </div>

                <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                  {[
                    { label: "Em alerta compra", value: stockCommand.itemsInAlert, tone: "text-rose-700 bg-rose-50 border-rose-100" },
                    { label: "Custo estimado", value: new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(stockCommand.reorderCost || 0), tone: "text-amber-800 bg-amber-50 border-amber-100" },
                    { label: "Cobertura", value: `${stockCommand.coveragePercent}%`, tone: "text-emerald-800 bg-emerald-50 border-emerald-100" },
                    { label: "Défice 12m (un)", value: stockCommand.deficitUnits12m, tone: "text-indigo-800 bg-indigo-50 border-indigo-100" },
                    { label: "Pedidos abertos", value: stockCommand.pedidosAbertos, tone: "text-violet-800 bg-violet-50 border-violet-100" },
                    { label: "Sem prateleira", value: stockCommand.prateleirasSemLocal, tone: "text-slate-800 bg-slate-50 border-slate-200" },
                  ].map((kpi) => (
                    <div key={kpi.label} className={`rounded-2xl border px-3 py-3 ${kpi.tone}`}>
                      <p className="text-[10px] font-bold uppercase tracking-wide opacity-80">{kpi.label}</p>
                      <p className="mt-1 text-xl font-black tabular-nums">{kpi.value}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Prioridade de compra</h4>
                      <span className="text-[11px] text-slate-400">{stockCommand.rafts90d} jangadas · 90d</span>
                    </div>
                    {stockCommand.topBuy.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                        Sem alertas de reposição no momento.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {stockCommand.topBuy.map((item) => (
                          <li
                            key={`${item.referencia}-${item.nome}`}
                            className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{item.nome}</p>
                              <p className="truncate text-[11px] text-slate-500">
                                {item.referencia || "sem ref"}
                                {item.fornecedor ? ` · ${item.fornecedor}` : ""}
                                {item.orderLimitDate
                                  ? ` · limite ${new Date(item.orderLimitDate).toLocaleDateString("pt-PT")}`
                                  : ""}
                              </p>
                            </div>
                            <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-900">
                              +{item.reorderQty}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Necessidades mensais (validades)
                      </h4>
                      <Link href="/stock/reposicoes" className="text-[11px] font-semibold text-blue-600 hover:underline">
                        Ver calendário
                      </Link>
                    </div>
                    {stockCommand.monthly.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                        Sem necessidades mensais de artigos com validade.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {stockCommand.monthly.map((m) => {
                          const [y, mo] = m.month.split("-");
                          const label = new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("pt-PT", {
                            month: "short",
                            year: "2-digit",
                          });
                          return (
                            <Link
                              key={m.month}
                              href={`/stock/reposicoes?month=${encodeURIComponent(m.month)}`}
                              className="inline-flex min-w-[4.5rem] flex-col items-center rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 hover:bg-sky-100"
                            >
                              <span className="text-[11px] font-bold uppercase text-sky-800">{label}</span>
                              <span className="text-lg font-black text-sky-950">{m.quantidade}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                    <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      Planeamento negativo 12m:{" "}
                      <strong className={planeamentoNegativo12m > 0 ? "text-rose-700" : "text-emerald-700"}>
                        {planeamentoNegativo12m}
                      </strong>{" "}
                      artigo(s) · jangadas sem navio:{" "}
                      <strong>{stats?.jangadasSemNavioAssociado ?? 0}</strong>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* New Widgets: Expirations, Stock, Equipment Alerts, Lead-time Efficiency */}
            <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Expirations Panel */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-md relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-amber-50 rounded-full blur-2xl pointer-events-none" />
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-amber-500" />
                  <span>Janela de Expirações (Certificados)</span>
                </h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1">
                      <span>Próximos 30 dias (Urgente)</span>
                      <span className="text-rose-600 font-bold">{stats?.certificadosAte30d ?? 0}</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div 
                        className="bg-rose-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, ((stats?.certificadosAte30d ?? 0) / (stats?.jangadas || 1)) * 100)}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1">
                      <span>Próximos 60 dias</span>
                      <span className="text-amber-600 font-bold">{stats?.certificadosAte60d ?? 0}</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div 
                        className="bg-amber-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, ((stats?.certificadosAte60d ?? 0) / (stats?.jangadas || 1)) * 100)}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1">
                      <span>Próximos 90 dias</span>
                      <span className="text-blue-600 font-bold">{stats?.certificadosAte90d ?? 0}</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div 
                        className="bg-blue-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, ((stats?.certificadosAte90d ?? 0) / (stats?.jangadas || 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Stock Status Panel */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-md relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-rose-50 rounded-full blur-2xl pointer-events-none" />
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Package className="w-5 h-5 text-rose-500" />
                  <span>Stock de Consumíveis</span>
                </h3>
                <div className="grid grid-cols-2 gap-4 h-[120px]">
                  <div className="bg-rose-50 rounded-2xl p-4 border border-rose-100 flex flex-col justify-between">
                    <div>
                      <AlertTriangle className="w-6 h-6 text-rose-600 mb-2" />
                      <span className="text-xs font-semibold text-rose-700">Artigos em Rutura</span>
                    </div>
                    <div className="text-3xl font-black text-rose-900 mt-2">
                      {stats?.artigosEmRutura ?? 0}
                    </div>
                  </div>
                  <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100 flex flex-col justify-between">
                    <div>
                      <TrendingUp className="w-6 h-6 text-amber-600 mb-2" />
                      <span className="text-xs font-semibold text-amber-700">Abaixo do Mínimo</span>
                    </div>
                    <div className="text-3xl font-black text-amber-900 mt-2">
                      {stats?.artigosAbaixoMinimo ?? 0}
                    </div>
                  </div>
                </div>
              </div>

              {/* Alertas Críticos de Equipamento Panel */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-md relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-rose-50 rounded-full blur-2xl pointer-events-none" />
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-rose-500" />
                  <span>Alertas de Equipamento</span>
                </h3>
                <div className="space-y-2">
                  <div
                    onClick={() => setAlertModal({
                      isOpen: true,
                      title: "Inspeções Vencidas",
                      items: giVencidosList,
                      type: "gi"
                    })}
                    className="flex items-center justify-between text-xs font-semibold p-2 bg-rose-50/50 rounded-xl border border-rose-100/50 cursor-pointer hover:bg-rose-100/70 transition-colors"
                  >
                    <span className="text-rose-800">Inspeções Vencidas</span>
                    <span className={`px-2 py-0.5 rounded font-bold ${giThAlerts.giVencidos > 0 ? 'bg-rose-200 text-rose-900 animate-pulse' : 'bg-slate-100 text-slate-700'}`}>
                      {giThAlerts.giVencidos}
                    </span>
                  </div>
                  <div
                    onClick={() => setAlertModal({
                      isOpen: true,
                      title: "Cilindros (Teste Hidráulico) Vencidos",
                      items: thVencidosList,
                      type: "th"
                    })}
                    className="flex items-center justify-between text-xs font-semibold p-2 bg-rose-50/50 rounded-xl border border-rose-100/50 cursor-pointer hover:bg-rose-100/70 transition-colors"
                  >
                    <span className="text-rose-800">Cilindros TH Vencidos</span>
                    <span className={`px-2 py-0.5 rounded font-bold ${giThAlerts.thVencidos > 0 ? 'bg-rose-200 text-rose-900 animate-pulse' : 'bg-slate-100 text-slate-700'}`}>
                      {giThAlerts.thVencidos}
                    </span>
                  </div>
                  <div
                    onClick={() => setAlertModal({
                      isOpen: true,
                      title: "Válvulas de Disparo (HRU) Vencidas",
                      items: hruVencidosList,
                      type: "hru"
                    })}
                    className="flex items-center justify-between text-xs font-semibold p-2 bg-rose-50/50 rounded-xl border border-rose-100/50 cursor-pointer hover:bg-rose-100/70 transition-colors"
                  >
                    <span className="text-rose-800">HRUs Vencidas</span>
                    <span className={`px-2 py-0.5 rounded font-bold ${giThAlerts.hruVencidos > 0 ? 'bg-rose-200 text-rose-900 animate-pulse' : 'bg-slate-100 text-slate-700'}`}>
                      {giThAlerts.hruVencidos}
                    </span>
                  </div>
                </div>
              </div>

            </motion.div>

            {/* Critical Alerts Section Light */}
            <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-xl shadow-slate-200/50 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-rose-100 rounded-full blur-[80px] pointer-events-none" />

              <div className="flex items-center justify-between mb-8 relative z-10">
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center border border-rose-200">
                    <ShieldAlert className="text-rose-600" size={20} />
                  </span>
                  Alertas Críticos e Operacionais
                </h2>
                {topOtOperationalAlerts.length > 0 && (
                  <Link href="/alertas" className="px-3 py-1 rounded-full bg-rose-100 text-rose-700 text-xs font-bold border border-rose-200 flex items-center gap-2 hover:bg-rose-200 transition-colors cursor-pointer">
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                    {topOtOperationalAlerts.length} Ação(ões) Necessária(s)
                  </Link>
                )}
              </div>

              {topOtOperationalAlerts.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 relative z-10">
                  {topOtOperationalAlerts.map((alert) => (
                    <motion.div
                      whileHover={{ scale: 1.02 }}
                      key={alert.id}
                      className="p-6 rounded-2xl border border-rose-200 bg-white flex flex-col gap-3 relative shadow-md shadow-rose-100/50"
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-xs font-extrabold uppercase tracking-widest text-rose-700 bg-rose-50 px-3 py-1 rounded-md border border-rose-200">
                          {alert.severity === "critical" ? "Crítico" : "Aviso"}
                        </span>
                        <Link
                          href={alert.href}
                          className="text-blue-600 hover:text-blue-800 text-sm font-bold transition-colors flex items-center gap-1 group"
                        >
                          Resolver{" "}
                          <ChevronRight
                            size={16}
                            className="group-hover:translate-x-1 transition-transform"
                          />
                        </Link>
                      </div>
                      <h4 className="font-bold text-slate-800 mt-2 text-lg">
                        {alert.title}
                      </h4>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        {alert.description}
                      </p>
                      {alert.recommendation && (
                        <div className="mt-auto pt-4">
                          <p className="text-xs font-semibold text-rose-800 bg-rose-50 border border-rose-100 p-3 rounded-xl flex items-start gap-2">
                            <span className="text-base leading-none">💡</span>{" "}
                            {alert.recommendation}
                          </p>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16 bg-emerald-50 rounded-2xl border border-emerald-100 relative z-10">
                  <div className="w-20 h-20 mx-auto bg-emerald-100 rounded-full flex items-center justify-center mb-4 border border-emerald-200">
                    <ShieldAlert className="text-emerald-600" size={40} />
                  </div>
                  <p className="font-bold text-xl text-emerald-700 mb-2">
                    Operação Nominal
                  </p>
                  <p className="text-emerald-600/80 max-w-sm mx-auto font-medium">
                    Não existem alertas ativos. Todas as Ordens de Serviço e
                    níveis de stock estão dentro dos parâmetros.
                  </p>
                </div>
              )}
            </div>

            {/* Expiring Articles Alerts */}
            {expiringAlerts?.summary?.totalAlerts > 0 && (
              <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-xl shadow-slate-200/50 relative overflow-hidden mt-6">
                <div className="absolute top-0 right-0 w-64 h-64 bg-amber-50 rounded-full blur-[80px] pointer-events-none" />
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3 mb-6 relative z-10">
                  <span className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center border border-amber-200">
                    <AlertTriangle className="text-amber-600" size={20} />
                  </span>
                  Alertas de Validade de Artigos (Stock & Jangadas)
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 relative z-10">
                  <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4">
                    <span className="text-xs font-bold text-rose-700 block uppercase tracking-wider">Já Expirados</span>
                    <span className="text-2xl font-black text-rose-950 block mt-1">{expiringAlerts.summary.expiredCount}</span>
                  </div>
                  <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4">
                    <span className="text-xs font-bold text-orange-700 block uppercase tracking-wider">Expira até 30 dias</span>
                    <span className="text-2xl font-black text-orange-950 block mt-1">{expiringAlerts.summary.expiring30dCount}</span>
                  </div>
                  <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                    <span className="text-xs font-bold text-amber-700 block uppercase tracking-wider">Expira 30-60 dias</span>
                    <span className="text-2xl font-black text-amber-950 block mt-1">{expiringAlerts.summary.expiring60dCount}</span>
                  </div>
                  <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
                    <span className="text-xs font-bold text-blue-700 block uppercase tracking-wider">Expira 60-90 dias</span>
                    <span className="text-2xl font-black text-blue-950 block mt-1">{expiringAlerts.summary.expiring90dCount}</span>
                  </div>
                </div>

                <div className="overflow-x-auto relative z-10 border border-slate-200 rounded-2xl bg-white">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                      <tr>
                        <th className="px-4 py-3 text-left">Tipo</th>
                        <th className="px-4 py-3 text-left">Artigo / Descrição</th>
                        <th className="px-4 py-3 text-left">Ref. / Lote</th>
                        <th className="px-4 py-3 text-left">Validade</th>
                        <th className="px-4 py-3 text-left">Localização</th>
                        <th className="px-4 py-3 text-right">Qtd</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {[
                        ...expiringAlerts.expired,
                        ...expiringAlerts.expiring30d,
                        ...expiringAlerts.expiring60d
                      ].slice(0, 15).map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${item.type === 'stock' ? 'bg-indigo-50 text-indigo-700 border border-indigo-150' : 'bg-teal-50 text-teal-700 border border-teal-150'}`}>
                              {item.type === 'stock' ? 'Armazém' : 'Jangada'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-800">{item.descricao}</div>
                            {item.type === 'jangada' && (
                              <div className="text-xs text-slate-500">
                                Jangada: <span className="font-semibold">{item.serial}</span> ({item.owner})
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            <div>{item.referencia}</div>
                            {item.lote && <div className="text-xs text-slate-400">Lote: {item.lote}</div>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-750">{formatDateCompact(item.validade)}</div>
                            <div className={`text-xs ${item.daysRemaining < 0 ? 'text-rose-600 font-bold' : item.daysRemaining <= 30 ? 'text-orange-600 font-semibold' : 'text-slate-500'}`}>
                              {item.daysRemaining < 0 ? 'Expirado' : `Em ${item.daysRemaining} dias`}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-500">
                            {item.type === 'stock' ? 'Armazém Principal' : `Instalado em Jangada`}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-800">{item.quantidade}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <PremiumCharts stats={stats} />

            {/* Produção da Oficina */}
            <motion.div variants={itemVariants} className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-md">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <Wrench className="h-5 w-5 text-indigo-600" />
                    Produção da Oficina
                  </h3>
                  <p className="text-sm text-slate-500">
                    Ritmo de inspeções realizadas nos últimos 12 meses.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-xl bg-indigo-50 border border-indigo-100 px-3 py-2 text-xs font-bold text-indigo-800">
                    Últimos 12m: {inspecoesUltimos12m}
                  </span>
                  {melhorMesProducao && (
                    <span className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs font-bold text-emerald-800">
                      Melhor mês: {melhorMesProducao.label} ({melhorMesProducao.total})
                    </span>
                  )}
                </div>
              </div>
              <div className="h-[280px]">
                {stats?.inspecoesPorMes?.length ? (
                  <Bar
                    data={oficinaMensalChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                      scales: {
                        y: {
                          beginAtZero: true,
                          grid: { color: "#f1f5f9" },
                          ticks: { precision: 0, color: "#64748b" },
                        },
                        x: {
                          grid: { display: false },
                          ticks: { color: "#64748b" },
                        },
                      },
                    }}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50">
                    <p className="text-sm text-slate-500 font-semibold">Sem dados de produção mensal.</p>
                  </div>
                )}
              </div>
            </motion.div>

            <AcoesDeHojePanel />
          </motion.div>
        )}

        {/* --- TAB: OPERATIONS --- */}
        {activeTab === "operations" && (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              hidden: { opacity: 0 },
              visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
            }}
            className="space-y-8"
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Funil Ordens */}
              <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-xl shadow-slate-200/50 relative overflow-hidden">
                <div className="absolute -top-32 -right-32 w-64 h-64 bg-indigo-100 rounded-full blur-[80px] pointer-events-none" />
                <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-3 relative z-10">
                  <span className="p-2 rounded-lg bg-indigo-100 text-indigo-600 border border-indigo-200">
                    <Activity size={20} />
                  </span>
                  Distribuição de Ordens de Serviço
                </h3>
                <div className="h-[350px] relative z-10">
                  <Bar
                    data={ordensStatusChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                      scales: {
                        y: {
                          beginAtZero: true,
                          grid: { color: "#f1f5f9" },
                          ticks: { precision: 0, color: "#64748b" },
                        },
                        x: {
                          grid: { display: false },
                          ticks: { color: "#64748b" },
                        },
                      },
                    }}
                  />
                </div>
              </div>

              {/* Desempenho Tecnico */}
              <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-xl shadow-slate-200/50 relative overflow-hidden">
                <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-cyan-100 rounded-full blur-[80px] pointer-events-none" />
                <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-3 relative z-10">
                  <span className="p-2 rounded-lg bg-cyan-100 text-cyan-600 border border-cyan-200">
                    <Wrench size={20} />
                  </span>
                  Volume OTs por Técnico
                </h3>
                <div className="h-[350px] relative z-10">
                  <Bar
                    data={ordensTecnicoChartData}
                    options={{
                      indexAxis: "y",
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                      scales: {
                        x: {
                          beginAtZero: true,
                          grid: { color: "#f1f5f9" },
                          ticks: { precision: 0, color: "#64748b" },
                        },
                        y: {
                          grid: { display: false },
                          ticks: { color: "#64748b" },
                        },
                      },
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Pedidos de Assistência Pendentes Widget */}
            <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-xl shadow-slate-200/50 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-rose-50 rounded-full blur-[85px] pointer-events-none" />

              <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-3 relative z-10">
                <span className="p-2 rounded-lg bg-rose-50 text-rose-600 border border-rose-100">
                  <Wrench size={20} />
                </span>
                Novos Pedidos de Assistência
              </h3>

              {loading ? (
                <p className="text-sm text-slate-500 relative z-10 animate-pulse">A carregar pedidos de assistência...</p>
              ) : pendingAssistencia.length === 0 ? (
                <div className="text-center py-12 bg-slate-50/50 border border-dashed border-slate-200 rounded-2xl relative z-10">
                  <p className="text-sm text-slate-400 font-semibold">Sem novos pedidos de assistência pendentes.</p>
                </div>
              ) : (
                <div className="overflow-auto relative z-10">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 font-bold text-slate-600 uppercase tracking-wider">
                        <th className="px-4 py-3">Ordem nº</th>
                        <th className="px-4 py-3">Embarcação</th>
                        <th className="px-4 py-3">Jangada</th>
                        <th className="px-4 py-3">Data/Hora Pretendida</th>
                        <th className="px-4 py-3">Atribuir Técnico</th>
                        <th className="px-4 py-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pendingAssistencia.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3.5 font-bold text-slate-900 uppercase">
                            {item.referencia.split(" - ")[0]}
                          </td>
                          <td className="px-4 py-3.5 font-semibold text-slate-700">
                            {item.referencia.split(" - ")[1] || "—"}
                          </td>
                          <td className="px-4 py-3.5 text-slate-500 font-mono">
                            {item.jangadaSerial || "—"}
                          </td>
                          <td className="px-4 py-3.5 font-semibold text-rose-600">
                            {formatDateCompact(item.data)}
                          </td>
                          <td className="px-4 py-3.5">
                            <select
                              defaultValue=""
                              onChange={(e) => handleQuickAssign(item.id, Number(e.target.value))}
                              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer"
                            >
                              <option value="" disabled>Selecionar...</option>
                              {technicians.map((t) => (
                                <option key={t.id} value={t.id}>{t.nome}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleQuickAccept(item.id)}
                                className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/50 rounded-lg px-2.5 py-1 font-bold text-[11px] transition-colors cursor-pointer"
                              >
                                Aceitar
                              </button>
                              <Link
                                href={`/ordens-servico/${item.id}`}
                                className="bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1 font-bold text-[11px] transition-colors cursor-pointer"
                              >
                                Editar
                              </Link>
                              <button
                                onClick={() => handleQuickDelete(item.id)}
                                className="bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/50 rounded-lg px-2.5 py-1 font-bold text-[11px] transition-colors cursor-pointer"
                              >
                                Eliminar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <PressureTestTimer />
          </motion.div>
        )}

        {/* --- TAB: LOGISTICS --- */}
        {activeTab === "logistics" && (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              hidden: { opacity: 0 },
              visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
            }}
            className="space-y-8"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-2">
              <div className="bg-white p-8 rounded-3xl border border-rose-200 shadow-lg shadow-rose-100/50 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-5 transform translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform duration-500">
                  <ShieldAlert size={100} className="text-rose-500" />
                </div>
                <h4 className="text-sm font-bold text-rose-600 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500" /> Em
                  Rutura
                </h4>
                <div className="text-5xl font-black text-slate-800 mt-4 drop-shadow-sm">
                  {stats?.artigosEmRutura ?? 0}
                </div>
                <p className="text-sm text-slate-500 mt-2 font-medium">
                  Artigos críticos com stock zero.
                </p>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-amber-200 shadow-lg shadow-amber-100/50 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-5 transform translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform duration-500">
                  <Activity size={100} className="text-amber-500" />
                </div>
                <h4 className="text-sm font-bold text-amber-600 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500" /> Abaixo
                  Mínimo
                </h4>
                <div className="text-5xl font-black text-slate-800 mt-4 drop-shadow-sm">
                  {stats?.artigosAbaixoMinimo ?? 0}
                </div>
                <p className="text-sm text-slate-500 mt-2 font-medium">
                  Requerem reposição urgente.
                </p>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-indigo-200 shadow-lg shadow-indigo-100/50 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-5 transform translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform duration-500">
                  <BarChart3 size={100} className="text-indigo-500" />
                </div>
                <h4 className="text-sm font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />{" "}
                  Projeção 12M
                </h4>
                <div className="text-5xl font-black text-slate-800 mt-4 drop-shadow-sm">
                  {stockCommand.deficitUnits12m}
                </div>
                <p className="text-sm text-slate-500 mt-2 font-medium">
                  Unidades em défice projetado.
                </p>
                <Link href="/stock/reposicoes" className="mt-3 inline-flex text-xs font-bold text-indigo-600 hover:underline">
                  Ver reposições →
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Link href="/stock/reposicoes?tab=pedidos" className="rounded-2xl border border-violet-200 bg-violet-50 p-5 hover:bg-violet-100/70">
                <p className="text-xs font-bold uppercase tracking-wide text-violet-700">Pedidos reposição</p>
                <p className="mt-2 text-3xl font-black text-violet-950">{stockCommand.pedidosAbertos}</p>
                <p className="mt-1 text-sm text-violet-800/80">Rascunho / encomendado / parcial</p>
              </Link>
              <Link href="/stock?tab=prateleiras" className="rounded-2xl border border-slate-200 bg-white p-5 hover:bg-slate-50">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Sem prateleira</p>
                <p className="mt-2 text-3xl font-black text-slate-900">{stockCommand.prateleirasSemLocal}</p>
                <p className="mt-1 text-sm text-slate-500">Artigos por localizar (P01–P20)</p>
              </Link>
              <Link href="/stock/reposicoes" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 hover:bg-amber-100/70">
                <p className="text-xs font-bold uppercase tracking-wide text-amber-800">Alertas de compra</p>
                <p className="mt-2 text-3xl font-black text-amber-950">{stockCommand.itemsInAlert}</p>
                <p className="mt-1 text-sm text-amber-900/80">
                  {new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(stockCommand.reorderCost || 0)} estimados
                </p>
              </Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Card 1: Navios Ativos por Ilha */}
              <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-xl shadow-slate-200/50">
                <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-3">
                  <span className="p-2 rounded-lg bg-slate-100 text-slate-600 border border-slate-200">
                    <Ship size={20} />
                  </span>
                  Navios Ativos por Ilha
                </h3>
                <div className="h-[350px]">
                  <Bar
                    data={naviosChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                      scales: {
                        y: {
                          beginAtZero: true,
                          grid: { color: "#f1f5f9" },
                          ticks: { precision: 0, color: "#64748b" },
                        },
                        x: {
                          grid: { display: false },
                          ticks: { color: "#64748b" },
                        },
                      },
                    }}
                  />
                </div>
              </div>

              {/* Card 2: Previsão de Necessidades de Stock */}
              <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-xl shadow-slate-200/50 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold text-slate-800 flex items-center gap-3">
                      <span className="p-2 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">
                        <Package size={20} />
                      </span>
                      Previsão de Necessidades (Stock)
                    </h3>
                    <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                      {[30, 60, 90].map((d) => (
                        <button
                          key={d}
                          onClick={() => setForecastDays(d)}
                          className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                            forecastDays === d ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          {d} dias
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {loadingForecast ? (
                    <div className="py-20 text-center text-slate-400 font-semibold animate-pulse text-sm">
                      A calcular previsões de consumo...
                    </div>
                  ) : !forecastData?.previsao || forecastData.previsao.length === 0 ? (
                    <div className="py-20 text-center text-slate-500 text-sm">
                      Nenhuma jangada com vistoria agendada no período selecionado.
                    </div>
                  ) : (
                    <div className="overflow-y-auto max-h-[300px] space-y-2 pr-1 scrollbar-thin">
                      {forecastData.previsao.map((p: any) => (
                        <div key={p.key} className="p-3 rounded-2xl border border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs hover:bg-slate-50 transition-colors">
                          <div className="space-y-0.5">
                            <p className="font-bold text-slate-800">{p.name}</p>
                            <p className="text-[10px] text-slate-400">Ref: {p.referencia || "Sem Ref"}</p>
                            <p className="text-[10px] text-indigo-600 font-medium">
                              Necessário em {p.raftsLinked.length} {p.raftsLinked.length === 1 ? "jangada" : "jangadas"}
                            </p>
                          </div>
                          <div className="flex items-center gap-4 text-right">
                            <div>
                              <p className="text-slate-400 font-medium">Previsão</p>
                              <p className="font-bold text-slate-700 text-sm">{p.quantidadeEstimada} un</p>
                            </div>
                            <div>
                              <p className="text-slate-400 font-medium">Stock</p>
                              <p className="font-bold text-slate-700 text-sm">{p.stockAtual} un</p>
                            </div>
                            <div className="w-16">
                              {p.quantidadeEmFalta > 0 ? (
                                <div>
                                  <p className="text-rose-500 font-bold text-xs">Falta</p>
                                  <span className="inline-block bg-rose-100 text-rose-800 font-black px-2 py-0.5 rounded-lg text-[10px]">
                                    -{p.quantidadeEmFalta}
                                  </span>
                                </div>
                              ) : (
                                <div>
                                  <p className="text-emerald-600 font-bold text-xs">OK</p>
                                  <span className="inline-block bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-lg text-[10px]">
                                    Suficiente
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {forecastData?.totalJangadasAnalisadas > 0 && (
                  <p className="text-[11px] text-slate-400 mt-4 italic">
                    *Análise baseada em {forecastData.totalJangadasAnalisadas} jangada(s) com vistoria agendada até{" "}
                    {new Date(new Date().setDate(new Date().getDate() + forecastDays)).toLocaleDateString("pt-PT")}.
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Footer info auditoria */}
        <div className="mt-16 mb-8 flex flex-col md:flex-row justify-between items-center text-xs font-semibold text-slate-400 uppercase tracking-widest border-t border-slate-200 pt-8">
          <p className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300" /> Última
            auditoria:{" "}
            <span className="text-slate-500">
              {auditoriaPlaneamento?.ultimaAuditoria || "Sem dados"}
            </span>
          </p>
          <p className="flex items-center gap-2 mt-2 md:mt-0">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" /> Próxima
            auditoria:{" "}
            <span className="text-blue-600">
              {auditoriaPlaneamento?.proximaAuditoria || "Não planeada"}
            </span>
          </p>
        </div>
      </div>

      {alertModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-500" />
                {alertModal.title}
              </h3>
              <button
                onClick={() => setAlertModal({ isOpen: false, title: "", items: [], type: "" })}
                className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-grow space-y-3">
              {alertModal.items.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">Nenhum equipamento vencido nesta categoria.</p>
              ) : (
                alertModal.items.map((j: any) => (
                  <div key={j.id} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div>
                      <p className="text-sm font-bold text-slate-800">Série: {j.serial}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{j.brand} • {j.model} • {j.capacity}P</p>
                      <p className="text-xs text-slate-400 mt-0.5">Embarcação: {j.shipNameManual || j.navio?.nome || "—"}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-xs font-semibold text-rose-600">Vencimento</p>
                        <p className="text-xs text-slate-700 font-bold mt-0.5">
                          {alertModal.type === "gi" && j.dataProxInspecao ? new Date(j.dataProxInspecao).toLocaleDateString("pt-PT") : ""}
                          {alertModal.type === "th" && j.cylinderDataProxTeste ? new Date(j.cylinderDataProxTeste).toLocaleDateString("pt-PT") : ""}
                          {alertModal.type === "hru" && j.hruValidade ? new Date(j.hruValidade).toLocaleDateString("pt-PT") : ""}
                        </p>
                      </div>
                      <Link
                        href={`/jangadas/${j.id}`}
                        className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors"
                      >
                        Ver Dossier
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
              <button
                onClick={() => setAlertModal({ isOpen: false, title: "", items: [], type: "" })}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
