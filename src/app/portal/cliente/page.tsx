"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Box, CircularProgress, Typography, Paper, Tabs, Tab, Button, TextField, Alert, Chip, Stack, Divider, IconButton } from "@mui/material";
import { User, Ship, FileText, ClipboardList, Receipt, Shield, Save, Phone, Mail, MapPin, Edit3, ChevronRight, AlertTriangle, CheckCircle, XCircle, Clock, Flame, LifeBuoy, Radio, Vest } from "lucide-react";
import { APP_CONFIG } from "@/lib/app-config";

type TabKey = "dados" | "navios" | "ordens" | "faturas" | "equipamento";

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
  jangada?: { serial?: string | null; brand?: string | null; model?: string | null } | null;
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

function formatDate(d: string) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("pt-PT"); } catch { return d; }
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);
}

function statusColor(status: string) {
  switch (status?.toLowerCase()) {
    case "concluida": case "concluido": return "success";
    case "pendente": case "aberta": return "warning";
    case "em_andamento": case "em andamento": return "info";
    case "cancelada": return "error";
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
    if (days <= 180) return "warning";
    return "ok";
  } catch { return "none"; }
}

function ValidityChip({ label, date }: { label: string; date?: string | null }) {
  const s = validityStatus(date);
  const color = s === "ok" ? "success" : s === "warning" ? "warning" : s === "expired" ? "error" : "default";
  return (
    <Chip size="small" label={`${label}: ${formatDate(date || "")}`} color={color} variant="outlined" sx={{ fontSize: "0.7rem" }} />
  );
}

export default function PortalClientePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("dados");
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

  if (status === "loading" || loading) {
    return (
      <Box sx={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!data) return null;

  const { cliente, ordens, faturas } = data;
  const pirotecnicos: PirotecnicoItem[] = [];
  for (const navio of cliente.navios) {
    if (navio.pirotecnicosBordoJson) {
      try {
        const parsed = JSON.parse(navio.pirotecnicosBordoJson);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            pirotecnicos.push({ ...item, _navio: navio.nome });
          }
        }
      } catch {}
    }
  }

  return (
    <Box sx={{ maxWidth: 1100, mx: "auto", p: { xs: 2, md: 4 } }}>
      <Paper elevation={3} sx={{ borderRadius: 4, overflow: "hidden" }}>
        <Box sx={{ bgcolor: "primary.main", color: "white", px: 3, py: 2 }}>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>{APP_CONFIG.name} — Portal do Cliente</Typography>
          <Typography variant="body2" sx={{ opacity: 0.85 }}>Bem-vindo, {cliente.nome}</Typography>
        </Box>

        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            borderBottom: 1,
            borderColor: "divider",
            "& .MuiTab-root": { textTransform: "none", fontWeight: 700, minHeight: 48, fontSize: "0.82rem" },
          }}
        >
          <Tab icon={<User size={16} />} iconPosition="start" label="Dados" value="dados" />
          <Tab icon={<Ship size={16} />} iconPosition="start" label={`Navios (${cliente.navios.length})`} value="navios" />
          <Tab icon={<ClipboardList size={16} />} iconPosition="start" label={`OS (${ordens.length})`} value="ordens" />
          <Tab icon={<Receipt size={16} />} iconPosition="start" label={`Faturas (${faturas.length})`} value="faturas" />
          <Tab icon={<Shield size={16} />} iconPosition="start" label="Equipamento" value="equipamento" />
        </Tabs>

        <Box sx={{ p: 3 }}>
          {contactMsg && <Alert severity={contactMsg.type} sx={{ mb: 2 }}>{contactMsg.text}</Alert>}

          {/* TAB: DADOS */}
          {tab === "dados" && (
            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>Dados Pessoais</Typography>
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
                  </>
                )}
              </Box>
            </Box>
          )}

          {/* TAB: NAVIOS */}
          {tab === "navios" && (
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Os Seus Navios</Typography>
              {cliente.navios.length === 0 ? (
                <Alert severity="info">Não tem navios registados.</Alert>
              ) : (
                <Stack spacing={2}>
                  {cliente.navios.map(n => (
                    <Paper key={n.id} variant="outlined" sx={{ p: 2 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Box>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{n.nome}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            Matrícula: {n.matricula} | Ilha: {n.ilha || "—"} | Tipo: {n.tipoPesca} | Lotação: {n.lotacao || "—"}
                          </Typography>
                        </Box>
                        <Chip label={`${n.extintores.length} ext. | ${n.coletes.length} coletes | ${n.epirbs.length} EPIRB`} size="small" variant="outlined" />
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
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Ordens de Serviço</Typography>
              {ordens.length === 0 ? (
                <Alert severity="info">Sem ordens de serviço registadas.</Alert>
              ) : (
                <Stack spacing={1.5}>
                  {ordens.map(o => (
                    <Paper key={o.id} variant="outlined" sx={{ p: 2 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                        <Box sx={{ flex: 1 }}>
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{o.numeroOrdem}</Typography>
                            <Chip label={o.status} size="small" color={statusColor(o.status) as any} sx={{ height: 20, fontSize: "0.7rem" }} />
                            {o.orcamentoStatus && (
                              <Chip label={`Orçamento: ${o.orcamentoStatus}`} size="small" color={orcamentoStatusColor(o.orcamentoStatus) as any} variant="outlined" sx={{ height: 20, fontSize: "0.7rem" }} />
                            )}
                          </Stack>
                          <Typography variant="caption" color="text.secondary">
                            {o.tipo} | {o.jangada ? `${o.jangada.brand || ""} ${o.jangada.model || ""} (${o.jangada.serial || ""})` : ""} | {formatDate(o.dataAbertura)}
                          </Typography>
                          {o.descricao && <Typography variant="body2" sx={{ mt: 0.5, fontSize: "0.82rem" }}>{o.descricao}</Typography>}
                          {o.valorTotal > 0 && <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.5 }}>Total: {formatCurrency(o.valorTotal)}</Typography>}
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
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Faturas</Typography>
              {faturas.length === 0 ? (
                <Alert severity="info">Sem faturas registadas.</Alert>
              ) : (
                <Stack spacing={1.5}>
                  {faturas.map(f => (
                    <Paper key={f.id} variant="outlined" sx={{ p: 2 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Box>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{f.numeroFatura}</Typography>
                            <Chip
                              label={f.pagamentoStatus}
                              size="small"
                              color={f.pagamentoStatus === "Pago" ? "success" : f.pagamentoStatus === "Pendente" ? "warning" : "default"}
                              sx={{ height: 20, fontSize: "0.7rem" }}
                            />
                          </Stack>
                          <Typography variant="caption" color="text.secondary">{formatDate(f.dataEmissao)}</Typography>
                        </Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{formatCurrency(f.valorTotal)}</Typography>
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Box>
          )}

          {/* TAB: EQUIPAMENTO */}
          {tab === "equipamento" && (
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Equipamento de Segurança</Typography>
              {cliente.navios.length === 0 ? (
                <Alert severity="info">Sem navios com equipamento registado.</Alert>
              ) : (
                <Stack spacing={3}>
                  {cliente.navios.map(navio => (
                    <Paper key={navio.id} variant="outlined" sx={{ p: 2.5 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
                        <Ship size={16} className="inline mr-1" />{navio.nome} ({navio.matricula})
                      </Typography>

                      {/* EXTINTORES */}
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "error.main", mb: 1 }}>
                          <Flame size={14} className="inline mr-1" />Extintores ({navio.extintores.length})
                        </Typography>
                        {navio.extintores.length === 0 ? (
                          <Typography variant="caption" color="text.secondary">Sem extintores registados.</Typography>
                        ) : (
                          <Stack spacing={1}>
                            {navio.extintores.map(e => (
                              <Paper key={e.id} variant="outlined" sx={{ p: 1.5, bgcolor: "grey.50" }}>
                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                  <Box>
                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{e.marca || ""} {e.modelo || ""} — {e.capacidadeKg || "?"}kg ({e.tipoAgente || "—"})</Typography>
                                    <Typography variant="caption" color="text.secondary">S/N: {e.serial || "—"} | Local: {e.localizacao || "—"} | Estado: {e.estado}</Typography>
                                  </Box>
                                  <Stack direction="row" spacing={0.5}>
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
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "warning.main", mb: 1 }}>
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
                                  <Stack direction="row" justifyContent="space-between" alignItems="center">
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
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "info.main", mb: 1 }}>
                          <LifeBuoy size={14} className="inline mr-1" />Coletes ({navio.coletes.length})
                        </Typography>
                        {navio.coletes.length === 0 ? (
                          <Typography variant="caption" color="text.secondary">Sem coletes registados.</Typography>
                        ) : (
                          <Stack spacing={1}>
                            {navio.coletes.map(c => (
                              <Paper key={c.id} variant="outlined" sx={{ p: 1.5, bgcolor: "grey.50" }}>
                                <Stack direction="row" justifyContent="space-between" alignItems="center">
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
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "success.main", mb: 1 }}>
                          <Radio size={14} className="inline mr-1" />EPIRB ({navio.epirbs.length})
                        </Typography>
                        {navio.epirbs.length === 0 ? (
                          <Typography variant="caption" color="text.secondary">Sem EPIRBs registados.</Typography>
                        ) : (
                          <Stack spacing={1}>
                            {navio.epirbs.map(ep => (
                              <Paper key={ep.id} variant="outlined" sx={{ p: 1.5, bgcolor: "grey.50" }}>
                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                  <Box>
                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{ep.marca || ""} {ep.modelo || ""} ({ep.tipo || "—"})</Typography>
                                    <Typography variant="caption" color="text.secondary">S/N: {ep.serial} | HEX ID: {ep.hexId || "—"} | Estado: {ep.estado}</Typography>
                                  </Box>
                                  <Stack direction="row" spacing={0.5}>
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
                  ))}
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
