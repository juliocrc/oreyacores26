export type Channel = "SMS" | "WHATSAPP" | "EMAIL";
export type HistoryChannel = Channel | "CHAMADA";

export type InboxMessage = {
  id: number;
  tipo: HistoryChannel;
  canal?: string | null;
  destinatario?: string | null;
  assunto?: string | null;
  mensagem: string;
  status: string;
  erro?: string | null;
  refTipo?: string | null;
  refId?: number | null;
  enviadoPor?: string | null;
  enviadoEm: string;
  respondidoEm?: string | null;
  clienteId?: number | null;
  jangadaId?: number | null;
  ordemServicoId?: number | null;
};

// Keep the entire international identity; only PT national numbers gain an inferred prefix.
export function phoneIdentity(value: string): string | null {
  const input = value.trim();
  if (!/^(?:\+|00)?[\d\s().-]+$/.test(input)) return null;
  let digits = input.replace(/\D/g, "");
  const international = input.startsWith("+") || input.startsWith("00");
  if (input.startsWith("00")) digits = digits.slice(2);
  if (!international && /^[29]\d{8}$/.test(digits)) digits = `351${digits}`;
  else if (!international && !/^[1-9]\d{9,14}$/.test(digits)) return null;
  return /^[1-9]\d{6,14}$/.test(digits) ? `+${digits}` : null;
}

export function contactKey(message: InboxMessage): string {
  const value = (message.destinatario || "").trim();
  // Email must be checked before extracting phone digits.
  if (value.includes("@")) return `mail:${value.toLowerCase()}`;
  const phone = phoneIdentity(value);
  if (phone) return `tel:${phone}`;
  if (value) return `contact:${value.toLowerCase()}`;
  if (message.clienteId) return `client:${message.clienteId}`;
  if (message.refTipo && message.refId) return `ref:${message.refTipo}:${message.refId}`;
  return `message:${message.id}`;
}

export type Conversation = {
  key: string;
  contact: string;
  name: string;
  channel: HistoryChannel;
  messages: InboxMessage[];
  unanswered: number;
};

export function groupConversations(items: InboxMessage[]): Conversation[] {
  const groups = new Map<string, InboxMessage[]>();
  for (const item of items) {
    const key = contactKey(item);
    const messages = groups.get(key) || [];
    messages.push(item);
    groups.set(key, messages);
  }
  return Array.from(groups, ([key, messages]) => {
    messages.sort((a, b) => Date.parse(a.enviadoEm) - Date.parse(b.enviadoEm) || a.id - b.id);
    const latest = messages[messages.length - 1];
    const incoming = [...messages].reverse().find((m) => m.tipo !== "CHAMADA" && m.status === "recebido");
    return {
      key,
      contact: (latest.destinatario || "").trim(),
      name: incoming?.enviadoPor?.replace(/^remetente:/i, "").trim() || "",
      channel: latest.tipo,
      messages,
      unanswered: messages.filter((m) => m.tipo !== "CHAMADA" && m.status === "recebido" && !m.respondidoEm).length,
    };
  }).sort((a, b) => Date.parse(b.messages[b.messages.length - 1].enviadoEm) - Date.parse(a.messages[a.messages.length - 1].enviadoEm));
}

export type InboxFilter = "all" | "unanswered" | "received" | "sent" | "pending" | "failed" | "drafts";
export type InboxDraft = {
  channel: Channel;
  recipient: string;
  subject: string;
  body: string;
  asAudio?: boolean;
  reply: InboxMessage | null;
};

// Only explicit pre-delivery or provider-rejected responses are safe to retry.
// A lost response, malformed body or unclassified server failure remains uncertain.
export function audioFailureIsDefinitive(status: number, body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const data = body as { uncertain?: unknown; status?: unknown; code?: unknown };
  if (data.uncertain === true) return false;
  return data.status === "falhou" || data.status === "closed" || data.code === "AUDIO_RATE_LIMIT_UNAVAILABLE" || [400, 401, 403, 413, 429].includes(status);
}

export function createDraft(conversation: Conversation | null, channel: Channel = "SMS"): InboxDraft {
  const composeChannel = conversation?.channel === "CHAMADA" ? "SMS" : conversation?.channel || channel;
  return { channel: composeChannel, recipient: conversation?.contact || "", subject: "", body: "", reply: null };
}

export function replyMatches(draft: InboxDraft): boolean {
  return !!draft.reply && draft.channel === draft.reply.tipo &&
    contactKey({ ...draft.reply, destinatario: draft.recipient }) === contactKey(draft.reply);
}

export function validRecipient(draft: InboxDraft): boolean {
  return draft.channel === "EMAIL"
    ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.recipient.trim())
    : phoneIdentity(draft.recipient) !== null;
}

export function matchesLocalDraft(draft: InboxDraft | undefined, search: string, channel: HistoryChannel | "", filter: InboxFilter): boolean {
  if (!draft || (!draft.body.trim() && !draft.subject.trim())) return false;
  if (filter !== "all" && filter !== "drafts") return false;
  if (channel && channel !== draft.channel) return false;
  const term = search.trim().toLocaleLowerCase();
  return !term || [draft.recipient, draft.subject, draft.body].some((text) => text.toLocaleLowerCase().includes(term));
}

export function replyReference(draft: InboxDraft) {
  const reply = replyMatches(draft) ? draft.reply : null;
  return {
    responderA: reply?.id,
    clienteId: reply?.clienteId ?? undefined,
    jangadaId: reply?.jangadaId ?? undefined,
    ordemServicoId: reply?.ordemServicoId ?? undefined,
    refTipo: reply?.refTipo ?? undefined,
    refId: reply?.refId ?? undefined,
  };
}

export function validVoiceNotice(phone: string, message: string, maxLength = 1500): boolean {
  const normalized = phoneIdentity(phone);
  return normalized !== null && /^\+[1-9]\d{7,14}$/.test(normalized) &&
    (!normalized.startsWith("+351") || /^\+351[2-9]\d{8}$/.test(normalized)) && message.trim().length >= 10 &&
    message.length <= Math.min(1500, maxLength);
}

export function matchesConversation(conversation: Conversation, search: string, channel: HistoryChannel | "", filter: InboxFilter, draft?: InboxDraft): boolean {
  const messages = conversation.messages;
  if (channel && !messages.some((m) => m.tipo === channel)) return false;
  if (filter === "unanswered" && !conversation.unanswered) return false;
  if (filter === "received" && !messages.some((m) => m.tipo !== "CHAMADA" && m.status === "recebido")) return false;
  if (filter === "sent" && !messages.some((m) => m.tipo !== "CHAMADA" && ["enviado", "entregue", "lido"].includes(m.status))) return false;
  if (filter === "pending" && !messages.some((m) => m.status === "pendente")) return false;
  if (filter === "failed" && !messages.some((m) => m.status === "falhou")) return false;
  if (filter === "drafts" && !draft?.body.trim() && !draft?.subject.trim() && !messages.some((m) => m.tipo !== "CHAMADA" && m.status === "rascunho")) return false;
  const term = search.trim().toLocaleLowerCase();
  return !term || [conversation.contact, conversation.name, ...messages.flatMap((m) => [m.mensagem, m.assunto || "", m.destinatario || ""])]
    .some((text) => text.toLocaleLowerCase().includes(term));
}
