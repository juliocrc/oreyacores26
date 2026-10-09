import prisma from "@/lib/prisma";
import { sendSms } from "@/lib/sms-provider";
import {
  buildSmsMessage,
  buildDefaultSmsConfig,
  getSmsConfig,
  type SmsNotifyType,
} from "@/lib/sms-config";

type ClientContact = { name: string; phone: string };

async function resolveClientContact(jangadaId: number): Promise<ClientContact | null> {
  if (!jangadaId || jangadaId <= 0) return null;

  try {
    const ordem = await prisma.ordemServico.findFirst({
      where: { jangadaId, clienteId: { not: null } },
      orderBy: [{ id: "desc" }],
      select: { cliente: { select: { nome: true, telmovel: true, telefone: true } } },
    });
    if (ordem?.cliente) {
      const phone = String(ordem.cliente.telmovel || ordem.cliente.telefone || "").trim();
      if (phone) return { name: String(ordem.cliente.nome || "").trim(), phone };
    }
  } catch (error) {
    console.error("[notify-jangada-sms] Erro ao resolver cliente via OrdemServico:", error);
  }

  try {
    const jangada = await prisma.jangada.findUnique({
      where: { id: jangadaId },
      select: { shipId: true },
    });
    if (jangada?.shipId) {
      const navio = await prisma.navio.findUnique({
        where: { id: jangada.shipId },
        select: { cliente: { select: { nome: true, telmovel: true, telefone: true } } },
      });
      if (navio?.cliente) {
        const phone = String(navio.cliente.telmovel || navio.cliente.telefone || "").trim();
        if (phone) return { name: String(navio.cliente.nome || "").trim(), phone };
      }
    }
  } catch (error) {
    console.error("[notify-jangada-sms] Erro ao resolver cliente via Navio:", error);
  }

  return null;
}

async function resolveJangadaSerial(jangadaId: number): Promise<string> {
  try {
    const jangada = await prisma.jangada.findUnique({
      where: { id: jangadaId },
      select: { serial: true },
    });
    return jangada?.serial || "";
  } catch {
    return "";
  }
}

/** Devolve "a bordo do navio X" (ou "") para usar na variável {navio} dos SMS. */
async function resolveJangadaNavio(jangadaId: number): Promise<string> {
  try {
    const jangada = await prisma.jangada.findUnique({
      where: { id: jangadaId },
      select: { shipId: true, shipNameManual: true },
    });
    if (!jangada) return "";
    if (jangada.shipId) {
      const navio = await prisma.navio.findUnique({
        where: { id: jangada.shipId },
        select: { nome: true },
      });
      const nome = String(navio?.nome || "").trim();
      if (nome) return `a bordo do navio ${nome}`;
    }
    const manual = String(jangada.shipNameManual || "").trim();
    return manual ? `a bordo do navio ${manual}` : "";
  } catch {
    return "";
  }
}

function formatDataBr(data?: string | Date | null): string {
  if (!data) return "";
  const date = typeof data === "string" ? new Date(data) : data;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export type SmsNotificationLog = {
  type: string;
  ativo: string;
  phone: string;
  status: "sent" | "error" | "pending" | "skipped";
  error?: string;
  message?: string;
};

async function readQueueMeta(jangadaId: number) {
  const queue = await prisma.serviceStationQueue.findFirst({
    where: { jangadaId },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: { id: true, observacoes: true },
  });
  if (!queue) return null;

  let meta: Record<string, unknown> = {};
  try {
    const parsed = queue.observacoes ? JSON.parse(queue.observacoes) : {};
    if (parsed && typeof parsed === "object") meta = parsed as Record<string, unknown>;
  } catch {
    // observações em texto simples: começa vazio
  }
  return { queueId: queue.id, meta };
}

async function recordSmsLog(jangadaId: number, entry: SmsNotificationLog) {
  try {
    const ctx = await readQueueMeta(jangadaId);
    if (!ctx) return;
    const list = Array.isArray(ctx.meta.smsNotifications) ? (ctx.meta.smsNotifications as SmsNotificationLog[]) : [];
    list.push(entry);
    ctx.meta.smsNotifications = list.slice(-30);
    await prisma.serviceStationQueue.update({
      where: { id: ctx.queueId },
      data: { observacoes: JSON.stringify(ctx.meta) },
    });
  } catch (error) {
    console.warn("[notify-jangada-sms] Erro ao registar log de SMS:", error);
  }
}

export async function recordComunicacao(opts: {
  jangadaId: number;
  serial: string;
  channel: string;
  clientName: string;
  phone: string;
  message: string;
  ok: boolean;
  user?: string;
}) {
  try {
    const result = opts.ok ? "enviada" : "falhou";
    await prisma.auditoria.create({
      data: {
        tabela: "Comunicacao",
        tipoOperacao: opts.ok ? "SEND_ALERT" : "SEND_ERROR",
        idRegisto: opts.jangadaId,
        descricao: `[SMS lembrete] Notificação ${opts.channel.toUpperCase()} ${result} para o cliente ${opts.clientName} (${opts.phone}) sobre a jangada ${opts.serial}. Mensagem: "${opts.message}"`,
        usuario: opts.user || "sistema",
      },
    });
  } catch (error) {
    console.warn("[notify-jangada-sms] Erro ao registar comunicação:", error);
  }
}

async function readSmsLogs(jangadaId: number): Promise<SmsNotificationLog[]> {
  try {
    const ctx = await readQueueMeta(jangadaId);
    if (!ctx) return [];
    return Array.isArray(ctx.meta.smsNotifications) ? (ctx.meta.smsNotifications as SmsNotificationLog[]) : [];
  } catch {
    return [];
  }
}

export async function hasPendingSms(jangadaId: number, type: SmsNotifyType): Promise<SmsNotificationLog | null> {
  const logs = await readSmsLogs(jangadaId);
  return logs.find((log) => log.type === type && log.status === "pending") || null;
}

export async function pendingSmsCount(jangadaId: number): Promise<number> {
  const logs = await readSmsLogs(jangadaId);
  return logs.filter((log) => log.status === "pending").length;
}

export async function confirmPendingSms(
  jangadaId: number,
  type: SmsNotifyType,
): Promise<{ sent: boolean; reason?: string; phone?: string }> {
  const pending = await hasPendingSms(jangadaId, type);
  if (!pending) return { sent: false, reason: "Sem SMS pendente para confirmar." };

  const result = await sendSms(pending.phone, pending.message || "");
  await recordSmsLog(jangadaId, {
    type,
    ativo: new Date().toISOString(),
    phone: pending.phone,
    status: result.ok ? "sent" : "error",
    error: result.error,
  });
  return { sent: result.ok, reason: result.error, phone: pending.phone };
}

type NotifyOptions = {
  vars?: Record<string, string>;
  useConfig?: boolean; // respeita o gate "enabled" da config (false => sempre envia)
  confirmada?: boolean; // true quando o operador confirmou o envio pendente
  customText?: string; // mensagem editada pelo operador (ignora o template)
};

async function notifyJangada(
  jangadaId: number,
  type: SmsNotifyType,
  options?: NotifyOptions,
): Promise<{ sent: boolean; pending?: boolean; reason?: string; phone?: string; message?: string }> {
  try {
    const config = await getSmsConfig();
    const enabled = config.enabled?.[type];
    if (options?.useConfig !== false && enabled === false) {
      return { sent: false, reason: "Envio desativado na configuração." };
    }

    const [contact, serial, navio, logs] = await Promise.all([
      resolveClientContact(jangadaId),
      resolveJangadaSerial(jangadaId),
      resolveJangadaNavio(jangadaId),
      readSmsLogs(jangadaId),
    ]);

    const alreadySent = logs.some((log) => log.type === type && log.status === "sent");
    if (alreadySent && options?.useConfig !== false) {
      return { sent: false, reason: `Notificação "${type}" já foi enviada para esta jangada.` };
    }

    if (!contact) return { sent: false, reason: "Cliente/telemóvel não encontrado" };

    const template = options?.customText?.trim()
      ? options.customText.trim()
      : (config.texts?.[type] || buildDefaultSmsConfig().texts[type]);
    const message = buildSmsMessage(template, {
      cliente: contact.name,
      serial,
      navio,
      ...(options?.vars || {}),
    });

    if (config.requerConfirmacao && options?.confirmada !== true) {
      await recordSmsLog(jangadaId, {
        type,
        ativo: new Date().toISOString(),
        phone: contact.phone,
        status: "pending",
        message,
      });
      return { sent: false, pending: true, phone: contact.phone, message, reason: "Aguardando confirmação." };
    }

    const result = await sendSms(contact.phone, message);
    await recordSmsLog(jangadaId, {
      type,
      ativo: new Date().toISOString(),
      phone: contact.phone,
      status: result.ok ? "sent" : "error",
      error: result.error,
      message,
    });
    await recordComunicacao({
      jangadaId,
      serial,
      channel: type,
      clientName: contact.name,
      phone: contact.phone,
      message,
      ok: result.ok,
    });

    return { sent: result.ok, reason: result.error, phone: contact.phone, message };
  } catch (error) {
    console.error("[notify-jangada-sms] Erro:", error);
    return { sent: false, reason: "Erro interno" };
  }
}

export async function notifyJangadaRececionada(
  jangadaId: number,
  options?: { expectedDeliveryDate?: string | Date | null; useConfig?: boolean; confirmada?: boolean },
) {
  return notifyJangada(jangadaId, "rececionada", {
    vars: { data: formatDataBr(options?.expectedDeliveryDate || null) },
    useConfig: options?.useConfig ?? true,
    confirmada: options?.confirmada ?? true,
  });
}

export async function notifyJangadaEnviada(
  jangadaId: number,
  options?: { transitario?: string; trackingCode?: string; useConfig?: boolean; confirmada?: boolean },
) {
  const transitario = String(options?.transitario || "").trim();
  const tracking = String(options?.trackingCode || "").trim();
  return notifyJangada(jangadaId, "enviada", {
    vars: {
      transitario: transitario ? ` com ${transitario}` : "",
      tracking: tracking ? `\nCódigo de tracking: ${tracking}` : "",
    },
    useConfig: options?.useConfig ?? true,
    confirmada: options?.confirmada ?? true,
  });
}

export async function notifyJangadaProntaEntrega(
  jangadaId: number,
  options?: { transitario?: string; useConfig?: boolean; confirmada?: boolean },
) {
  const transitario = String(options?.transitario || "").trim();
  return notifyJangada(jangadaId, "pronta_entrega", {
    vars: { transitario: transitario ? ` e será devolvida pelo transitário ${transitario}` : "" },
    useConfig: options?.useConfig ?? true,
    confirmada: options?.confirmada ?? true,
  });
}

export async function notifyJangadaLembreteValidade(
  jangadaId: number,
  options?: { dataProxInspecao?: string | Date | null; useConfig?: boolean; confirmada?: boolean; customText?: string },
) {
  return notifyJangada(jangadaId, "lembrete_validade", {
    vars: { data: formatDataBr(options?.dataProxInspecao || null) },
    useConfig: options?.useConfig ?? true,
    confirmada: options?.confirmada ?? true,
    customText: options?.customText,
  });
}

export async function resolveLembreteValidadeInfo(
  jangadaId: number,
  dataProxInspecao?: string | Date | null,
): Promise<{ name: string; phone: string; serial: string; message: string } | null> {
  try {
    const config = await getSmsConfig();
    const [contact, serial, navio] = await Promise.all([
      resolveClientContact(jangadaId),
      resolveJangadaSerial(jangadaId),
      resolveJangadaNavio(jangadaId),
    ]);
    if (!contact) return null;
    const template = config.texts?.lembrete_validade || buildDefaultSmsConfig().texts.lembrete_validade;
    const message = buildSmsMessage(template, {
      cliente: contact.name,
      serial,
      navio,
      data: formatDataBr(dataProxInspecao || null),
    });
    return { name: contact.name, phone: contact.phone, serial, message };
  } catch (error) {
    console.error("[notify-jangada-sms] Erro ao resolver lembrete:", error);
    return null;
  }
}

export async function tryNotifySms<T>(callback: () => Promise<T>): Promise<T | { sent: false; reason: string }> {
  try {
    return await callback();
  } catch (error) {
    console.error("[notify-jangada-sms] Falha não bloqueante:", error);
    return { sent: false, reason: "Erro não bloqueante" };
  }
}