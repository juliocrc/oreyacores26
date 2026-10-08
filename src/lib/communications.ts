import { sendSms } from "./sms-provider";
import { normalizeE164 } from "./textbee-sms";
import { sendWhatsAppApi, whatsappApiConfigurado } from "./whatsapp-provider";
import prisma from "./prisma";

export type ComunicacaoTipo = "SMS" | "WHATSAPP" | "EMAIL" | "CHAMADA";

export type ComunicacaoRecebidaInput = {
  tipo: ComunicacaoTipo;
  mensagem: string;
  /** Número/email de quem enviou a mensagem. */
  remetente: string;
  /** Nome de perfil do remetente, quando conhecido. */
  nomeRemetente?: string;
  /** Identificador de origem: whatsapp-api, zapier-webhook, sms-inbound, email-inbound, etc. */
  canal?: string;
  /** ID único devolvido pelo provider (wamid, messageId) — usado para deduplicar reentregas. */
  providerId?: string;
  assunto?: string;
  recebidoEm?: Date;
  ref?: ComunicacaoRef;
};

export type ComunicacaoRef = {
  refTipo?: string;
  refId?: number | null;
  clienteId?: number | null;
  jangadaId?: number | null;
  ordemServicoId?: number | null;
};

export type EnvioComunicacaoInput = {
  tipo: ComunicacaoTipo;
  mensagem: string;
  assunto?: string;
  destinatario?: string;
  ref?: ComunicacaoRef;
  enviadoPor?: string;
};

type DadosVistoria = {
  owner?: string | null;
  model?: string | null;
  serial?: string | null;
  capacity?: number | string | null;
  ship?: string | null;
  validade?: string | null;
};

function formatarData(raw?: string | Date | null): string {
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return String(raw);
  return date.toLocaleDateString("pt-PT");
}

/** Resolve o telemóvel preferencial de um cliente (ficha do cliente tem prioridade). */
export function getClientePhone(cliente?: { telmovel?: string | null; telefone?: string | null } | null): string {
  const tel = String(cliente?.telmovel || "").trim();
  if (tel) return tel;
  return String(cliente?.telefone || "").trim();
}

export function mensagemRecordacaoVistoria(d: DadosVistoria): string {
  return [
    `Olá ${d.owner || "Exmo. Cliente"},`,
    ``,
    `Relembramos que a vistoria técnica da jangada salva-vidas ${d.model || "—"} (${d.capacity || "—"}P, Série: ${d.serial || "—"}) instalada na embarcação "${d.ship || "—"}" tem validade prevista até ${formatarData(d.validade)}.`,
    ``,
    `Para garantir a segurança da embarcação e a conformidade legal, confirme por favor se podemos agendar a vistoria e a emissão do novo certificado.`,
    ``,
    `Ficamos a aguardar o seu contacto.`,
    ``,
    `Com os melhores cumprimentos,`,
    `Orey Azores`,
  ].join("\n");
}

export function mensagemOrcamentoAprovado(d: { owner?: string | null; model?: string | null; serial?: string | null; valor?: number | string | null; numero?: string | null }): string {
  return [
    `Olá ${d.owner || "Exmo. Cliente"},`,
    ``,
    `O orçamento ${d.numero ? `n.º ${d.numero} ` : ""}para a vistoria da jangada salva-vidas ${d.model || "—"} (Série: ${d.serial || "—"}) foi aprovado.`,
    d.valor ? `Valor: ${d.valor}.` : "",
    ``,
    `Entraremos em contacto para agendar a data da intervenção.`,
    ``,
    `Orey Azores`,
  ].filter(Boolean).join("\n");
}

export function mensagemCertificadoPronto(d: { owner?: string | null; model?: string | null; serial?: string | null }): string {
  return [
    `Olá ${d.owner || "Exmo. Cliente"},`,
    ``,
    `Informamos que o certificado da vistoria da jangada salva-vidas ${d.model || "—"} (Série: ${d.serial || "—"}) já está disponível.`,
    ``,
    `Estamos à sua disposição para qualquer esclarecimento.`,
    ``,
    `Orey Azores`,
  ].filter(Boolean).join("\n");
}

export function buildWhatsAppUrl(phoneRaw: string | undefined | null, message: string): string {
  const phone = normalizeE164(phoneRaw || "");
  const base = phone ? `https://wa.me/${phone.replace("+", "")}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(message)}`;
}

/**
 * Envia uma comunicação e regista-a no histórico.
 * Para SMS usa o TextBee; para WhatsApp devolve o link wa.me (fica registado como "pendente").
 */
export async function enviarComunicacao(input: EnvioComunicacaoInput): Promise<{
  ok: boolean;
  erro?: string;
  whatsappUrl?: string;
  comunicacaoId?: number;
  providerId?: string;
}> {
  const mensagem = String(input.mensagem || "").trim();
  if (!mensagem) return { ok: false, erro: "A mensagem não pode estar vazia." };

  let destinatario = String(input.destinatario || "").trim();
  if (!destinatario && (input.ref?.clienteId || input.ref?.jangadaId || input.ref?.ordemServicoId)) {
    let cliente: { telmovel: string | null; telefone: string | null; email: string | null } | null = null;
    if (input.ref?.clienteId) {
      cliente = await prisma.cliente.findUnique({
        where: { id: input.ref.clienteId },
        select: { telmovel: true, telefone: true, email: true },
      }).catch(() => null);
    } else if (input.ref?.ordemServicoId) {
      cliente = await prisma.ordemServico.findUnique({
        where: { id: input.ref.ordemServicoId },
        select: { cliente: { select: { telmovel: true, telefone: true, email: true } } },
      }).then((o) => o?.cliente || null).catch(() => null);
    } else if (input.ref?.jangadaId) {
      const j = await prisma.jangada.findUnique({
        where: { id: input.ref.jangadaId },
        select: { shipId: true },
      }).catch(() => null);
      if (j?.shipId) {
        cliente = await prisma.navio.findUnique({
          where: { id: j.shipId },
          select: { cliente: { select: { telmovel: true, telefone: true, email: true } } },
        }).then((n) => n?.cliente || null).catch(() => null);
      }
    }
    if (cliente) {
      if (input.tipo === "EMAIL") {
        destinatario = String(cliente.email || "").trim();
      } else {
        destinatario = getClientePhone(cliente);
      }
    }
  }

  if (!destinatario) {
    return { ok: false, erro: input.tipo === "EMAIL" ? "O cliente não tem email na ficha." : "O cliente não tem telemóvel na ficha." };
  }

  let status = "enviado";
  let erro: string | undefined;
  let whatsappUrl: string | undefined;
  let providerId: string | undefined;
  let canal = input.tipo === "SMS" ? "textbee" : input.tipo === "EMAIL" ? "email" : "wa.me";

  if (input.tipo === "SMS") {
    const result = await sendSms(destinatario, mensagem);
    if (!result.ok) {
      status = "falhou";
      erro = result.error;
    }
  } else if (input.tipo === "WHATSAPP") {
    const result = await sendWhatsAppApi(destinatario, mensagem);
    whatsappUrl = result.link;
    providerId = result.providerId;
    canal = result.enviadoDeFacto ? "whatsapp-api" : "wa.me";
    if (result.ok && result.enviadoDeFacto) {
      status = "enviado";
    } else if (result.ok) {
      status = "pendente";
    } else {
      status = "falhou";
      erro = result.erro;
    }
  }

  try {
    const registo = await prisma.comunicacao.create({
      data: {
        tipo: input.tipo,
        canal,
        destinatario,
        assunto: input.assunto,
        mensagem,
        status,
        erro,
        providerId,
        refTipo: input.ref?.refTipo,
        refId: input.ref?.refId ?? null,
        clienteId: input.ref?.clienteId ?? null,
        jangadaId: input.ref?.jangadaId ?? null,
        ordemServicoId: input.ref?.ordemServicoId ?? null,
        enviadoPor: input.enviadoPor,
      },
    });
    return { ok: status !== "falhou", erro, whatsappUrl, comunicacaoId: registo.id, providerId };
  } catch (e) {
    console.error("[communications] Erro a registar histórico:", e);
    return { ok: status !== "falhou", erro: erro || "Falha ao registar no histórico.", whatsappUrl };
  }
}

export function whatsappDisponivel(): boolean {
  return whatsappApiConfigurado();
}

export type RegistoComunicacaoManualInput = {
  tipo: ComunicacaoTipo;
  mensagem: string;
  destinatario: string;
  assunto?: string;
  canal?: string;
  status?: string;
  ref?: ComunicacaoRef;
  enviadoPor?: string;
  enviadoEm?: Date;
};

/**
 * Regista uma comunicação no histórico sem a enviar (links wa.me, chamadas,
 * e-mails preparados ou avisos automáticos) — usado pelos botões da página de
 * pedidos e pela sincronização automática (OT criada, jangada rececionada, ...).
 */
export async function registarComunicacaoManual(
  input: RegistoComunicacaoManualInput,
): Promise<{ ok: boolean; comunicacaoId?: number }> {
  const mensagem = String(input.mensagem || "").trim();
  const destinatario = String(input.destinatario || "").trim();
  if (!mensagem || !destinatario) {
    return { ok: false };
  }

  try {
    const registo = await prisma.comunicacao.create({
      data: {
        tipo: input.tipo,
        canal: String(input.canal || "manual").trim() || "manual",
        destinatario,
        assunto: input.assunto ?? null,
        mensagem,
        status: String(input.status || "").trim() || "enviado",
        refTipo: input.ref?.refTipo ?? null,
        refId: input.ref?.refId ?? null,
        clienteId: input.ref?.clienteId ?? null,
        jangadaId: input.ref?.jangadaId ?? null,
        ordemServicoId: input.ref?.ordemServicoId ?? null,
        enviadoPor: input.enviadoPor ?? null,
        enviadoEm: input.enviadoEm ?? new Date(),
      },
    });

    return { ok: true, comunicacaoId: registo.id };
  } catch (e) {
    console.error("[communications] Erro a registar comunicação manual:", e);
    return { ok: false };
  }
}

/** Extrai apenas os dígitos de um telemóvel/email para comparação de contacto. */
export function digitosContacto(contacto: string | null | undefined): string {
  return String(contacto || "").replace(/\D+/g, "");
}

export function normalizarParaBusca(contacto: string | null | undefined): string {
  const dig = digitosContacto(contacto);
  // Últimos 9 dígitos são o discriminador nacional; ignora prefixos +351/00351.
  return dig.length >= 9 ? dig.slice(-9) : dig;
}

/** Procura um cliente por telemóvel/telefone (E.164 normalizado) ou email. */
export async function encontrarClientePorContacto(
  contacto: string | null | undefined,
): Promise<{ id: number; nome: string } | null> {
  const raw = String(contacto || "").trim().toLowerCase();
  if (!raw) return null;

  const chave = normalizarParaBusca(raw);
  if (!chave) return null;

  const eEmail = raw.includes("@");
  if (eEmail) {
    const email = raw;
    const cliente = await prisma.cliente.findFirst({
      where: { email: { contains: email } },
      select: { id: true, nome: true },
    }).catch(() => null);
    if (cliente) return { id: cliente.id, nome: cliente.nome };
  }

  const clientes = await prisma.cliente.findMany({
    where: {
      OR: [
        { telmovel: { contains: chave } },
        { telefone: { contains: chave } },
      ],
    },
    select: { id: true, nome: true, telmovel: true, telefone: true },
    take: 50,
  }).catch(() => []);

  for (const c of clientes) {
    if (normalizarParaBusca(c.telmovel) === chave || normalizarParaBusca(c.telefone) === chave) {
      return { id: c.id, nome: c.nome };
    }
  }
  return null;
}

export type RegistoRecebidaResultado = {
  ok: boolean;
  comunicacaoId?: number;
  duplicada?: boolean;
  clienteId?: number;
  clienteNome?: string;
};

/**
 * Regista uma comunicação RECEBIDA (mensagem inbound do cliente) no histórico.
 *
 * - Deduplica por providerId (reentregas de webhook não duplicam o registo).
 * - Liga automaticamente ao cliente por telemóvel/telefone/email.
 * - Marca `respondidoEm` na última comunicação enviada para aquele contacto
 *   quando chega uma resposta.
 */
export async function registarComunicacaoRecebida(
  input: ComunicacaoRecebidaInput,
): Promise<RegistoRecebidaResultado> {
  const mensagem = String(input.mensagem || "").trim();
  const remetente = String(input.remetente || "").trim();
  if (!mensagem || !remetente) {
    return { ok: false };
  }

  const recebidoEm = input.recebidoEm || new Date();
  const canal = String(input.canal || "inbound").trim() || "inbound";

  // 1) Deduplicar por providerId (evita duplicar reentregas do webhook).
  if (input.providerId) {
    const existente = await prisma.comunicacao.findFirst({
      where: { providerId: input.providerId, status: "recebido" },
      orderBy: { id: "desc" },
    }).catch(() => null);
    if (existente) {
      return {
        ok: true,
        comunicacaoId: existente.id,
        duplicada: true,
        clienteId: existente.clienteId ?? undefined,
      };
    }
  }

  // 2) Ligar automaticamente ao cliente (por contacto ou ref já preenchida).
  let clienteId = input.ref?.clienteId ?? null;
  let clienteNome: string | undefined;
  if (clienteId) {
    const c = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { nome: true } }).catch(() => null);
    clienteNome = c?.nome ?? undefined;
  } else {
    const match = await encontrarClientePorContacto(
      input.tipo === "EMAIL" ? remetente : remetente,
    );
    if (match) {
      clienteId = match.id;
      clienteNome = match.nome;
    }
  }

  // 3) Marcar respondidoEm na última comunicação enviada para o mesmo contacto.
  if (clienteId) {
    const anterior = await prisma.comunicacao.findFirst({
      where: {
        clienteId,
        status: { in: ["enviado", "pendente"] },
        respondidoEm: null,
      },
      orderBy: { enviadoEm: "desc" },
      select: { id: true },
    }).catch(() => null);
    if (anterior) {
      await prisma.comunicacao.update({
        where: { id: anterior.id },
        data: { respondidoEm: recebidoEm },
      }).catch(() => {});
    }
  }

  // 4) Registar a mensagem recebida.
  const registo = await prisma.comunicacao.create({
    data: {
      tipo: input.tipo,
      canal,
      destinatario: remetente,
      assunto: input.assunto ?? (clienteNome ? `Resposta de ${clienteNome}` : `Mensagem Recebida de ${remetente}`),
      mensagem,
      status: "recebido",
      providerId: input.providerId ?? null,
      refTipo: input.ref?.refTipo ?? (clienteId ? "Cliente" : undefined),
      refId: input.ref?.refId ?? (clienteId ?? null),
      clienteId: clienteId ?? null,
      jangadaId: input.ref?.jangadaId ?? null,
      ordemServicoId: input.ref?.ordemServicoId ?? null,
      enviadoPor: input.nomeRemetente ? `remetente:${input.nomeRemetente}` : null,
      enviadoEm: recebidoEm,
    },
  });

  return { ok: true, comunicacaoId: registo.id, clienteId: clienteId ?? undefined, clienteNome };
}
