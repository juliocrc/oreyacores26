"use client";
import Link from "next/link";
import { getNavioLocationLabel } from "@/lib/navios-page-helpers";
import { useMemo, useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { CLIENTE_PAYMENT_MODE_OPTIONS } from "@/lib/cliente-payment-options";
import { sortNaviosAlphabetically } from "@/lib/navios-sort";
import { formatDateDisplay } from "@/lib/date-display";
import { formatDateLongPt } from "@/lib/relatorios-page-helpers";
import { User, Ship, FileText, ClipboardList, Settings, Mail, Phone, MapPin, Save, Search, Plus, Trash2, ExternalLink, AlertTriangle, Loader2, Building2, Receipt, History, MessageSquare, CreditCard, DollarSign, KeyRound } from "lucide-react";
import { IVA_ISENCAO_CODES } from "@/lib/iva-isencao-codes";

type Navio = { id: number; nome: string; matricula: string; portoRegisto?: string | null; ilha: string | null; tipoPesca: string; clienteId?: number | null; cliente?: { id: number; nome: string } | null };
type Cliente = { id: number; nome: string; numeroCliente?: string | null; modoPagamento?: string | null; nif?: string | null; email?: string | null; telefone?: string | null; telmovel?: string | null; morada?: string | null; moradaNumero?: string | null; codigoPostal?: string | null; localidade?: string | null; ilha?: string | null; navios: Navio[] };
type TabKey = "ficha" | "navios" | "ordens" | "assistencia" | "financeiro" | "iva" | "acoes";
type ServiceOrder = { id: number; numeroOrdem: string; tipo: string; status: string; orcamentoStatus?: string | null; valorTotal?: number; prioridade: string; tecnicoResponsavel?: string | null; dataPlaneadaInicio?: string | null; dataConclusao?: string | null; createdAt: string; jangada?: { serial?: string | null; brand?: string | null; model?: string | null } | null };
type FaturaItem = { id: number; numeroFatura: string; ordemServicoId: number | null; numeroOrdem: string | null; ordemServicoStatus: string | null; valorSubtotal: number; valorIva: number; valorTotal: number; isIsentoIva: boolean; pagamentoStatus: string; dataEmissao: string; emitidaPor: string | null; jangada: string | null; cancelada?: boolean; dataCancelamento?: string | null; motivoCancelamento?: string | null; numeroRecibo?: string | null; notaCredito?: { numeroNotaCredito: string; dataEmissao: string } | null; ordemServicos?: Array<{ id: number; numeroOrdem: string; status: string; valorTotal: number; jangada: string | null }> };

function normalizeNaviosResponse(payload: unknown): Navio[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload as Navio[];
  if (typeof payload === "object" && payload !== null && Array.isArray((payload as any).data)) return (payload as any).data as Navio[];
  return [];
}

export default function ClienteDetalhePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const clienteId = Number(params?.id);
  const [tab, setTab] = useState<TabKey>("ficha");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [allNavios, setAllNavios] = useState<Navio[]>([]);
  const [ordens, setOrdens] = useState<ServiceOrder[]>([]);
  const [loadingOrdens, setLoadingOrdens] = useState(false);
  const [faturas, setFaturas] = useState<FaturaItem[]>([]);
  const [loadingFaturas, setLoadingFaturas] = useState(false);
  const [pagamentoBusyId, setPagamentoBusyId] = useState<number | null>(null);
  const [cancelandoFaturaId, setCancelandoFaturaId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyNavio, setBusyNavio] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exportingThirdPartySheet, setExportingThirdPartySheet] = useState(false);
  const [declarationNavioId, setDeclarationNavioId] = useState<number | string>("");
  const [declarationIvaCode, setDeclarationIvaCode] = useState<string>("M05");
  const [generatingCode, setGeneratingCode] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [generatedCodeError, setGeneratedCodeError] = useState<string | null>(null);

  // New Contact / Note state
  const [contactosLog, setContactosLog] = useState<Array<{ id: number; data: string; tipo: string; descricao: string; autor?: string }>>([]);
  const [novoContacto, setNovoContacto] = useState({ tipo: "Telefone", descricao: "", autor: "Admin" });

  const [profileDraft, setProfileDraft] = useState({ nome: "", numeroCliente: "", modoPagamento: "", ilha: "", morada: "", moradaNumero: "", codigoPostal: "", localidade: "", nif: "", email: "", telefone: "", telmovel: "" });
  const [profileErrors, setProfileErrors] = useState<Record<string, string | undefined>>({});
  const [selectedNavioId, setSelectedNavioId] = useState("");
  const [navioSearch, setNavioSearch] = useState("");

  const loadCliente = async () => {
    if (!Number.isFinite(clienteId) || clienteId <= 0) { setError("ID inválido"); setLoading(false); return; }
    try {
      setError(null);
      const [clienteRes, naviosRes] = await Promise.all([fetch(`/api/clientes/${clienteId}`), fetch("/api/navios")]);
      if (!clienteRes.ok) throw new Error((await clienteRes.json().catch(() => ({})))?.error || "Erro ao carregar cliente");
      const clienteData = (await clienteRes.json()) as Cliente;
      const naviosData = await naviosRes.json();
      setCliente(clienteData);
      setAllNavios(sortNaviosAlphabetically(normalizeNaviosResponse(naviosData)));
      setProfileDraft({ nome: clienteData.nome || "", numeroCliente: clienteData.numeroCliente || "", modoPagamento: clienteData.modoPagamento || "", ilha: clienteData.ilha || "", morada: clienteData.morada || "", moradaNumero: clienteData.moradaNumero || "", codigoPostal: clienteData.codigoPostal || "", localidade: clienteData.localidade || "", nif: clienteData.nif || "", email: clienteData.email || "", telefone: clienteData.telefone || "", telmovel: clienteData.telmovel || "" });
    } catch (e) { setError(e instanceof Error ? e.message : "Erro"); }
    finally { setLoading(false); }
  };

  const loadOrdens = async () => {
    setLoadingOrdens(true);
    try {
      const res = await fetch(`/api/ordens-servico?clienteId=${clienteId}&pageSize=100`);
      if (res.ok) { const data = await res.json(); setOrdens(data.orders || []); }
    } catch { /* */ }
    finally { setLoadingOrdens(false); }
  };

  const loadFaturas = async () => {
    setLoadingFaturas(true);
    try {
      const res = await fetch(`/api/clientes/${clienteId}/faturas`);
      if (res.ok) { const data = await res.json(); setFaturas(Array.isArray(data.faturas) ? data.faturas : []); }
    } catch { /* */ }
    finally { setLoadingFaturas(false); }
  };

  const updatePagamentoFatura = async (faturaId: number, pagamentoStatus: string) => {
    setPagamentoBusyId(faturaId);
    try {
      const res = await fetch(`/api/faturas/${faturaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pagamentoStatus }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Erro ao atualizar pagamento.");
      setFaturas((prev) => prev.map((f) => (f.id === faturaId ? { ...f, pagamentoStatus } : f)));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao atualizar pagamento.");
    } finally {
      setPagamentoBusyId(null);
    }
  };

  const anularFaturaCliente = async (fatura: FaturaItem) => {
    const motivo = window.prompt("Motivo da anulação da fatura (opcional):", "") || "";
    if (motivo === null) return;
    setCancelandoFaturaId(fatura.id);
    try {
      const res = await fetch(`/api/faturas/${fatura.id}/cancelar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: motivo.trim() }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Erro ao anular fatura.");
      const body = await res.json();
      const numeroNC = body?.notaCredito?.numeroNotaCredito || "";
      setFaturas((prev) => prev.map((f) => (f.id === fatura.id ? { ...f, cancelada: true, pagamentoStatus: "Cancelado", notaCredito: body?.notaCredito ? { numeroNotaCredito: numeroNC, dataEmissao: body?.notaCredito?.dataEmissao } : undefined } : f)));
      if (numeroNC) {
        const otId = fatura.ordemServicoId;
        if (otId) window.open(`/api/ordens-servico/${otId}/nota-credito-excel`, "_blank");
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao anular fatura.");
    } finally {
      setCancelandoFaturaId(null);
    }
  };

  useEffect(() => { loadCliente(); }, [clienteId]);
  useEffect(() => {
    if (cliente && (tab === "ordens" || tab === "financeiro")) {
      loadOrdens();
      if (tab === "financeiro") loadFaturas();
    }
  }, [tab, cliente?.id]);

  const updateProfileField = (field: string, value: string) => {
    setProfileDraft((prev) => ({ ...prev, [field]: value }));
  };

  const saveProfile = async () => {
    if (!cliente) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/clientes/${cliente.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profileDraft) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Erro ao guardar");
      await loadCliente();
      alert("Cliente atualizado com sucesso.");
    } catch (e) { alert(e instanceof Error ? e.message : "Erro"); }
    finally { setSaving(false); }
  };

  const associateNavio = async () => {
    if (!cliente) return;
    const navioId = Number(selectedNavioId);
    if (!navioId) return;
    try {
      setBusyNavio(true);
      const res = await fetch(`/api/navios/${navioId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clienteId: cliente.id }) });
      if (!res.ok) throw new Error("Falha ao associar");
      setSelectedNavioId(""); await loadCliente();
    } catch (e) { alert(e instanceof Error ? e.message : "Erro"); }
    finally { setBusyNavio(false); }
  };

  const disassociateNavio = async (navioId: number) => {
    try {
      setBusyNavio(true);
      const res = await fetch(`/api/navios/${navioId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clienteId: null }) });
      if (!res.ok) throw new Error("Falha ao desassociar");
      await loadCliente();
    } catch (e) { alert(e instanceof Error ? e.message : "Erro"); }
    finally { setBusyNavio(false); }
  };

  const deleteCliente = async () => {
    if (!cliente) return;
    if (!confirm(`Excluir permanentemente o cliente "${cliente.nome}"?`)) return;
    try {
      setDeleting(true);
      const res = await fetch(`/api/clientes/${cliente.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Falha ao excluir");
      router.push("/clientes");
    } catch (e) { alert(e instanceof Error ? e.message : "Erro"); }
    finally { setDeleting(false); }
  };

  const handleGerarCodigoAcesso = async () => {
    if (!cliente) return;
    setGeneratingCode(true);
    setGeneratedCode(null);
    setGeneratedCodeError(null);
    try {
      const res = await fetch(`/api/portal/clientes/${cliente.id}/gerar-codigo`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setGeneratedCodeError(data.error || "Erro ao gerar código."); return; }
      setGeneratedCode({ code: data.code, expiresAt: data.expiresAt });
    } catch { setGeneratedCodeError("Erro de rede."); }
    finally { setGeneratingCode(false); }
  };

  const generateClienteExcel = async () => {
    if (!cliente) return;
    try {
      setExportingThirdPartySheet(true);
      const res = await fetch(`/api/clientes/${cliente.id}/ficha-terceiro`);
      if (!res.ok) throw new Error("Erro ao gerar ficha");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const match = (res.headers.get("content-disposition") || "").match(/filename="?([^";]+)"?/i);
      a.href = url; a.download = match?.[1] || `ficha_terceiro_${cliente.id}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e) { alert(e instanceof Error ? e.message : "Erro"); }
    finally { setExportingThirdPartySheet(false); }
  };

  const generateIvaDeclaration = () => {
    if (!cliente) return;

    const navio = cliente.navios.find((n) => n.id === Number(declarationNavioId)) || cliente.navios[0];

    const clienteNomeDeclarante = String(cliente.nome || "").trim() || "[Nome do cliente]";
    const clienteNifDeclarante = String(cliente.nif || "").trim() || "[NIF do cliente]";
    const addressParts = [
      cliente.morada,
      cliente.moradaNumero,
      cliente.codigoPostal,
      cliente.localidade
    ].filter(Boolean);
    const clienteMorada = addressParts.length > 0 ? addressParts.join(", ") : "[Morada não registada]";

    const navioNome = String(navio?.nome || "").trim() || "[Nome da Embarcação]";
    const navioMatricula = String(navio?.matricula || "").trim() || "[Matrícula]";
    const navioPortoRegisto = String(navio?.portoRegisto || "").trim() || "[Porto de Registo]";

    const ivaCodeInfo = IVA_ISENCAO_CODES.find(c => c.code === declarationIvaCode);
    const ivaCodeDisplay = ivaCodeInfo ? `${ivaCodeInfo.code} — ${ivaCodeInfo.mencao}` : "M05 — Isento artigo 14.º do CIVA";
    const ivaCodeNorma = ivaCodeInfo?.norma || "Artigo 14.º do CIVA";

    const htmlString = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <title>Declaração de Isenção de IVA</title>
        <style>
          body { font-family: 'Arial', sans-serif; font-size: 11pt; line-height: 1.5; padding: 2cm; }
          h1 { font-size: 14pt; font-weight: bold; text-align: center; margin-bottom: 24pt; }
          h2 { font-size: 12pt; font-weight: bold; margin-top: 18pt; margin-bottom: 6pt; border-bottom: 1px solid #ddd; padding-bottom: 3pt; }
          p { margin-bottom: 12pt; text-align: justify; }
          .footer { margin-top: 40pt; }
          .signature-line { margin-top: 40pt; border-top: 1px solid #000; width: 250px; }
        </style>
      </head>
      <body>
        <h1>DECLARAÇÃO DE ISENÇÃO DE IVA</h1>

        <h2>Identificação do Declarante</h2>
        <p>
          Eu, <strong>${clienteNomeDeclarante}</strong>, com o NIF <strong>${clienteNifDeclarante}</strong>,
          residente/sediado em <strong>${clienteMorada}</strong>, associado ao navio denominado <strong>${navioNome}</strong>,
          com a matrícula <strong>${navioMatricula}</strong>, registada no Porto <strong>${navioPortoRegisto}</strong>,
          venho por este meio declarar que:
        </p>

        <h2>Atividade da Embarcação</h2>
        <p>
          A referida embarcação exerce atividade no setor da pesca marítima (CAE 03110), dedicando-se à pesca profissional.
        </p>

        <h2>Finalidade dos Serviços</h2>
        <p>
          Os serviços de inspeção de jangada e salvamento, adquiridos à empresa Orey Técnica Serviços Navais, Lda, com NIF 501117334, destinam-se à manutenção ou equipamento da citada embarcação.
        </p>

        <h2>Fundamento Legal</h2>
        <p>
          Pelo exposto, solicito a aplicação da isenção de IVA, nos termos da ${ivaCodeDisplay} (${ivaCodeNorma}), por se tratar de operações isentas relativas a embarcações de pesca.
        </p>

        <h2>Declaração de Responsabilidade</h2>
        <p>
          Estou ciente das obrigações declarativas e da responsabilidade pela veracidade destas informações, conforme disposto no Código do IVA.
        </p>

        <p class="footer">
          Lagoa, ${formatDateLongPt()}.
        </p>

        <div style="margin-top: 50px;">
          <p>Assinatura do Armador / Representante Legal:</p>
          <br/><br/>
          <div class="signature-line" style="border-top: 1px solid #000; width: 250px;"></div>
          <p style="margin-top: 5px;">${clienteNomeDeclarante}</p>
        </div>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff' + htmlString], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `declaracao_isencao_iva_${String(navioNome || "embarcacao").replace(/\s+/g, "_")}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const addContactoLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoContacto.descricao.trim()) return;
    setContactosLog(prev => [{ id: Date.now(), data: new Date().toISOString(), ...novoContacto }, ...prev]);
    setNovoContacto(prev => ({ ...prev, descricao: "" }));
  };

  const filteredNavios = useMemo(() => {
    const q = navioSearch.trim().toLowerCase();
    const base = allNavios.filter((n) => n.id !== undefined);
    if (!q) return base;
    return base.filter((n) => (n.nome || "").toLowerCase().includes(q) || (n.matricula || "").toLowerCase().includes(q));
  }, [allNavios, navioSearch]);

  const STATUS_COLORS: Record<string, string> = { pendente: "bg-slate-100 text-slate-700", agendada: "bg-purple-100 text-purple-700", em_progresso: "bg-blue-100 text-blue-700", concluida: "bg-emerald-100 text-emerald-700", cancelada: "bg-red-100 text-red-700" };

  if (loading) return <div className="flex items-center justify-center min-h-screen text-slate-500"><Loader2 size={24} className="animate-spin mr-2" />A carregar...</div>;
  if (error || !cliente) return <div className="max-w-3xl mx-auto px-4 py-10"><div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm">{error || "Cliente não encontrado."}</div><Link href="/clientes" className="mt-4 inline-block text-sm text-blue-700 hover:underline">← Voltar</Link></div>;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white py-6">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-4">
        {/* Header Card */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-700 to-indigo-800 p-6 shadow-xl shadow-indigo-500/20">
          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/20 text-white">
                <Building2 size={28} />
              </div>
              <div>
                <Link href="/clientes" className="text-xs text-indigo-200 hover:text-white transition-colors">← Clientes</Link>
                <h1 className="text-xl sm:text-2xl font-bold text-white mt-0.5">{cliente.nome}</h1>
                <p className="text-sm text-indigo-200">Nº {cliente.numeroCliente || `CLI-${String(cliente.id).padStart(5, "0")}`} · {cliente.ilha || "—"} · NIF: {cliente.nif || "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={generateClienteExcel} disabled={exportingThirdPartySheet} className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/25 transition disabled:opacity-50">
                <FileText size={14} /> {exportingThirdPartySheet ? "A gerar..." : "Ficha Terceiro"}
              </button>
              <div className="rounded-lg bg-white/10 px-3 py-2 text-xs text-indigo-200">
                {cliente.navios.length} navio{cliente.navios.length !== 1 ? "s" : ""}
              </div>
            </div>
          </div>
        </div>

        {/* Modern Interactive Tabs */}
        <div className="flex flex-wrap gap-1 rounded-xl bg-white p-1.5 border border-slate-200 shadow-sm">
          {[
            { key: "ficha", icon: <User size={14} />, label: "Ficha & Dados" },
            { key: "navios", icon: <Ship size={14} />, label: `Navios (${cliente.navios.length})` },
            { key: "ordens", icon: <FileText size={14} />, label: "Ordens de Serviço & Obras" },
            { key: "assistencia", icon: <MessageSquare size={14} />, label: "Assistência & Contactos" },
            { key: "financeiro", icon: <CreditCard size={14} />, label: "Orçamentos, Faturas & Pagamentos" },
            { key: "iva", icon: <Receipt size={14} />, label: "Isenção de IVA" },
            { key: "acoes", icon: <Settings size={14} />, label: "Ações" },
          ].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key as TabKey)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${tab === t.key ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}
            >{t.icon}{t.label}</button>
          ))}
        </div>

        {/* Tab: Ficha */}
        {tab === "ficha" && (
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50"><h2 className="font-bold text-slate-800">Dados do Cliente (CRM 360)</h2></div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <InputField label="Nome" icon={<User size={14} />} value={profileDraft.nome} onChange={(v) => updateProfileField("nome", v)} required />
              <InputField label="Nº Cliente" value={profileDraft.numeroCliente} onChange={(v) => updateProfileField("numeroCliente", v)} placeholder="Ex: CLI-00021" />
              <InputField label="Modo Pagamento" value={profileDraft.modoPagamento} onChange={(v) => updateProfileField("modoPagamento", v)} list="payment-options" />
              <InputField label="Ilha" value={profileDraft.ilha} onChange={(v) => updateProfileField("ilha", v)} />
              <div className="md:col-span-2"><InputField label="Morada" icon={<MapPin size={14} />} value={profileDraft.morada} onChange={(v) => updateProfileField("morada", v)} /></div>
              <InputField label="Nº Porta" value={profileDraft.moradaNumero} onChange={(v) => updateProfileField("moradaNumero", v)} />
              <InputField label="Código Postal" value={profileDraft.codigoPostal} onChange={(v) => updateProfileField("codigoPostal", v)} placeholder="0000-000" />
              <InputField label="Localidade" value={profileDraft.localidade} onChange={(v) => updateProfileField("localidade", v)} />
              <InputField label="NIF" value={profileDraft.nif} onChange={(v) => updateProfileField("nif", v)} />
              <InputField label="Email" icon={<Mail size={14} />} type="email" value={profileDraft.email} onChange={(v) => updateProfileField("email", v)} />
              <InputField label="Telefone" icon={<Phone size={14} />} value={profileDraft.telefone} onChange={(v) => updateProfileField("telefone", v)} />
              <InputField label="Telemóvel" icon={<Phone size={14} />} value={profileDraft.telmovel} onChange={(v) => updateProfileField("telmovel", v)} />
            </div>
            <datalist id="payment-options">{CLIENTE_PAYMENT_MODE_OPTIONS.map((o) => <option key={o} value={o} />)}</datalist>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={generateClienteExcel} disabled={exportingThirdPartySheet} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50">
                <FileText size={14} className="inline mr-1" />Exportar Excel
              </button>
              <button onClick={saveProfile} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition disabled:opacity-50">
                <Save size={14} />{saving ? "A guardar..." : "Guardar"}
              </button>
            </div>
          </div>
        )}

        {/* Tab: Navios */}
        {tab === "navios" && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
              <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><Ship size={16} className="text-indigo-500" />Navios Associados</h3>
              {cliente.navios.length === 0 ? <p className="text-sm text-slate-400 italic">Nenhum navio associado.</p> : (
                <div className="space-y-2">
                  {cliente.navios.map((navio) => (
                    <div key={navio.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 hover:bg-slate-50 transition">
                      <div>
                        <Link href={`/navios/${navio.id}`} className="text-sm font-semibold text-indigo-700 hover:underline">{navio.nome}</Link>
                        <p className="text-xs text-slate-500">{navio.matricula} · {getNavioLocationLabel(navio as any) || "—"} · {navio.tipoPesca || "—"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link href={`/criar-ot?clienteId=${cliente.id}&navioId=${navio.id}`} className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-100 transition">
                          <Plus size={12} className="inline mr-1" />Nova OS
                        </Link>
                        <button onClick={() => disassociateNavio(navio.id)} disabled={busyNavio} className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 transition disabled:opacity-50">Desassociar</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
              <h3 className="font-bold text-slate-800 mb-3">Associar Navio Existente</h3>
              <input type="text" value={navioSearch} onChange={(e) => setNavioSearch(e.target.value)} placeholder="Pesquisar navio..." className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm mb-3 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
              <div className="flex gap-2">
                <select value={selectedNavioId} onChange={(e) => setSelectedNavioId(e.target.value)} className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white">
                  <option value="">Selecionar navio...</option>
                  {filteredNavios.map((n) => <option key={n.id} value={n.id}>{n.nome} ({n.matricula}){n.cliente?.nome ? ` — ${n.cliente.nome}` : " — Disponível"}</option>)}
                </select>
                <button onClick={associateNavio} disabled={!selectedNavioId || busyNavio} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-50">
                  <Plus size={14} className="inline mr-1" />Associar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Ordens de Serviço & Obras (Unificadas) */}
        {tab === "ordens" && (
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <FileText size={16} className="text-indigo-500" />
                Ordens de Serviço e Obras ({ordens.length})
              </h3>
              <Link href={`/criar-ot?clienteId=${clienteId}`} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition">
                <Plus size={12} className="inline mr-1" />Nova OS
              </Link>
            </div>
            {loadingOrdens ? (
              <div className="flex items-center justify-center py-12 text-slate-400"><Loader2 size={20} className="animate-spin mr-2" />A carregar...</div>
            ) : ordens.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">Nenhuma ordem de serviço registada para este cliente.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {ordens.map((os) => (
                  <Link key={os.id} href={`/ordens-servico/${os.id}`} className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">{os.numeroOrdem}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 uppercase">{os.tipo}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{os.jangada ? `${os.jangada.brand} ${os.jangada.model} (${os.jangada.serial})` : "—"} · Aberto em {formatDateDisplay(os.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-slate-800">{Number(os.valorTotal || 0).toFixed(2)} €</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[os.status] || "bg-slate-100 text-slate-600"}`}>{os.status?.replace(/_/g, " ")}</span>
                      <ExternalLink size={14} className="text-slate-300" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab: Assistência & Contactos */}
        {tab === "assistencia" && (
          <div className="space-y-6">
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
              <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2"><MessageSquare size={16} className="text-indigo-500" />Registar Contacto / Comunicação</h3>
              <p className="text-xs text-slate-500 mb-4">Registe telefonemas, emails, reuniões ou pedidos de assistência recebidos ou efetuados.</p>
              <form onSubmit={addContactoLog} className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de Contacto</label>
                    <select value={novoContacto.tipo} onChange={(e) => setNovoContacto(prev => ({ ...prev, tipo: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white">
                      <option value="Telefone">Telefone / Chamada</option>
                      <option value="Email">E-mail</option>
                      <option value="Portal">Pedido de Assistência (Portal)</option>
                      <option value="Presencial">Reunião Presencial</option>
                      <option value="WhatsApp">WhatsApp</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Autor / Responsável</label>
                    <input type="text" value={novoContacto.autor} onChange={(e) => setNovoContacto(prev => ({ ...prev, autor: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Ex: Júlio Correia" />
                  </div>
                  <div className="flex items-end">
                    <button type="submit" className="w-full rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition">Registar Contacto</button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Descrição / Notas do Contacto</label>
                  <textarea rows={2} value={novoContacto.descricao} onChange={(e) => setNovoContacto(prev => ({ ...prev, descricao: e.target.value }))} placeholder="Detalhes da conversa ou pedido..." className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                </div>
              </form>
            </div>

            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50"><h3 className="font-bold text-slate-800">Histórico de Contactos e Pedidos de Assistência</h3></div>
              {contactosLog.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">Nenhum contacto registado recentemente.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {contactosLog.map((c) => (
                    <div key={c.id} className="px-6 py-4 flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700">{c.tipo}</span>
                          <span className="text-xs text-slate-400">{new Date(c.data).toLocaleString("pt-PT")}</span>
                          {c.autor && <span className="text-xs font-medium text-slate-600">· Por: {c.autor}</span>}
                        </div>
                        <p className="text-sm text-slate-800 mt-1">{c.descricao}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab: Orçamentos, Faturas & Pagamentos */}
        {tab === "financeiro" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Faturado</p>
                <p className="mt-2 text-2xl font-black text-slate-900">
                  {`${ordens.reduce((acc, o) => acc + Number(o.valorTotal || 0), 0).toFixed(2)} €`}
                </p>
                <p className="mt-1 text-xs text-slate-500">Soma de todas as ordens de serviço</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Orçamentos Pendentes</p>
                <p className="mt-2 text-2xl font-black text-amber-600">
                  {ordens.filter(o => String(o.orcamentoStatus || "").toLowerCase() !== "aprovado").length}
                </p>
                <p className="mt-1 text-xs text-slate-500">A aguardar aprovação do cliente</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Modo de Pagamento</p>
                <p className="mt-2 text-lg font-bold text-slate-800">{cliente.modoPagamento || "Não definido"}</p>
                <p className="mt-1 text-xs text-slate-500">Condições contratuais</p>
              </div>
            </div>

            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-4">
                <h3 className="font-bold text-slate-800 flex items-center gap-2"><Receipt size={16} className="text-emerald-500" />Faturas Emitidas ({faturas.length})</h3>
                <span className="text-xs font-semibold text-slate-500">Total: <b className="text-emerald-600">{faturas.reduce((acc, f) => acc + Number(f.valorTotal || 0), 0).toFixed(2)} €</b></span>
              </div>
              {loadingFaturas ? (
                <div className="flex items-center justify-center py-12 text-slate-400"><Loader2 size={20} className="animate-spin mr-2" />A carregar faturas...</div>
              ) : faturas.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">Nenhuma fatura oficial registada para este cliente. Emita faturas a partir da consola de faturação.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {faturas.map((f) => (
                    <div key={f.id} className={`px-6 py-4 flex items-center justify-between gap-4 transition ${f.cancelada ? "bg-rose-50/40" : "hover:bg-slate-50"}`}>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm font-bold ${f.cancelada ? "text-rose-500 line-through" : "text-slate-950"}`}>{f.numeroFatura}</span>
                          {f.numeroOrdem && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">OT {f.numeroOrdem}</span>}
                          {f.cancelada && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-600">ANULADA</span>}
                          {f.notaCredito && (
                            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-600 border border-rose-200">NC {f.notaCredito.numeroNotaCredito}</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Emitida em {new Date(f.dataEmissao).toLocaleDateString("pt-PT")} · {f.jangada || "—"}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                          f.cancelada ? "bg-rose-50 text-rose-700" :
                          f.pagamentoStatus === "Pago" ? "bg-emerald-50 text-emerald-700" :
                          f.pagamentoStatus === "Pago Parcialmente" ? "bg-blue-50 text-blue-700" :
                          f.pagamentoStatus === "Vencido" ? "bg-rose-50 text-rose-700" :
                          "bg-amber-50 text-amber-700"
                        }`}>{f.cancelada ? "Cancelado" : f.pagamentoStatus}</span>
                        <span className={`text-sm font-black ${f.cancelada ? "text-slate-400 line-through" : "text-slate-900"}`}>{Number(f.valorTotal || 0).toFixed(2)} €</span>
                        <div className="flex items-center gap-1.5">
                          {!f.cancelada && (
                            <select
                              value={f.pagamentoStatus}
                              disabled={pagamentoBusyId === f.id}
                              onChange={(e) => updatePagamentoFatura(f.id, e.target.value)}
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50"
                              title="Atualizar estado de pagamento"
                            >
                              {["Pendente", "Pago Parcialmente", "Pago", "Vencido"].map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          )}
                          {f.ordemServicoId && (
                            <>
                              <a href={`/api/ordens-servico/${f.ordemServicoId}/fatura-excel`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 transition">Fatura Excel</a>
                              <a href={`/api/ordens-servico/${f.ordemServicoId}/fatura-pdf`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition">Fatura PDF</a>
                            </>
                          )}
                          {f.ordemServicoId && (f.pagamentoStatus === "Pago" || f.pagamentoStatus === "Pago Parcialmente") && (
                            <a href={`/api/ordens-servico/${f.ordemServicoId}/recibo-excel`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-600 hover:bg-sky-50 transition">Recibo</a>
                          )}
                          {f.ordemServicoId && f.cancelada && (
                            <a href={`/api/ordens-servico/${f.ordemServicoId}/nota-credito-excel`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition">Nota Crédito</a>
                          )}
                          {!f.cancelada && (
                            <button
                              onClick={() => anularFaturaCliente(f)}
                              disabled={cancelandoFaturaId === f.id}
                              className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 transition disabled:opacity-50"
                              title="Anular fatura (emite nota de crédito)"
                            >
                              Anular
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-4"><h3 className="font-bold text-slate-800">Orçamentos & Faturas Emitidas</h3>
                <a href={`/api/clientes/${cliente.id}/extrato-excel`} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-500 transition">⬇ Extrato Conta-Corrente (.xlsx)</a>
              </div>
              {ordens.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">Sem registos financeiros.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {ordens.map((os) => (
                    <div key={os.id} className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-slate-50 transition">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-950">{os.numeroOrdem}</span>
                          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">Orçamento / Fatura Excel</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">Data: {formatDateDisplay(os.createdAt)} · Estado Orçamento: <b>{os.orcamentoStatus || "Rascunho"}</b></p>
                      </div>
                        <div className="flex items-center gap-3">
                        <span className="text-sm font-black text-slate-900">{Number(os.valorTotal || 0).toFixed(2)} €</span>
                        <div className="flex items-center gap-1.5">
                          <a href={`/api/ordens-servico/${os.id}/orcamento-excel`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 transition">Orçamento Excel</a>
                          <a href={`/api/ordens-servico/${os.id}/fatura-excel`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 transition">Fatura Excel</a>
                          <a href={`/api/ordens-servico/${os.id}/recibo-excel`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-600 hover:bg-sky-50 transition">Recibo</a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab: Ações */}
        {tab === "acoes" && (
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
            <h3 className="font-bold text-slate-800 mb-1 flex items-center gap-2"><AlertTriangle size={16} className="text-amber-500" />Ações</h3>
            <p className="text-xs text-slate-500 mb-4">A exclusão remove permanentemente o cliente e pode afetar associações.</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/clientes" className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">← Lista Clientes</Link>
              <button onClick={deleteCliente} disabled={deleting} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition disabled:opacity-50">
                {deleting ? <><Loader2 size={14} className="animate-spin inline mr-1" />A excluir...</> : <><Trash2 size={14} className="inline mr-1" />Excluir Cliente</>}
              </button>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-200">
              <h4 className="font-bold text-slate-800 mb-1 flex items-center gap-2"><KeyRound size={16} className="text-blue-500" />Código de Acesso Portal</h4>
              <p className="text-xs text-slate-500 mb-3">Gere um código de 5 dígitos para o cliente aceder ao portal. Comunique o código verbalmente ou por mensagem.</p>
              {generatedCodeError && <p className="text-sm text-red-600 mb-2">{generatedCodeError}</p>}
              {generatedCode ? (
                <div className="rounded-xl bg-blue-50 border border-blue-200 p-4">
                  <p className="text-xs text-blue-600 font-semibold uppercase tracking-wider mb-1">Código Gerado</p>
                  <p className="text-3xl font-black text-blue-700 tracking-[0.3em] mb-1">{generatedCode.code}</p>
                  <p className="text-xs text-blue-500">Válido até: {new Date(generatedCode.expiresAt).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}</p>
                  <button onClick={() => setGeneratedCode(null)} className="mt-2 text-xs text-blue-600 underline font-semibold hover:text-blue-800">Gerar novo código</button>
                </div>
              ) : (
                <button onClick={handleGerarCodigoAcesso} disabled={generatingCode} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition disabled:opacity-50">
                  {generatingCode ? <><Loader2 size={14} className="animate-spin inline mr-1" />A gerar...</> : <><KeyRound size={14} className="inline mr-1" />Gerar Código de Acesso</>}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Tab: Isenção de IVA */}
        {tab === "iva" && (
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
            <h3 className="font-bold text-slate-800 mb-1 flex items-center gap-2"><Receipt size={16} className="text-indigo-500" />Declaração de Isenção de IVA</h3>
            <p className="text-xs text-slate-500 mb-4">Gera o documento Word da declaração de isenção de IVA para o navio selecionado, com o código de isenção da Autoridade Tributária.</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Embarcação</label>
                <select
                  value={declarationNavioId}
                  onChange={(e) => setDeclarationNavioId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white"
                >
                  <option value="">Selecionar navio...</option>
                  {cliente.navios.map((n) => (
                    <option key={n.id} value={n.id}>{n.nome} ({n.matricula})</option>
                  ))}
                </select>
                {cliente.navios.length === 0 && <p className="text-xs text-amber-600 mt-1">Sem navios associados — a declaração usará valores por preencher.</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Declarante</label>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                  {cliente.nome}
                  <span className="block text-xs text-slate-500">{cliente.nif || "NIF não registado"}</span>
                  <span className="block text-xs text-slate-500">{[cliente.morada, cliente.moradaNumero, cliente.codigoPostal, cliente.localidade].filter(Boolean).join(", ") || "Morada não registada"}</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Código de Isenção (AT)</label>
                <select
                  value={declarationIvaCode}
                  onChange={(e) => setDeclarationIvaCode(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white"
                >
                  {IVA_ISENCAO_CODES.map((c) => (
                    <option key={c.code} value={c.code}>{c.code} — {c.mencao}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">Código da Autoridade Tributária a constar na declaração.</p>
              </div>
            </div>

            <button
              onClick={generateIvaDeclaration}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition"
            >
              <FileText size={14} className="inline mr-1" />Gerar Declaração de Isenção de IVA (Word)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function InputField({ label, value, onChange, type = "text", placeholder, icon, error, required, list }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; icon?: React.ReactNode; error?: string; required?: boolean; list?: string;
}) {
  return (
    <label className="block">
      <span className="flex items-center gap-1 text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">{icon}{label}{required && <span className="text-red-500">*</span>}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} list={list}
        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition placeholder:text-slate-300" />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </label>
  );
}
