"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Box,
  CircularProgress,
  Typography,
  Paper,
  Tabs,
  Tab,
  Button,
  TextField,
  Alert,
  Chip,
  Stack,
  Divider,
  IconButton,
  Tooltip,
} from "@mui/material";
import {
  User,
  Ship,
  FileText,
  ClipboardList,
  Receipt,
  Shield,
  Save,
  Phone,
  Mail,
  MapPin,
  Edit3,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Flame,
  LifeBuoy,
  Radio,
  Anchor,
  Wallet,
  ArrowUpRight,
  Activity,
  Sparkles,
} from "lucide-react";
import { APP_CONFIG } from "@/lib/app-config";
import { getNavioLocationLabel } from "@/lib/navios-page-helpers";

type TabKey = "inicio" | "dados" | "navios" | "ordens" | "faturas" | "equipamento";

type NavioEquipamento = {
  id: number;
  serial: string;
  marca?: string | null;
  modelo?: string | null;
  tamanho?: string | null;
  estado: string;
  dataFabrico?: string | null;
  dataInspecao?: string | null;
  dataProxInspecao?: string | null;
  observacoes?: string | null;
  capacidadeKg?: number | null;
  tipoAgente?: string | null;
  localizacao?: string | null;
  dataUltimaRecarga?: string | null;
  dataProxRecarga?: string | null;
  dataTesteHidraulico?: string | null;
  dataProxTesteHidraulico?: string | null;
  hexId?: string | null;
  tipo?: string | null;
  dataValidadeBateria?: string | null;
};

type PirotecnicoItem = {
  id: string;
  item: string;
  quantity: string;
  validade: string;
  notes: string;
};

type NavioData = {
  id: number;
  nome: string;
  matricula: string;
  ilha: string | null;
  tipoPesca: string;
  tipoNavio?: string | null;
  lotacao?: number | null;
  comprimentoMetros?: number | null;
  pirotecnicosBordoJson?: string | null;
  extintores: NavioEquipamento[];
  coletes: NavioEquipamento[];
  epirbs: NavioEquipamento[];
};

type ClienteData = {
  id: number;
  nome: string;
  nif?: string | null;
  email?: string | null;
  telefone?: string | null;
  telmovel?: string | null;
  morada?: string | null;
  moradaNumero?: string | null;
  codigoPostal?: string | null;
  localidade?: string | null;
  ilha?: string | null;
  modoPagamento?: string | null;
  tipoCliente?: string | null;
  navios: NavioData[];
};

type OrdemData = {
  id: number;
  numeroOrdem: string;
  tipo: string;
  status: string;
  orcamentoStatus?: string | null;
  prioridade: string;
  descricao?: string | null;
  tecnicoResponsavel?: string | null;
  dataAbertura: string;
  dataPlaneadaInicio?: string | null;
  dataConclusao?: string | null;
  valorTotal: number;
  isPesca: boolean;
  jangada?: {
    serial?: string | null;
    brand?: string | null;
    model?: string | null;
    dataProxInspecao?: string | null;
    shipId?: number | null;
    shipNameManual?: string | null;
  } | null;
};

type FaturaData = {
  id: number;
  numeroFatura: string;
  valorSubtotal: number;
  valorIva: number;
  valorTotal: number;
  isIsentoIva: boolean;
  pagamentoStatus: string;
  dataEmissao: string;
  cancelada: boolean;
};

type PortalData = {
  cliente: ClienteData;
  ordens: OrdemData[];
  faturas: FaturaData[];
};

type ValidadeAlertaItem = {
  navio: string;
  tipo: string;
  titulo: string;
  data: string | null | undefined;
  label: string;
  icon: React.ReactNode;
  color: string;
};

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("pt-PT"); } catch { return d; }
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v || 0);
}

function formatCurrencyCompact(v: number) {
  if (!v) return formatCurrency(0);
  if (Math.abs(v) >= 1000) {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
  }
  return formatCurrency(v);
}

function statusColor(status: string) {
  switch (status?.toLowerCase()) {
    case "concluida": case "concluido": return "success";
    case "pendente": case "aberta": return "warning";
    case "em_andamento": case "em andamento": return "info";
    case "cancelada": return "error";
    case "agendada": return "info";
    default: return "default";
  }
}

function orcamentoStatusColor(s: string | null | undefined) {
  switch (s) {
    case "Aprovado": return "success";
    case "Emitido": return "warning";
    case "Rejeitado": return "error";
    default: return "default";
  }
}

function validityStatus(dateStr: string | null | undefined): "ok" | "warning" | "expired" | "none" {
  if (!dateStr) return "none";
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = d.getTime() - now.getTime();
    const days = diff / (1000 * 60 * 60 * 24);
    if (days < 0) return "expired";
    if (days <= 120) return "warning";
    return "ok";
  } catch { return "none"; }
}

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return null;
    return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  } catch { return null; }
}

function ValidityChip({ label, date }: { label: string; date?: string | null }) {
  const s = validityStatus(date);
  const color = s === "ok" ? "success" : s === "warning" ? "warning" : s === "expired" ? "error" : "default";
  return (
    <Chip size="small" label={`${label}: ${formatDate(date || "")}`} color={color} variant="outlined" sx={{ fontSize: "0.7rem" }} />
  );
}

function StatusPill({ status }: { status: string }) {
  const color = statusColor(status) as any;
  return (
    <Chip
      label={status}
      size="small"
      color={color}
      sx={{ height: 22, fontSize: "0.7rem", fontWeight: 700, "& .MuiChip-label": { px: 1 } }}
    />
  );
}

function ordemJangadaNavio(j: OrdemData["jangada"], navios: NavioData[]): string | null {
  if (!j) return null;
  const found = navios.find((n) => n.id === (j.shipId ?? -1));
  return found?.nome || j.shipNameManual || null;
}

type JangadaValidadeInfo = {
  status: "ok" | "warning" | "expired" | "none";
  label: string;
};

function jangadaValidadeInfo(date: string | null | undefined): JangadaValidadeInfo | null {
  if (!date) return null;
  const dias = daysUntil(date);
  if (dias === null) return null;
  if (validityStatus(date) === "expired") {
    return { status: "expired", label: `GI caducada há ${Math.abs(dias)} ${Math.abs(dias) === 1 ? "dia" : "dias"}` };
  }
  if (validityStatus(date) === "warning") {
    return { status: "warning", label: `GI caduca em ${dias} ${dias === 1 ? "dia" : "dias"}` };
  }
  return { status: "ok", label: `GI válida até ${formatDate(date)}` };
}

function JangadaSerialBadge({ jangada, navios }: { jangada: NonNullable<OrdemData["jangada"]>; navios: NavioData[] }) {
  const navio = ordemJangadaNavio(jangada, navios);
  const validade = jangadaValidadeInfo(jangada.dataProxInspecao);
  const chipColor =
    validade?.status === "expired" ? "error" : validade?.status === "warning" ? "warning" : "default";

  const chip = (
    <Chip
      size="small"
      icon={<Shield size={12} />}
      label={jangada.serial || "S/N —"}
      variant="outlined"
      color={chipColor as any}
      sx={{ height: 22, fontSize: "0.7rem", fontWeight: 700, "& .MuiChip-label": { px: 1 }, "& .MuiChip-icon": { ml: "6px" } }}
    />
  );

  const content = (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
      {navio && (
        <Typography variant="caption" sx={{ fontWeight: 700, fontSize: "0.72rem", color: "text.primary" }}>
          <Ship size={11} className="inline mr-0.5 text-blue-600" />
          {navio}
        </Typography>
      )}
      {chip}
      {validade && (
        <Typography
          variant="caption"
          sx={{
            fontSize: "0.68rem",
            fontWeight: 600,
            color:
              validade.status === "expired" ? "#dc2626" :
              validade.status === "warning" ? "#d97706" :
              "#16a34a",
          }}
        >
          {validade.label}
        </Typography>
      )}
    </Box>
  );

  if (!navio && !validade) return chip;

  return (
    <Tooltip
      title={
        <Box sx={{ fontSize: "0.75rem", lineHeight: 1.8 }}>
          <Box><strong>Jangada:</strong> {jangada.brand || ""} {jangada.model || ""}</Box>
          <Box><strong>S/N:</strong> {jangada.serial || "—"}</Box>
          <Box><strong>Navio:</strong> {navio || "—"}</Box>
          <Box><strong>Próx. GI:</strong> {formatDate(jangada.dataProxInspecao)}</Box>
          {validade && (
            <Box sx={{ color: validade.status === "expired" ? "#fca5a5" : validade.status === "warning" ? "#fcd34d" : "#86efac" }}>
              {validade.label}
            </Box>
          )}
        </Box>
      }
      arrow
      componentsProps={{ tooltip: { sx: { bgcolor: "grey.900", "& .MuiTooltip-arrow": { color: "grey.900" } } } }}
    >
      {content}
    </Tooltip>
  );
}

type KpiCardProps = {
  icon: React.ReactNode;
  title: string;
  value: string | number;
  sub?: string;
  accent: string;
  link?: () => void;
  iconBg?: string;
};

function KpiCard({ icon, title, value, sub, accent, link, iconBg }: KpiCardProps) {
  const card = (
    <Paper
      variant="outlined"
      onClick={link}
      sx={{
        p: 2.5,
        height: "100%",
        borderRadius: 3,
        cursor: link ? "pointer" : "default",
        transition: "all 0.2s",
        position: "relative",
        overflow: "hidden",
        "&:hover": link ? { transform: "translateY(-2px)", boxShadow: 4 } : {},
        "&::after": {
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          bgcolor: accent,
        },
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: 2,
            display: "grid",
            placeItems: "center",
            bgcolor: iconBg || `${accent}18`,
            color: accent,
          }}
        >
          {icon}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {title}
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
            {value}
          </Typography>
          {sub && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              {sub}
            </Typography>
          )}
        </Box>
        {link && <ChevronRight size={18} className="text-slate-300" />}
      </Stack>
    </Paper>
  );
  return card;
}

export default function PortalClientePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("inicio");
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingContact, setEditingContact] = useState(false);
  const [contactForm, setContactForm] = useState<Record<string, string>>({});
  const [savingContact, setSavingContact] = useState(false);
  const [contactMsg, setContactMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [actionBusy, setActionBusy] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/portal/cliente-dados");
      if (!res.ok) throw new Error("Erro ao carregar dados");
      const json = await res.json();
      setData(json);
      setContactForm({
        email: json.cliente.email || "",
        telefone: json.cliente.telefone || "",
        telmovel: json.cliente.telmovel || "",
        morada: json.cliente.morada || "",
        moradaNumero: json.cliente.moradaNumero || "",
        codigoPostal: json.cliente.codigoPostal || "",
        localidade: json.cliente.localidade || "",
      });
    } catch (e: any) { setError(e.message || "Erro ao carregar dados."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
    if (status === "authenticated" && session?.user?.role !== "CLIENTE") router.replace("/");
    if (status === "authenticated" && session?.user?.role === "CLIENTE") fetchData();
  }, [status, session, router, fetchData]);

  const saveContact = async () => {
    setSavingContact(true);
    setContactMsg(null);
    try {
      const res = await fetch("/api/portal/update-contacto", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contactForm),
      });
      const json = await res.json();
      if (!res.ok) { setContactMsg({ type: "error", text: json.error || "Erro ao guardar." }); return; }
      setContactMsg({ type: "success", text: "Contacto atualizado com sucesso." });
      setEditingContact(false);
      fetchData();
    } catch { setContactMsg({ type: "error", text: "Erro de rede." }); }
    finally { setSavingContact(false); }
  };

  const handleOrcamento = async (ordemId: number, acao: "aprovar" | "rejeitar") => {
    setActionBusy(ordemId);
    try {
      const res = await fetch("/api/portal/orcamento-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordemId, acao }),
      });
      if (!res.ok) { alert("Erro ao processar orçamento."); return; }
      fetchData();
    } catch { alert("Erro de rede."); }
    finally { setActionBusy(null); }
  };

  const metrics = useMemo(() => {
    if (!data) return null;
    const { cliente, ordens, faturas } = data;

    const totalNavios = cliente.navios.length;
    const ordensAtivas = ordens.filter((o) => !/concluid|concluid/i.test(o.status)).length;
    const faturasEmAberto = faturas.filter((f) => f.pagamentoStatus === "Pendente" || f.pagamentoStatus === "Em dívida").length;
    const totalEmDivida = faturas
      .filter((f) => f.pagamentoStatus === "Pendente" || f.pagamentoStatus === "Em dívida")
      .reduce((acc, f) => acc + f.valorTotal, 0);

    let equipamentosTotais = 0;
    let equipamentosAtencao = 0;
    let equipamentosExpirados = 0;
    let pirotecnicosExpirados = 0;
    let pirotecnicosFragil = 0;

    for (const navio of cliente.navios) {
      equipamentosTotais += navio.extintores.length + navio.coletes.length + navio.epirbs.length;
      for (const e of navio.extintores) {
        for (const d of [e.dataProxRecarga, e.dataProxTesteHidraulico]) {
          const s = validityStatus(d);
          if (s === "expired") equipamentosExpirados++;
          else if (s === "warning") equipamentosAtencao++;
        }
      }
      for (const c of navio.coletes) {
        const s = validityStatus(c.dataProxInspecao);
        if (s === "expired") equipamentosExpirados++;
        else if (s === "warning") equipamentosAtencao++;
      }
      for (const ep of navio.epirbs) {
        for (const d of [ep.dataProxInspecao, ep.dataValidadeBateria]) {
          const s = validityStatus(d);
          if (s === "expired") equipamentosExpirados++;
          else if (s === "warning") equipamentosAtencao++;
        }
      }
      if (navio.pirotecnicosBordoJson) {
        try {
          const parsed = JSON.parse(navio.pirotecnicosBordoJson);
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              const s = validityStatus(item?.validade);
              if (s === "expired") pirotecnicosExpirados++;
              else if (s === "warning") pirotecnicosFragil++;
            }
          }
        } catch {}
      }
    }

    return {
      totalNavios,
      ordensAtivas,
      faturasEmAberto,
      totalEmDivida,
      equipamentosTotais,
      equipamentosAtencao,
      equipamentosExpirados,
      pirotecnicosExpirados,
      pirotecnicosFragil,
    };
  }, [data]);

  const alertas = useMemo<ValidadeAlertaItem[]>(() => {
    if (!data) return [];
    const items: ValidadeAlertaItem[] = [];
    for (const navio of data.cliente.navios) {
      for (const e of navio.extintores) {
        const diasRec = daysUntil(e.dataProxRecarga);
        const diasTest = daysUntil(e.dataProxTesteHidraulico);
        if (diasRec !== null && diasRec <= 90) items.push({ navio: navio.nome, tipo: "Extintor", titulo: `Extintor ${e.marca || ""} ${e.modelo || ""}`, data: e.dataProxRecarga, label: "Próx. recarga", icon: <Flame size={15} />, color: diasRec < 0 ? "#dc2626" : "#d97706" });
        if (diasTest !== null && diasTest <= 90) items.push({ navio: navio.nome, tipo: "Extintor", titulo: `Extintor ${e.marca || ""} ${e.modelo || ""}`, data: e.dataProxTesteHidraulico, label: "Próx. teste hidráulico", icon: <Flame size={15} />, color: diasTest < 0 ? "#dc2626" : "#d97706" });
      }
      for (const c of navio.coletes) {
        const dias = daysUntil(c.dataProxInspecao);
        if (dias !== null && dias <= 90) items.push({ navio: navio.nome, tipo: "Coletes", titulo: `Colete ${c.marca || ""} ${c.modelo || ""}`, data: c.dataProxInspecao, label: "Próx. inspeção", icon: <LifeBuoy size={15} />, color: dias < 0 ? "#dc2626" : "#d97706" });
      }
      for (const ep of navio.epirbs) {
        const diasIns = daysUntil(ep.dataProxInspecao);
        const diasBat = daysUntil(ep.dataValidadeBateria);
        if (diasIns !== null && diasIns <= 90) items.push({ navio: navio.nome, tipo: "EPIRB", titulo: `EPIRB ${ep.marca || ""} ${ep.modelo || ""}`, data: ep.dataProxInspecao, label: "Próx. inspeção", icon: <Radio size={15} />, color: diasIns < 0 ? "#dc2626" : "#d97706" });
        if (diasBat !== null && diasBat <= 90) items.push({ navio: navio.nome, tipo: "EPIRB", titulo: `EPIRB ${ep.marca || ""} ${ep.modelo || ""}`, data: ep.dataValidadeBateria, label: "Bateria", icon: <Radio size={15} />, color: diasBat < 0 ? "#dc2626" : "#d97706" });
      }
      if (navio.pirotecnicosBordoJson) {
        try {
          const parsed = JSON.parse(navio.pirotecnicosBordoJson);
          if (Array.isArray(parsed)) {
            for (const p of parsed) {
              const dias = daysUntil(p?.validade);
              if (dias !== null && dias <= 90) items.push({ navio: navio.nome, tipo: "Pirotécnicos", titulo: `${p?.item || "Artigo"} (${p?.quantity || "—"})`, data: p?.validade, label: "Validade", icon: <AlertTriangle size={15} />, color: dias < 0 ? "#dc2626" : "#d97706" });
            }
          }
        } catch {}
      }
    }
    return items.sort((a, b) => {
      const da = daysUntil(a.data) ?? 0;
      const db = daysUntil(b.data) ?? 0;
      return da - db;
    }).slice(0, 8);
  }, [data]);

  if (status === "loading" || loading) {
    return (
      <Box sx={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 4, maxWidth: 800, mx: "auto" }}>
        <Alert severity="error" sx={{ borderRadius: 3 }}>{error}</Alert>
      </Box>
    );
  }

  if (!data) return null;

  const { cliente, ordens, faturas } = data;
  const p = metrics!;
  const isDeluxe = APP_CONFIG.theme === "deluxe";

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto", p: { xs: 1.5, md: 4 } }}>
      {/* HERO HEADER */}
      <Paper
        sx={{
          borderRadius: { xs: 3, md: 4 },
          overflow: "hidden",
          mb: 3,
          background: isDeluxe
            ? "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)"
            : "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 45%, #2563eb 75%, #0ea5e9 100%)",
          color: "white",
          position: "relative",
        }}
      >
        <Box sx={{ position: "absolute", top: -40, right: -20, opacity: 0.15 }}>
          <Anchor size={220} />
        </Box>
        <Box sx={{ px: { xs: 3, md: 4 }, py: { xs: 3, md: 4 } }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={3} alignItems={{ xs: "flex-start", md: "center" }} justifyContent="space-between">
            <Box>
              <Typography variant="overline" sx={{ color: "rgba(255,255,255,0.75)", fontWeight: 800, letterSpacing: 1.5 }}>
                {APP_CONFIG.name} · Área do Cliente
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 800, color: "white", mt: 0.5 }}>
                Bem-vindo, {cliente.nome.split(" ")[0] || "Cliente"} 👋
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1, flexWrap: "wrap", gap: 0.5 }}>
                <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.85)" }}>
                  {cliente.nif && `NIF ${cliente.nif}`}
                  {cliente.modoPagamento ? ` · Pagamento: ${cliente.modoPagamento}` : ""}
                </Typography>
              </Stack>
            </Box>
            <Chip
              size="small"
              label={`${p.ordensAtivas} ordem(ns) ativa(s)`}
              sx={{ bgcolor: "rgba(255,255,255,0.15)", color: "white", fontWeight: 700, backdropFilter: "blur(6px)" }}
            />
          </Stack>
        </Box>
      </Paper>

      {/* KPI CARDS */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 2, mb: 3 }}>
        <KpiCard
          icon={<Ship size={20} />}
          title="Navios"
          value={p.totalNavios}
          sub={p.totalNavios === 0 ? "Sem navios" : `${p.totalNavios === 1 ? "1 embarcação" : `${p.totalNavios} embarcações`} registadas`}
          accent="#2563eb"
          iconBg="#dbeafe"
          link={() => setTab("navios")}
        />
        <KpiCard
          icon={<Activity size={20} />}
          title="Ordens ativas"
          value={p.ordensAtivas}
          sub={`${ordens.length} no total`}
          accent="#7c3aed"
          iconBg="#ede9fe"
          link={() => setTab("ordens")}
        />
        <KpiCard
          icon={<Wallet size={20} />}
          title="Faturas em aberto"
          value={p.faturasEmAberto}
          sub={`${formatCurrencyCompact(p.totalEmDivida)} em dívida`}
          accent="#d97706"
          iconBg="#fef3c7"
          link={() => setTab("faturas")}
        />
        <KpiCard
          icon={<Shield size={20} />}
          title="Antevisão de validades"
          value={p.equipamentosAtencao + p.equipamentosExpirados + p.pirotecnicosExpirados}
          sub={
            p.equipamentosExpirados + p.pirotecnicosExpirados > 0
              ? `${p.equipamentosExpirados + p.pirotecnicosExpirados} vencido(s)`
              : `sem vencimentos`
          }
          accent={p.equipamentosExpirados + p.pirotecnicosExpirados > 0 ? "#dc2626" : "#16a34a"}
          iconBg={p.equipamentosExpirados + p.pirotecnicosExpirados > 0 ? "#fee2e2" : "#dcfce7"}
          link={() => (alertas.length > 0 ? setTab("equipamento") : undefined)}
        />
      </Box>

      {/* ALERTAS SECTION */}
      {alertas.length > 0 && (
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 3, mb: 3, borderColor: "#fecdca" }}>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
            <Box sx={{ width: 36, height: 36, borderRadius: 2, display: "grid", placeItems: "center", bgcolor: "#fef2f2", color: "#dc2626" }}>
              <AlertTriangle size={18} />
            </Box>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Validades a ter em atenção</Typography>
              <Typography variant="caption" color="text.secondary">
                Equipamentos com validade a expirar (90 dias) ou já vencidos
              </Typography>
            </Box>
          </Stack>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1.5 }}>
            {alertas.map((a, i) => {
              const dias = daysUntil(a.data);
              const expired = dias !== null && dias < 0;
              return (
                <Paper
                  key={i}
                  variant="outlined"
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: expired ? "#fef2f2" : "#fffbeb",
                    borderColor: expired ? "#fecaca" : "#fde68a",
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                  }}
                >
                  <Box sx={{ color: a.color, flexShrink: 0 }}>{a.icon}</Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, fontSize: "0.8rem" }}>{a.titulo}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.7rem" }}>
                      {a.navio} · {a.label}: <strong style={{ color: a.color }}>{formatDate(a.data)}</strong>
                      {dias !== null && (
                        <span style={{ color: expired ? "#dc2626" : "#d97706" }}>
                          {" "}({expired ? `${Math.abs(dias)} dias vencido` : `em ${dias} dias`})
                        </span>
                      )}
                    </Typography>
                  </Box>
                </Paper>
              );
            })}
          </Box>
        </Paper>
      )}

      {/* TABS */}
      <Paper sx={{ borderRadius: 3, overflow: "hidden" }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            borderBottom: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
            "& .MuiTab-root": { textTransform: "none", fontWeight: 700, minHeight: 52, fontSize: "0.85rem" },
          }}
        >
          <Tab icon={<Sparkles size={16} />} iconPosition="start" label="Início" value="inicio" />
          <Tab icon={<User size={16} />} iconPosition="start" label="Dados" value="dados" />
          <Tab icon={<Ship size={16} />} iconPosition="start" label={`Navios (${cliente.navios.length})`} value="navios" />
          <Tab icon={<ClipboardList size={16} />} iconPosition="start" label={`Ordens (${ordens.length})`} value="ordens" />
          <Tab icon={<Receipt size={16} />} iconPosition="start" label={`Faturas (${faturas.length})`} value="faturas" />
          <Tab icon={<Shield size={16} />} iconPosition="start" label="Equipamento" value="equipamento" />
        </Tabs>

        <Box sx={{ p: { xs: 2, md: 3 } }}>
          {contactMsg && tab === "dados" && <Alert severity={contactMsg.type} sx={{ mb: 2, borderRadius: 2 }}>{contactMsg.text}</Alert>}

          {/* TAB: INICIO */}
          {tab === "inicio" && (
            <Stack spacing={3}>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 3 }}>
                <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                      <ClipboardList size={16} className="inline mr-1.5 text-violet-600" />Ordens de Serviço
                    </Typography>
                    <Button size="small" onClick={() => setTab("ordens")} endIcon={<ArrowUpRight size={14} />} sx={{ textTransform: "none", fontWeight: 700 }}>
                      Ver todas
                    </Button>
                  </Stack>
                  {ordens.length === 0 ? (
                    <Alert severity="info" sx={{ borderRadius: 2 }}>Sem ordens de serviço.</Alert>
                  ) : (
                    <Stack spacing={1}>
                      {ordens.slice(0, 4).map((o) => (
                        <Box key={o.id} sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 0.75, borderBottom: "1px dashed #e2e8f0" }}>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Typography variant="body2" sx={{ fontWeight: 700, fontSize: "0.8rem" }}>{o.numeroOrdem}</Typography>
                              <StatusPill status={o.status} />
                            </Stack>
                            <Typography variant="caption" color="text.secondary">
                              {o.tipo} · {formatDate(o.dataAbertura)}
                            </Typography>
                            {o.jangada && (
                              <Box sx={{ mt: 0.5 }}>
                                <JangadaSerialBadge jangada={o.jangada} navios={cliente.navios} />
                              </Box>
                            )}
                          </Box>
                        </Box>
                      ))}
                    </Stack>
                  )}
                </Paper>

                <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                      <Receipt size={16} className="inline mr-1.5 text-amber-600" />Faturas recentes
                    </Typography>
                    <Button size="small" onClick={() => setTab("faturas")} endIcon={<ArrowUpRight size={14} />} sx={{ textTransform: "none", fontWeight: 700 }}>
                      Ver todas
                    </Button>
                  </Stack>
                  {faturas.length === 0 ? (
                    <Alert severity="info" sx={{ borderRadius: 2 }}>Sem faturas.</Alert>
                  ) : (
                    <Stack spacing={1}>
                      {faturas.slice(0, 4).map((f) => (
                        <Box key={f.id} sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 0.75, borderBottom: "1px dashed #e2e8f0" }}>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Typography variant="body2" sx={{ fontWeight: 700, fontSize: "0.8rem" }}>{f.numeroFatura}</Typography>
                              <Chip
                                label={f.pagamentoStatus}
                                size="small"
                                color={f.pagamentoStatus === "Pago" ? "success" : f.pagamentoStatus === "Pendente" ? "warning" : "default"}
                                sx={{ height: 20, fontSize: "0.68rem", fontWeight: 700 }}
                              />
                            </Stack>
                            <Typography variant="caption" color="text.secondary">{formatDate(f.dataEmissao)}</Typography>
                          </Box>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>{formatCurrency(f.valorTotal)}</Typography>
                        </Box>
                      ))}
                    </Stack>
                  )}
                </Paper>
              </Box>

              {/* NAVIOS RESUMO */}
              <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                    <Ship size={16} className="inline mr-1.5 text-blue-600" />As suas embarcações
                  </Typography>
                  <Button size="small" onClick={() => setTab("navios")} endIcon={<ArrowUpRight size={14} />} sx={{ textTransform: "none", fontWeight: 700 }}>
                    Detalhe
                  </Button>
                </Stack>
                {cliente.navios.length === 0 ? (
                  <Alert severity="info" sx={{ borderRadius: 2 }}>Não tem navios registados.</Alert>
                ) : (
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
                    {cliente.navios.map((n) => {
                      const totalEquip = n.extintores.length + n.coletes.length + n.epirbs.length;
                      const atencao =
                        n.extintores.filter((e) => validityStatus(e.dataProxRecarga) !== "ok" || validityStatus(e.dataProxTesteHidraulico) !== "ok").length +
                        n.coletes.filter((c) => validityStatus(c.dataProxInspecao) !== "ok").length +
                        n.epirbs.filter((ep) => validityStatus(ep.dataProxInspecao) !== "ok" || validityStatus(ep.dataValidadeBateria) !== "ok").length;
                      return (
                        <Paper key={n.id} variant="outlined" sx={{ p: 2, borderRadius: 2.5, cursor: "pointer", transition: "all 0.2s", "&:hover": { boxShadow: 3 } }} onClick={() => setTab("navios")}>
                          <Stack direction="row" spacing={1.5} alignItems="flex-start">
                            <Box sx={{ width: 42, height: 42, borderRadius: 2, display: "grid", placeItems: "center", bgcolor: "#dbeafe", color: "#2563eb", flexShrink: 0 }}>
                              <Ship size={20} />
                            </Box>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography variant="body1" sx={{ fontWeight: 800, fontSize: "0.95rem" }}>{n.nome}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {n.matricula} · {getNavioLocationLabel(n as any)}
                              </Typography>
                              <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: "wrap" }}>
                                <Chip size="small" label={`${totalEquip} equip.`} variant="outlined" sx={{ height: 20, fontSize: "0.65rem" }} />
                                <Chip size="small" label={`${n.tipoPesca}`} variant="outlined" sx={{ height: 20, fontSize: "0.65rem" }} />
                                {atencao > 0 ? (
                                  <Chip size="small" label={`${atencao} em atenção`} color="warning" sx={{ height: 20, fontSize: "0.65rem", fontWeight: 700 }} />
                                ) : (
                                  <Chip size="small" label="validades OK" color="success" variant="outlined" sx={{ height: 20, fontSize: "0.65rem" }} />
                                )}
                              </Stack>
                            </Box>
                          </Stack>
                        </Paper>
                      );
                    })}
                  </Box>
                )}
              </Paper>
            </Stack>
          )}

          {/* TAB: DADOS */}
          {tab === "dados" && (
            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>Dados Pessoais</Typography>
                <Button
                  size="small"
                  startIcon={editingContact ? <Save /> : <Edit3 />}
                  onClick={() => { if (editingContact) saveContact(); else setEditingContact(true); }}
                  disabled={savingContact}
                  variant={editingContact ? "contained" : "outlined"}
                >
                  {editingContact ? "Guardar" : "Editar"}
                </Button>
              </Stack>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
                {editingContact ? (
                  <>
                    <TextField label="Email" value={contactForm.email} onChange={e => setContactForm(p => ({ ...p, email: e.target.value }))} size="small" fullWidth />
                    <TextField label="Telemóvel" value={contactForm.telmovel} onChange={e => setContactForm(p => ({ ...p, telmovel: e.target.value }))} size="small" fullWidth />
                    <TextField label="Telefone" value={contactForm.telefone} onChange={e => setContactForm(p => ({ ...p, telefone: e.target.value }))} size="small" fullWidth />
                    <TextField label="Morada" value={contactForm.morada} onChange={e => setContactForm(p => ({ ...p, morada: e.target.value }))} size="small" fullWidth />
                    <TextField label="N.º" value={contactForm.moradaNumero} onChange={e => setContactForm(p => ({ ...p, moradaNumero: e.target.value }))} size="small" fullWidth />
                    <TextField label="Código Postal" value={contactForm.codigoPostal} onChange={e => setContactForm(p => ({ ...p, codigoPostal: e.target.value }))} size="small" fullWidth />
                    <TextField label="Localidade" value={contactForm.localidade} onChange={e => setContactForm(p => ({ ...p, localidade: e.target.value }))} size="small" fullWidth />
                  </>
                ) : (
                  <>
                    <InfoRow icon={<User size={14} />} label="Nome" value={cliente.nome} />
                    <InfoRow icon={<FileText size={14} />} label="NIF" value={cliente.nif || "—"} />
                    <InfoRow icon={<Mail size={14} />} label="Email" value={cliente.email || "—"} />
                    <InfoRow icon={<Phone size={14} />} label="Telemóvel" value={cliente.telmovel || "—"} />
                    <InfoRow icon={<Phone size={14} />} label="Telefone" value={cliente.telefone || "—"} />
                    <InfoRow icon={<MapPin size={14} />} label="Morada" value={[cliente.morada, cliente.moradaNumero, cliente.codigoPostal, cliente.localidade].filter(Boolean).join(", ") || "—"} />
                    {cliente.modoPagamento && <InfoRow icon={<Wallet size={14} />} label="Modo de pagamento" value={cliente.modoPagamento} />}
                  </>
                )}
              </Box>
            </Box>
          )}

          {/* TAB: NAVIOS */}
          {tab === "navios" && (
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800, mb: 2 }}>As suas embarcações</Typography>
              {cliente.navios.length === 0 ? (
                <Alert severity="info">Não tem navios registados.</Alert>
              ) : (
                <Stack spacing={2}>
                  {cliente.navios.map(n => (
                    <Paper key={n.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ flexWrap: "wrap", gap: 1 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                          <Box sx={{ width: 42, height: 42, borderRadius: 2, display: "grid", placeItems: "center", bgcolor: "#dbeafe", color: "#2563eb" }}>
                            <Ship size={20} />
                          </Box>
                          <Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>{n.nome}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              Matrícula: {n.matricula || "—"} · {getNavioLocationLabel(n as any)} · {n.tipoPesca} · Lotação: {n.lotacao || "—"}
                              {n.comprimentoMetros ? ` · ${n.comprimentoMetros} m` : ""}
                            </Typography>
                          </Box>
                        </Box>
                        <Chip label={`${n.extintores.length} ext. · ${n.coletes.length} coletes · ${n.epirbs.length} EPIRB`} size="small" variant="outlined" />
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Box>
          )}

          {/* TAB: ORDENS DE SERVICO */}
          {tab === "ordens" && (
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800, mb: 2 }}>Ordens de Serviço</Typography>
              {ordens.length === 0 ? (
                <Alert severity="info">Sem ordens de serviço registadas.</Alert>
              ) : (
                <Stack spacing={1.5}>
                  {ordens.map(o => (
                    <Paper key={o.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ flexWrap: "wrap", gap: 1 }}>
                        <Box sx={{ flex: 1, minWidth: 250 }}>
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{o.numeroOrdem}</Typography>
                            <StatusPill status={o.status} />
                            {o.orcamentoStatus && (
                              <Chip label={`Orçamento: ${o.orcamentoStatus}`} size="small" color={orcamentoStatusColor(o.orcamentoStatus) as any} variant="outlined" sx={{ height: 20, fontSize: "0.7rem" }} />
                            )}
                          </Stack>
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                            {o.tipo}
                            {" · "}Abertura: {formatDate(o.dataAbertura)}
                          </Typography>
                          {o.jangada && (
                            <Box sx={{ mb: 0.5 }}>
                              <JangadaSerialBadge jangada={o.jangada} navios={cliente.navios} />
                            </Box>
                          )}
                          {o.descricao && <Typography variant="body2" sx={{ mt: 0.5, fontSize: "0.82rem" }}>{o.descricao}</Typography>}
                          {o.valorTotal > 0 && <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.5 }}>Total: {formatCurrency(o.valorTotal)}</Typography>}
                        </Box>
                        {o.orcamentoStatus === "Emitido" && (
                          <Stack direction="row" spacing={1}>
                            <Button size="small" color="success" variant="contained" disabled={actionBusy === o.id}
                              onClick={() => handleOrcamento(o.id, "aprovar")}
                              startIcon={<CheckCircle size={14} />}>
                              {actionBusy === o.id ? "..." : "Aprovar"}
                            </Button>
                            <Button size="small" color="error" variant="outlined" disabled={actionBusy === o.id}
                              onClick={() => handleOrcamento(o.id, "rejeitar")}
                              startIcon={<XCircle size={14} />}>
                              {actionBusy === o.id ? "..." : "Rejeitar"}
                            </Button>
                          </Stack>
                        )}
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Box>
          )}

          {/* TAB: FATURAS */}
          {tab === "faturas" && (
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800, mb: 2 }}>Faturas</Typography>
              {faturas.length === 0 ? (
                <Alert severity="info">Sem faturas registadas.</Alert>
              ) : (
                <Paper variant="outlined" sx={{ overflow: "hidden" }}>
                  <Box sx={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                      <thead>
                        <tr style={{ background: "rgba(0,0,0,0.03)" }}>
                          <th style={{ textAlign: "left", padding: "10px 14px", fontSize: "0.72rem", textTransform: "uppercase", fontWeight: 800, color: "#64748b" }}>Número</th>
                          <th style={{ textAlign: "left", padding: "10px 14px", fontSize: "0.72rem", textTransform: "uppercase", fontWeight: 800, color: "#64748b" }}>Data</th>
                          <th style={{ textAlign: "left", padding: "10px 14px", fontSize: "0.72rem", textTransform: "uppercase", fontWeight: 800, color: "#64748b" }}>Estado</th>
                          <th style={{ textAlign: "right", padding: "10px 14px", fontSize: "0.72rem", textTransform: "uppercase", fontWeight: 800, color: "#64748b" }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {faturas.map(f => (
                          <tr key={f.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                            <td style={{ padding: "10px 14px", fontWeight: 700, fontSize: "0.85rem" }}>{f.numeroFatura}</td>
                            <td style={{ padding: "10px 14px", fontSize: "0.82rem", color: "#475569" }}>{formatDate(f.dataEmissao)}</td>
                            <td style={{ padding: "10px 14px" }}>
                              <Chip
                                label={f.pagamentoStatus}
                                size="small"
                                color={f.pagamentoStatus === "Pago" ? "success" : f.pagamentoStatus === "Pendente" ? "warning" : "default"}
                                sx={{ height: 22, fontSize: "0.7rem", fontWeight: 700 }}
                              />
                            </td>
                            <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 800, fontSize: "0.85rem" }}>{formatCurrency(f.valorTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Box>
                </Paper>
              )}
              {p.totalEmDivida > 0 && (
                <Box sx={{ mt: 2, p: 2, borderRadius: 3, bgcolor: "#fffbeb", border: "1px solid #fde68a", display: "flex", alignItems: "center", gap: 1.5 }}>
                  <Wallet size={18} className="text-amber-600" />
                  <Typography variant="body2" sx={{ fontWeight: 700, color: "#92400e" }}>
                    Valor total em aberto: {formatCurrency(p.totalEmDivida)}
                  </Typography>
                </Box>
              )}
            </Box>
          )}

          {/* TAB: EQUIPAMENTO */}
          {tab === "equipamento" && (
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800, mb: 2 }}>Equipamento de Segurança</Typography>
              {cliente.navios.length === 0 ? (
                <Alert severity="info">Sem navios com equipamento registado.</Alert>
              ) : (
                <Stack spacing={3}>
                  {cliente.navios.map(navio => {
                    const navioAtencao = [
                      ...navio.extintores.map(e => validityStatus(e.dataProxRecarga)),
                      ...navio.extintores.map(e => validityStatus(e.dataProxTesteHidraulico)),
                      ...navio.coletes.map(c => validityStatus(c.dataProxInspecao)),
                      ...navio.epirbs.map(ep => validityStatus(ep.dataProxInspecao)),
                      ...navio.epirbs.map(ep => validityStatus(ep.dataValidadeBateria)),
                    ].some(s => s === "warning" || s === "expired");

                    return (
                      <Paper key={navio.id} variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5, flexWrap: "wrap", gap: 1 }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                            <Ship size={16} className="inline mr-1" />{navio.nome} ({navio.matricula})
                          </Typography>
                          <Stack direction="row" spacing={0.5}>
                            {navioAtencao && <Chip size="small" color="warning" label="Atenção a validades" sx={{ height: 22, fontSize: "0.7rem", fontWeight: 700 }} />}
                            <Chip size="small" variant="outlined" label={`${navio.extintores.length + navio.coletes.length + navio.epirbs.length} itens`} sx={{ height: 22, fontSize: "0.7rem" }} />
                          </Stack>
                        </Stack>

                        {/* EXTINTORES */}
                        <Box sx={{ mb: 2 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 800, color: "error.main", mb: 1 }}>
                            <Flame size={14} className="inline mr-1" />Extintores ({navio.extintores.length})
                          </Typography>
                          {navio.extintores.length === 0 ? (
                            <Typography variant="caption" color="text.secondary">Sem extintores registados.</Typography>
                          ) : (
                            <Stack spacing={1}>
                              {navio.extintores.map(e => (
                                <Paper key={e.id} variant="outlined" sx={{ p: 1.5, bgcolor: "grey.50" }}>
                                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ flexWrap: "wrap", gap: 1 }}>
                                    <Box>
                                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{e.marca || ""} {e.modelo || ""} — {e.capacidadeKg || "?"}kg ({e.tipoAgente || "—"})</Typography>
                                      <Typography variant="caption" color="text.secondary">S/N: {e.serial || "—"} | Local: {e.localizacao || "—"} | Estado: {e.estado}</Typography>
                                    </Box>
                                    <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap" }}>
                                      <ValidityChip label="Próx. recarga" date={e.dataProxRecarga} />
                                      <ValidityChip label="Próx. teste" date={e.dataProxTesteHidraulico} />
                                    </Stack>
                                  </Stack>
                                </Paper>
                              ))}
                            </Stack>
                          )}
                        </Box>

                        <Divider sx={{ my: 1.5 }} />

                        {/* PIROTECNICOS */}
                        <Box sx={{ mb: 2 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 800, color: "warning.main", mb: 1 }}>
                            <AlertTriangle size={14} className="inline mr-1" />Pirotécnicos a Bordo
                          </Typography>
                          {(() => {
                            let piroItems: PirotecnicoItem[] = [];
                            if (navio.pirotecnicosBordoJson) {
                              try { const p = JSON.parse(navio.pirotecnicosBordoJson); if (Array.isArray(p)) piroItems = p; } catch {}
                            }
                            if (piroItems.length === 0) {
                              return <Typography variant="caption" color="text.secondary">Sem pirotécnicos registados.</Typography>;
                            }
                            return (
                              <Stack spacing={0.5}>
                                {piroItems.map((p, i) => (
                                  <Paper key={p.id || i} variant="outlined" sx={{ p: 1.5, bgcolor: "grey.50" }}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ flexWrap: "wrap", gap: 1 }}>
                                      <Box>
                                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{p.item}</Typography>
                                        <Typography variant="caption" color="text.secondary">Qtd: {p.quantity || "—"} {p.notes ? `| ${p.notes}` : ""}</Typography>
                                      </Box>
                                      <ValidityChip label="Validade" date={p.validade} />
                                    </Stack>
                                  </Paper>
                                ))}
                              </Stack>
                            );
                          })()}
                        </Box>

                        <Divider sx={{ my: 1.5 }} />

                        {/* COLETES */}
                        <Box sx={{ mb: 2 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 800, color: "info.main", mb: 1 }}>
                            <LifeBuoy size={14} className="inline mr-1" />Coletes ({navio.coletes.length})
                          </Typography>
                          {navio.coletes.length === 0 ? (
                            <Typography variant="caption" color="text.secondary">Sem coletes registados.</Typography>
                          ) : (
                            <Stack spacing={1}>
                              {navio.coletes.map(c => (
                                <Paper key={c.id} variant="outlined" sx={{ p: 1.5, bgcolor: "grey.50" }}>
                                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ flexWrap: "wrap", gap: 1 }}>
                                    <Box>
                                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{c.marca || ""} {c.modelo || ""}</Typography>
                                      <Typography variant="caption" color="text.secondary">S/N: {c.serial} | Tamanho: {c.tamanho || "—"} | Estado: {c.estado}</Typography>
                                    </Box>
                                    <ValidityChip label="Próx. inspeção" date={c.dataProxInspecao} />
                                  </Stack>
                                </Paper>
                              ))}
                            </Stack>
                          )}
                        </Box>

                        <Divider sx={{ my: 1.5 }} />

                        {/* EPIRBs */}
                        <Box>
                          <Typography variant="subtitle2" sx={{ fontWeight: 800, color: "success.main", mb: 1 }}>
                            <Radio size={14} className="inline mr-1" />EPIRB ({navio.epirbs.length})
                          </Typography>
                          {navio.epirbs.length === 0 ? (
                            <Typography variant="caption" color="text.secondary">Sem EPIRBs registados.</Typography>
                          ) : (
                            <Stack spacing={1}>
                              {navio.epirbs.map(ep => (
                                <Paper key={ep.id} variant="outlined" sx={{ p: 1.5, bgcolor: "grey.50" }}>
                                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ flexWrap: "wrap", gap: 1 }}>
                                    <Box>
                                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{ep.marca || ""} {ep.modelo || ""} ({ep.tipo || "—"})</Typography>
                                      <Typography variant="caption" color="text.secondary">S/N: {ep.serial} | HEX ID: {ep.hexId || "—"} | Estado: {ep.estado}</Typography>
                                    </Box>
                                    <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap" }}>
                                      <ValidityChip label="Próx. inspeção" date={ep.dataProxInspecao} />
                                      <ValidityChip label="Bateria" date={ep.dataValidadeBateria} />
                                    </Stack>
                                  </Stack>
                                </Paper>
                              ))}
                            </Stack>
                          )}
                        </Box>
                      </Paper>
                    );
                  })}
                </Stack>
              )}
            </Box>
          )}
        </Box>
      </Paper>
    </Box>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.5 }}>
      <Box sx={{ color: "text.secondary" }}>{icon}</Box>
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</Typography>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>{value}</Typography>
      </Box>
    </Box>
  );
}