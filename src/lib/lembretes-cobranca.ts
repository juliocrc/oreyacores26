import { createHmac, timingSafeEqual } from "crypto";
import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import nodemailer from "nodemailer";
import prisma from "@/lib/prisma";
import { sendSms } from "@/lib/sms-provider";
import { buildSmsMessage } from "@/lib/sms-config";
import { getBaseUrl } from "@/lib/auth";
import { formatDate, getLocalMidnight, parseFlexibleDate } from "@/lib/date-utils";
import type { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type LembreteCobrancaTipo = "primeiro" | "segundo";
export type LembreteCanal = "sms" | "email";

export type LembreteCobrancaConfig = {
  enabled: boolean;
  smsEnabled: boolean;
  emailEnabled: boolean;
  diasPrimeiroLembrete: number;
  diasSegundoLembrete: number;
  diasVencimento: number;
  smsTemplate: string;
  emailSubject: string;
  linkPublico: boolean;
};

export type LembreteRegistado = {
  tipo: LembreteCobrancaTipo;
  criadoEm: string;
  status: "pendente" | "enviado" | "anulado";
  mensagem?: string;
  telefone?: string;
  email?: string;
  canais: { canal: LembreteCanal; enviado: boolean; erro?: string }[];
  enviadoEm?: string;
  enviadoPor?: string;
};

export type CandidatoLembrete = {
  faturaId: number;
  tipo: LembreteCobrancaTipo;
  numeroFatura: string;
  numeroOrdem: string | null;
  clienteNome: string;
  telefone: string;
  email: string;
  valorTotal: number;
  dataEmissao: Date | null;
  dataVencimento: Date | null;
  pagamentoStatus: string;
  diasDesdeEmissao: number;
};

export type RascunhoLembrete = {
  faturaId: number;
  tipo: LembreteCobrancaTipo;
  criadoEm: string;
  mensagem: string;
  telefone: string;
  email: string;
};

// ---------------------------------------------------------------------------
// Configuração (JSON em _meta)
// ---------------------------------------------------------------------------

const CONFIG_PATH = path.join(process.cwd(), "_meta", "lembretes-cobranca-config.json");

export function buildDefaultLembreteCobrancaConfig(): LembreteCobrancaConfig {
  return {
    enabled: true,
    smsEnabled: true,
    emailEnabled: true,
    diasPrimeiroLembrete: 15,
    diasSegundoLembrete: 35,
    diasVencimento: 30,
    smsTemplate: `Olá {cliente},

{frase} fatura {numeroFatura} {numeroOrdem} no valor de €{valorTotal} {estadoVencimento}.

Estado de pagamento: {pagamentoStatus}.

{link}Agradecemos o seu pagamento.

Cumprimentos,
Orey Tecnica- Serviços Navais, Lda`,
    emailSubject: "Lembrete de pagamento — Fatura {numeroFatura}",
    linkPublico: true,
  };
}

function normalizePositiveNumber(value: unknown, fallback: number, max = 365): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(max, Math.round(parsed)) : fallback;
}

export async function getLembreteCobrancaConfig(): Promise<LembreteCobrancaConfig> {
  const defaults = buildDefaultLembreteCobrancaConfig();
  try {
    if (!existsSync(CONFIG_PATH)) return defaults;
    const parsed = JSON.parse(await readFile(CONFIG_PATH, "utf-8"));
    if (!parsed || typeof parsed !== "object") return defaults;
    const src = parsed as Record<string, unknown>;
    const bool = (key: string, fallback: boolean) =>
      typeof src[key] === "boolean" ? (src[key] as boolean) : fallback;
    return {
      enabled: bool("enabled", defaults.enabled),
      smsEnabled: bool("smsEnabled", defaults.smsEnabled),
      emailEnabled: bool("emailEnabled", defaults.emailEnabled),
      diasPrimeiroLembrete: normalizePositiveNumber(src.diasPrimeiroLembrete, defaults.diasPrimeiroLembrete),
      diasSegundoLembrete: normalizePositiveNumber(src.diasSegundoLembrete, defaults.diasSegundoLembrete),
      diasVencimento: normalizePositiveNumber(src.diasVencimento, defaults.diasVencimento),
      smsTemplate:
        typeof src.smsTemplate === "string" && String(src.smsTemplate).trim()
          ? String(src.smsTemplate)
          : defaults.smsTemplate,
      emailSubject:
        typeof src.emailSubject === "string" && String(src.emailSubject).trim()
          ? String(src.emailSubject)
          : defaults.emailSubject,
      linkPublico: bool("linkPublico", defaults.linkPublico),
    };
  } catch {
    return defaults;
  }
}

export async function saveLembreteCobrancaConfig(
  partial: Partial<LembreteCobrancaConfig>,
): Promise<LembreteCobrancaConfig> {
  const current = await getLembreteCobrancaConfig();
  const bool = (key: keyof LembreteCobrancaConfig, fallback: boolean) =>
    typeof partial[key] === "boolean" ? (partial[key] as boolean) : fallback;
  const next: LembreteCobrancaConfig = {
    enabled: bool("enabled", current.enabled),
    smsEnabled: bool("smsEnabled", current.smsEnabled),
    emailEnabled: bool("emailEnabled", current.emailEnabled),
    diasPrimeiroLembrete:
      partial.diasPrimeiroLembrete !== undefined
        ? normalizePositiveNumber(partial.diasPrimeiroLembrete, current.diasPrimeiroLembrete)
        : current.diasPrimeiroLembrete,
    diasSegundoLembrete:
      partial.diasSegundoLembrete !== undefined
        ? normalizePositiveNumber(partial.diasSegundoLembrete, current.diasSegundoLembrete)
        : current.diasSegundoLembrete,
    diasVencimento:
      partial.diasVencimento !== undefined
        ? normalizePositiveNumber(partial.diasVencimento, current.diasVencimento)
        : current.diasVencimento,
    smsTemplate:
      typeof partial.smsTemplate === "string" && String(partial.smsTemplate).trim()
        ? String(partial.smsTemplate)
        : current.smsTemplate,
    emailSubject:
      typeof partial.emailSubject === "string" && String(partial.emailSubject).trim()
        ? String(partial.emailSubject)
        : current.emailSubject,
    linkPublico: bool("linkPublico", current.linkPublico),
  };
  try {
    await mkdir(path.dirname(CONFIG_PATH), { recursive: true });
    await writeFile(CONFIG_PATH, JSON.stringify(next, null, 2), "utf-8");
  } catch (error) {
    console.error("[lembretes-cobranca] Erro ao guardar configuração:", error);
  }
  return next;
}

// ---------------------------------------------------------------------------
// Metadados da fatura (rascunhos/histórico de lembretes)
// ---------------------------------------------------------------------------

function lerMetadadosFatura(metadados: string | null | undefined): Record<string, unknown> {
  if (!metadados) return {};
  try {
    const parsed = JSON.parse(metadados);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function lerLembretesFatura(metadados: string | null | undefined): LembreteRegistado[] {
  const meta = lerMetadadosFatura(metadados);
  if (!Array.isArray(meta.lembretesCobranca)) return [];
  return meta.lembretesCobranca.filter(
    (entry): entry is LembreteRegistado =>
      !!entry && typeof entry === "object" && "tipo" in entry,
  );
}

export function registarLembretesEmMetadados(
  metadados: string | null | undefined,
  lembretes: LembreteRegistado[],
): string {
  const meta = lerMetadadosFatura(metadados);
  meta.lembretesCobranca = lembretes.slice(-50);
  return JSON.stringify(meta);
}

export function registarLembreteEmMetadados(
  metadados: string | null | undefined,
  novo: LembreteRegistado,
): string {
  return registarLembretesEmMetadados(metadados, [...lerLembretesFatura(metadados), novo]);
}

// ---------------------------------------------------------------------------
// Lógica pura de deteção (testável sem BD)
// ---------------------------------------------------------------------------

export function temLembrete(
  metadados: string | null | undefined,
  tipo: LembreteCobrancaTipo,
  status: LembreteRegistado["status"],
): boolean {
  return lerLembretesFatura(metadados).some((l) => l.tipo === tipo && l.status === status);
}

export function diasEntreDatas(desde: Date | string | null | undefined, ate: Date | string | null | undefined): number | null {
  const a = parseFlexibleDate(desde);
  const b = parseFlexibleDate(ate);
  if (!a || !b) return null;
  return Math.floor((getLocalMidnight(b).getTime() - getLocalMidnight(a).getTime()) / 86400000);
}

export function adicionarDias(data: Date | string | null | undefined, dias: number): Date | null {
  const d = parseFlexibleDate(data);
  if (!d) return null;
  const copy = new Date(d);
  copy.setDate(copy.getDate() + dias);
  return copy;
}

export function calcularTipoLembreteCobranca(input: {
  dataEmissao: Date | string | null | undefined;
  metadados: string | null | undefined;
  config: LembreteCobrancaConfig;
  hoje?: Date;
}): LembreteCobrancaTipo | null {
  const { dataEmissao, metadados, config } = input;
  const emissao = parseFlexibleDate(dataEmissao);
  if (!emissao) return null;

  const diasDesdeEmissao = diasEntreDatas(emissao, input.hoje || new Date());
  if (diasDesdeEmissao === null || diasDesdeEmissao < config.diasPrimeiroLembrete) return null;

  if (diasDesdeEmissao >= config.diasPrimeiroLembrete && !temLembrete(metadados, "primeiro", "enviado")) {
    return "primeiro";
  }
  if (diasDesdeEmissao >= config.diasSegundoLembrete && !temLembrete(metadados, "segundo", "enviado")) {
    return "segundo";
  }
  return null;
}

export function construirVarsLembrete(input: {
  cliente: string;
  numeroFatura: string;
  numeroOrdem: string | null;
  valorTotal: number;
  dataEmissao: Date | string | null;
  dataVencimento: Date | string | null;
  pagamentoStatus: string;
  tipo: LembreteCobrancaTipo;
  link: string;
}): Record<string, string> {
  const numeroOrdem = input.numeroOrdem ? `(OT ${input.numeroOrdem})` : "";
  const frase = input.tipo === "segundo" ? "A sua" : "Recordamos que a sua";
  const estadoVencimento =
    input.tipo === "segundo"
      ? `encontra-se em atraso desde ${formatDate(input.dataVencimento)}`
      : `tem vencimento a ${formatDate(input.dataVencimento)}`;
  const link = input.link ? `Consulte o estado da fatura: ${input.link}\n` : "";
  return {
    cliente: input.cliente,
    numeroFatura: input.numeroFatura,
    numeroOrdem,
    valorTotal: Number(input.valorTotal || 0).toFixed(2).replace(".", ","),
    dataEmissao: formatDate(input.dataEmissao),
    dataVencimento: formatDate(input.dataVencimento),
    pagamentoStatus: input.pagamentoStatus,
    tipo: input.tipo,
    frase,
    estadoVencimento,
    link,
  };
}

export function construirEmailHtmlLembrete(vars: Record<string, string>): string {
  return `
<!DOCTYPE html>
<html lang="pt">
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;color:#333;margin:0;padding:0;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <h2 style="color:#1a56db;margin:0 0 16px;">Lembrete de pagamento</h2>
    <p>Exmo(a) Sr(a). <strong>${vars.cliente}</strong>,</p>
    <p>${vars.frase} fatura <strong>${vars.numeroFatura}</strong> no valor de <strong>€ ${vars.valorTotal}</strong> ${vars.estadoVencimento}.</p>
    <table style="border-collapse:collapse;width:100%;margin:16px 0;">
      <tr>
        <td style="padding:8px 10px;border:1px solid #ddd;background:#f3f4f6;font-weight:bold;">Fatura</td>
        <td style="padding:8px 10px;border:1px solid #ddd;">${vars.numeroFatura}</td>
      </tr>
      <tr>
        <td style="padding:8px 10px;border:1px solid #ddd;background:#f3f4f6;font-weight:bold;">Valor</td>
        <td style="padding:8px 10px;border:1px solid #ddd;">€ ${vars.valorTotal}</td>
      </tr>
      <tr>
        <td style="padding:8px 10px;border:1px solid #ddd;background:#f3f4f6;font-weight:bold;">Estado de pagamento</td>
        <td style="padding:8px 10px;border:1px solid #ddd;">${vars.pagamentoStatus}</td>
      </tr>
    </table>
    ${vars.link ? `<p><a href="${vars.link}">Consultar estado da fatura online</a></p>` : ""}
    <p>Agradecemos o seu pagamento.</p>
    <p style="margin-top:24px;">Cumprimentos,<br/><strong>Orey Tecnica- Serviços Navais, Lda</strong></p>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Token público de estado da fatura (sem schema novo)
// ---------------------------------------------------------------------------

function getPublicTokenSecret(): string {
  const secret = process.env.PUBLIC_FATURA_TOKEN_SECRET || process.env.CRON_SECRET;
  if (!secret) throw new Error("PUBLIC_FATURA_TOKEN_SECRET ou CRON_SECRET não configurado.");
  return secret;
}

export function getPublicFaturaToken(faturaId: number): string {
  const digest = createHmac("sha256", getPublicTokenSecret()).update(String(faturaId)).digest("hex").slice(0, 24);
  return `${faturaId}-${digest}`;
}

export function resolvePublicFaturaToken(token: string): number | null {
  const match = /^(\d+)-([a-f0-9]+)$/.exec(String(token || "").trim());
  if (!match) return null;
  const id = Number(match[1]);
  if (!Number.isInteger(id) || id <= 0) return null;
  const expected = getPublicFaturaToken(id).split("-")[1];
  const provided = match[2];
  try {
    return timingSafeEqual(Buffer.from(provided, "utf8"), Buffer.from(expected, "utf8")) ? id : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Dados
// ---------------------------------------------------------------------------

const FATURA_SELECT = {
  id: true,
  numeroFatura: true,
  valorTotal: true,
  dataEmissao: true,
  pagamentoStatus: true,
  metadados: true,
  cliente: { select: { nome: true, telmovel: true, telefone: true, email: true } },
  ordemServicos: {
    select: { ordemServico: { select: { numeroOrdem: true } } },
    take: 1,
    orderBy: { id: "desc" },
  },
} as const;

type FaturaComDados = Prisma.FaturaGetPayload<{ select: typeof FATURA_SELECT }>;

function numeroOrdemDaFatura(f: FaturaComDados): string | null {
  return f.ordemServicos?.[0]?.ordemServico?.numeroOrdem ?? null;
}

export async function encontrarCandidatosLembreteCobranca(opts?: {
  hoje?: Date;
}): Promise<{ config: LembreteCobrancaConfig; candidatos: CandidatoLembrete[] }> {
  const config = await getLembreteCobrancaConfig();
  const hoje = opts?.hoje || new Date();
  if (!config.enabled) return { config, candidatos: [] };

  const faturas = await prisma.fatura.findMany({
    where: {
      cancelada: false,
      pagamentoStatus: { in: ["Pendente", "Pago Parcialmente"] },
    },
    select: FATURA_SELECT,
  });

  const candidatos: CandidatoLembrete[] = [];
  for (const f of faturas) {
    const tipo = calcularTipoLembreteCobranca({
      dataEmissao: f.dataEmissao,
      metadados: f.metadados,
      config,
      hoje,
    });
    if (!tipo) continue;
    const diasDesdeEmissao = diasEntreDatas(f.dataEmissao, hoje) ?? 0;
    candidatos.push({
      faturaId: f.id,
      tipo,
      numeroFatura: f.numeroFatura,
      numeroOrdem: numeroOrdemDaFatura(f),
      clienteNome: String(f.cliente?.nome || "").trim() || "Cliente",
      telefone: String(f.cliente?.telmovel || f.cliente?.telefone || "").trim(),
      email: String(f.cliente?.email || "").trim(),
      valorTotal: Number(f.valorTotal || 0),
      dataEmissao: f.dataEmissao,
      dataVencimento: adicionarDias(f.dataEmissao, config.diasVencimento),
      pagamentoStatus: f.pagamentoStatus,
      diasDesdeEmissao,
    });
  }
  return { config, candidatos };
}

export async function gerarRascunhosLembretesCobranca(opts?: { hoje?: Date }): Promise<{
  config: LembreteCobrancaConfig;
  gerados: number;
  jaExistentes: number;
  rascunhos: RascunhoLembrete[];
}> {
  const config = await getLembreteCobrancaConfig();
  const hoje = opts?.hoje || new Date();
  if (!config.enabled) return { config, gerados: 0, jaExistentes: 0, rascunhos: [] };

  const faturas = await prisma.fatura.findMany({
    where: {
      cancelada: false,
      pagamentoStatus: { in: ["Pendente", "Pago Parcialmente"] },
    },
    select: FATURA_SELECT,
  });

  let gerados = 0;
  let jaExistentes = 0;
  const rascunhos: RascunhoLembrete[] = [];

  for (const f of faturas) {
    const tipo = calcularTipoLembreteCobranca({
      dataEmissao: f.dataEmissao,
      metadados: f.metadados,
      config,
      hoje,
    });
    if (!tipo) continue;

    if (temLembrete(f.metadados, tipo, "pendente") || temLembrete(f.metadados, tipo, "enviado")) {
      jaExistentes += 1;
      continue;
    }

    const telefone = String(f.cliente?.telmovel || f.cliente?.telefone || "").trim();
    const email = String(f.cliente?.email || "").trim();
    const link = config.linkPublico
      ? `${getBaseUrl().replace(/\/$/, "")}/public/fatura/${getPublicFaturaToken(f.id)}`
      : "";

    const mensagem = buildSmsMessage(
      config.smsTemplate,
      construirVarsLembrete({
        cliente: String(f.cliente?.nome || "").trim() || "Cliente",
        numeroFatura: f.numeroFatura,
        numeroOrdem: numeroOrdemDaFatura(f),
        valorTotal: Number(f.valorTotal || 0),
        dataEmissao: f.dataEmissao,
        dataVencimento: adicionarDias(f.dataEmissao, config.diasVencimento),
        pagamentoStatus: f.pagamentoStatus,
        tipo,
        link,
      }),
    );

    const registo: LembreteRegistado = {
      tipo,
      criadoEm: hoje.toISOString(),
      status: "pendente",
      mensagem,
      telefone,
      email,
      canais: [],
    };

    await prisma.fatura.update({
      where: { id: f.id },
      data: { metadados: registarLembreteEmMetadados(f.metadados, registo) },
    });

    gerados += 1;
    rascunhos.push({ faturaId: f.id, tipo, criadoEm: registo.criadoEm, mensagem, telefone, email });
  }

  return { config, gerados, jaExistentes, rascunhos };
}

export async function listarLembretesCobrancaPendentes(): Promise<{
  config: LembreteCobrancaConfig;
  pendentes: Array<{
    faturaId: number;
    tipo: LembreteCobrancaTipo;
    criadoEm: string;
    mensagem: string;
    telefone: string;
    email: string;
    numeroFatura: string;
    numeroOrdem: string | null;
    clienteNome: string;
    valorTotal: number;
    dataEmissao: Date | null;
    dataVencimento: Date | null;
    pagamentoStatus: string;
  }>;
}> {
  const config = await getLembreteCobrancaConfig();

  const faturas = await prisma.fatura.findMany({
    where: { cancelada: false },
    select: FATURA_SELECT,
  });

  const pendentes: Array<{
    faturaId: number;
    tipo: LembreteCobrancaTipo;
    criadoEm: string;
    mensagem: string;
    telefone: string;
    email: string;
    numeroFatura: string;
    numeroOrdem: string | null;
    clienteNome: string;
    valorTotal: number;
    dataEmissao: Date | null;
    dataVencimento: Date | null;
    pagamentoStatus: string;
  }> = [];

  for (const f of faturas) {
    const lembretes = lerLembretesFatura(f.metadados);
    for (const l of lembretes) {
      if (l.status !== "pendente") continue;
      pendentes.push({
        faturaId: f.id,
        tipo: l.tipo,
        criadoEm: l.criadoEm,
        mensagem: l.mensagem || "",
        telefone: l.telefone || String(f.cliente?.telmovel || f.cliente?.telefone || "").trim(),
        email: l.email || String(f.cliente?.email || "").trim(),
        numeroFatura: f.numeroFatura,
        numeroOrdem: numeroOrdemDaFatura(f),
        clienteNome: String(f.cliente?.nome || "").trim() || "Cliente",
        valorTotal: Number(f.valorTotal || 0),
        dataEmissao: f.dataEmissao,
        dataVencimento: adicionarDias(f.dataEmissao, config.diasVencimento),
        pagamentoStatus: f.pagamentoStatus,
      });
    }
  }

  pendentes.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm) || a.faturaId - b.faturaId);
  return { config, pendentes };
}

// ---------------------------------------------------------------------------
// Envio (após confirmação do operador — nunca automático)
// ---------------------------------------------------------------------------

function criarTransporter(): nodemailer.Transporter | null {
  if (!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

export async function enviarEmailLembreteCobranca(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  const transporter = criarTransporter();
  if (!transporter) return { ok: false, error: "SMTP não configurado." };
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || `"Orey Tecnica- Serviços Navais, Lda — Gestor Naval" <${process.env.SMTP_USER}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    return { ok: true };
  } catch (error) {
    console.error("[lembretes-cobranca] Erro ao enviar e-mail:", error);
    return { ok: false, error: error instanceof Error ? error.message : "Erro ao enviar e-mail." };
  }
}

export async function enviarLembreteCobranca(input: {
  faturaId: number;
  tipo: LembreteCobrancaTipo;
  mensagem: string;
  canais: LembreteCanal[];
  usuario?: string;
}): Promise<{
  ok: boolean;
  erro?: string;
  canais: LembreteRegistado["canais"];
}> {
  const fatura = await prisma.fatura.findUnique({
    where: { id: input.faturaId },
    select: {
      id: true,
      numeroFatura: true,
      metadados: true,
      cliente: { select: { nome: true, telmovel: true, telefone: true, email: true } },
    },
  });
  if (!fatura) return { ok: false, erro: "Fatura não encontrada.", canais: [] };

  const lembretes = lerLembretesFatura(fatura.metadados);
  const idx = lembretes.findIndex((l) => l.tipo === input.tipo && l.status === "pendente");
  if (idx === -1) {
    return { ok: false, erro: "Não existe lembrete pendente deste tipo para esta fatura.", canais: [] };
  }

  const config = await getLembreteCobrancaConfig();
  const telefone = String(fatura.cliente?.telmovel || fatura.cliente?.telefone || "").trim();
  const email = String(fatura.cliente?.email || "").trim();
  const clienteNome = String(fatura.cliente?.nome || "").trim() || "Cliente";
  const mensagemFinal = String(input.mensagem || "").trim();
  const canais: LembreteRegistado["canais"] = [];

  if (input.canais.includes("sms")) {
    if (!config.smsEnabled) {
      canais.push({ canal: "sms", enviado: false, erro: "Envio de SMS desativado na configuração." });
    } else if (!telefone) {
      canais.push({ canal: "sms", enviado: false, erro: "Cliente sem telemóvel registado." });
    } else {
      const res = await sendSms(telefone, mensagemFinal);
      canais.push({ canal: "sms", enviado: res.ok, erro: res.error });
    }
  }

  if (input.canais.includes("email")) {
    if (!config.emailEnabled) {
      canais.push({ canal: "email", enviado: false, erro: "Envio de e-mail desativado na configuração." });
    } else if (!email) {
      canais.push({ canal: "email", enviado: false, erro: "Cliente sem e-mail registado." });
    } else {
      const vars = construirVarsLembrete({
        cliente: clienteNome,
        numeroFatura: fatura.numeroFatura,
        numeroOrdem: null,
        valorTotal: 0,
        dataEmissao: null,
        dataVencimento: null,
        pagamentoStatus: "",
        tipo: input.tipo,
        link: "",
      });
      const subject = buildSmsMessage(config.emailSubject, { numeroFatura: fatura.numeroFatura, ...vars });
      const html = construirEmailHtmlLembrete({
        ...vars,
        cliente: clienteNome,
        numeroFatura: fatura.numeroFatura,
      });
      const res = await enviarEmailLembreteCobranca({ to: email, subject, html });
      canais.push({ canal: "email", enviado: res.ok, erro: res.error });
    }
  }

  if (canais.length === 0) {
    return { ok: false, erro: "Nenhum canal de envio selecionado.", canais };
  }

  const qualquerEnviado = canais.some((c) => c.enviado);
  const agora = new Date().toISOString();
  const registo: LembreteRegistado = {
    tipo: input.tipo,
    criadoEm: lembretes[idx].criadoEm,
    status: qualquerEnviado ? "enviado" : "pendente",
    mensagem: mensagemFinal,
    telefone,
    email,
    canais,
    ...(qualquerEnviado ? { enviadoEm: agora, enviadoPor: input.usuario || "sistema" } : {}),
  };
  lembretes[idx] = registo;

  await prisma.fatura.update({
    where: { id: fatura.id },
    data: { metadados: registarLembretesEmMetadados(fatura.metadados, lembretes) },
  });

  const detalhes = canais.map((c) => `${c.canal}: ${c.enviado ? "enviado" : "falhou"}`).join(", ");
  const erros = canais.filter((c) => c.erro).map((c) => c.erro).join("; ");
  try {
    await prisma.auditoria.create({
      data: {
        tabela: "Fatura",
        tipoOperacao: qualquerEnviado ? "SEND_ALERT" : "SEND_ERROR",
        idRegisto: fatura.id,
        descricao: `Lembrete de cobrança (${input.tipo}) — fatura ${fatura.numeroFatura}. ${detalhes}${erros ? ` — ${erros}` : ""}`,
        usuario: input.usuario || "sistema",
      },
    });
  } catch (error) {
    console.warn("[lembretes-cobranca] Erro ao registar auditoria:", error);
  }

  return { ok: qualquerEnviado, erro: erros || undefined, canais };
}
