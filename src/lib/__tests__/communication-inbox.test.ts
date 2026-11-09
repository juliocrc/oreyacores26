/** @jest-environment node */

import {
  contactKey, createDraft, groupConversations, matchesConversation, matchesLocalDraft,
  phoneIdentity, replyMatches, replyReference, validRecipient, validVoiceNotice,
  type InboxMessage,
} from "../communication-inbox";

function message(patch: Partial<InboxMessage> = {}): InboxMessage {
  return {
    id: 1, tipo: "SMS", destinatario: "912345678", mensagem: "Mensagem antiga",
    status: "recebido", enviadoEm: "2026-10-20T10:00:00Z", ...patch,
  };
}

describe("contact identity", () => {
  it("groups digit-bearing emails by complete case-insensitive email, never by phone", () => {
    expect(contactKey(message({ tipo: "EMAIL", destinatario: " Client123@Example.pt " }))).toBe("mail:client123@example.pt");
    expect(contactKey(message({ destinatario: "a912345678@example.pt" }))).not.toBe(contactKey(message()));
    expect(contactKey(message({ destinatario: "a123@example.pt" }))).not.toBe(contactKey(message({ destinatario: "b123@example.pt" })));
  });

  it("equates PT national, plus, bare international and 00 formats", () => {
    const formats = ["912345678", "+351 912 345 678", "00351 (912) 345-678", "351912345678"];
    expect(new Set(formats.map((destinatario) => contactKey(message({ destinatario })))).size).toBe(1);
    expect(phoneIdentity("295 123 456")).toBe("+351295123456");
  });

  it("never collides international contacts sharing the last nine digits", () => {
    expect(contactKey(message({ destinatario: "+44912345678" }))).not.toBe(contactKey(message()));
    expect(phoneIdentity("0044 20 7946 0958")).toBe("+442079460958");
    expect(phoneIdentity("+1 (212) 555-0199")).toBe("+12125550199");
  });

  it.each(["", "abc912345678", "user123@example.pt", "+351912345678 ext 2", "123", "+000000000", "+1234567890123456", "912+345678"])("does not dial unsafe or invalid recipient %s", (value) => {
    expect(phoneIdentity(value)).toBeNull();
  });

  it("keeps non-phone contacts distinct and uses stable missing-contact fallbacks", () => {
    expect(contactKey(message({ destinatario: "desk123" }))).toBe("contact:desk123");
    expect(contactKey(message({ destinatario: null, clienteId: 7 }))).toBe("client:7");
    expect(contactKey(message({ destinatario: null, refTipo: "os", refId: 8 }))).toBe("ref:os:8");
    expect(contactKey(message({ destinatario: null }))).toBe("message:1");
  });
});

describe("conversation grouping and filtering", () => {
  const older = message({ assunto: "Certificado 2025", enviadoPor: "remetente:Cliente" });
  const newer = message({ id: 2, tipo: "WHATSAPP", destinatario: "+351912345678", status: "enviado", mensagem: "Mensagem recente", enviadoEm: "2026-10-21T10:00:00Z" });

  it("keeps all channels and chronological messages without mutating input", () => {
    const items = [newer, older];
    const [conversation] = groupConversations(items);
    expect(conversation.messages.map((m) => m.id)).toEqual([1, 2]);
    expect(items.map((m) => m.id)).toEqual([2, 1]);
    expect(conversation.name).toBe("Cliente");
    expect(conversation.channel).toBe("WHATSAPP");
    expect(conversation.unanswered).toBe(1);
    expect(matchesConversation(conversation, "", "SMS", "all")).toBe(true);
    expect(conversation.messages).toHaveLength(2);
  });

  it("never converts an incoming SMS to WhatsApp", () => {
    const [conversation] = groupConversations([message()]);
    expect(conversation.channel).toBe("SMS");
    expect(createDraft(conversation).channel).toBe("SMS");
  });

  it("groups voice calls with the full phone identity but composes SMS after a latest call", () => {
    const call = message({ id: 3, tipo: "CHAMADA", canal: "twilio-voice", destinatario: "+351912345678", status: "pendente", enviadoEm: "2026-10-22T10:00:00Z" });
    const [conversation] = groupConversations([older, newer, call]);
    expect(conversation.messages.map((entry) => entry.tipo)).toEqual(["SMS", "WHATSAPP", "CHAMADA"]);
    expect(conversation.channel).toBe("CHAMADA");
    expect(createDraft(conversation).channel).toBe("SMS");
    expect(createDraft(conversation, "EMAIL").channel).toBe("SMS");
    expect(conversation.unanswered).toBe(1);
    expect(matchesConversation(conversation, "", "CHAMADA", "pending")).toBe(true);
    expect(matchesConversation(conversation, "", "SMS", "all")).toBe(true);
    expect(conversation.messages).toHaveLength(3);
  });

  it("does not treat calls as sent messages, unanswered messages or reusable message drafts", () => {
    for (const status of ["pendente", "enviado", "recebido", "rascunho"]) {
      const call = message({ tipo: "CHAMADA", canal: "twilio-voice", status });
      const [conversation] = groupConversations([call]);
      expect(conversation.unanswered).toBe(0);
      expect(matchesConversation(conversation, "", "", "received")).toBe(false);
      expect(matchesConversation(conversation, "", "", "sent")).toBe(false);
      expect(matchesConversation(conversation, "", "", "drafts")).toBe(false);
      expect(replyMatches({ ...createDraft(conversation), reply: call })).toBe(false);
    }
  });

  it("searches older message bodies and subjects, not only the latest snippet", () => {
    const [conversation] = groupConversations([newer, older]);
    expect(matchesConversation(conversation, "antiga", "", "all")).toBe(true);
    expect(matchesConversation(conversation, "CERTIFICADO 2025", "", "all")).toBe(true);
    expect(matchesConversation(conversation, "ausente", "", "all")).toBe(false);
    expect(matchesConversation(conversation, "", "EMAIL", "all")).toBe(false);
  });

  it("separates received from unanswered and sent from pending, failed and drafts", () => {
    const [answered] = groupConversations([message({ respondidoEm: "2026-10-21T12:00:00Z" })]);
    expect(matchesConversation(answered, "", "", "received")).toBe(true);
    expect(matchesConversation(answered, "", "", "unanswered")).toBe(false);
    for (const [status, filter] of [["pendente", "pending"], ["falhou", "failed"], ["rascunho", "drafts"]] as const) {
      const [conversation] = groupConversations([message({ status })]);
      expect(matchesConversation(conversation, "", "", filter)).toBe(true);
      expect(matchesConversation(conversation, "", "", "sent")).toBe(false);
    }
    expect(matchesConversation(groupConversations([newer])[0], "", "", "sent")).toBe(true);
  });

  it("includes local drafts in draft filtering and keeps newest conversations first", () => {
    const groups = groupConversations([older, message({ id: 3, destinatario: "other@example.pt", tipo: "EMAIL", enviadoEm: "2026-10-22T12:00:00Z" })]);
    expect(groups[0].contact).toBe("other@example.pt");
    const draft = { ...createDraft(groups[1]), body: "Trabalho em curso" };
    expect(matchesConversation(groups[1], "", "", "drafts", draft)).toBe(true);
    expect(matchesConversation(groups[1], "", "", "drafts")).toBe(false);
  });
});

describe("voice notice validation", () => {
  it("requires a dialable phone and nonblank notice", () => {
    expect(validVoiceNotice("912345678", "Aviso de vistoria")).toBe(true);
    expect(validVoiceNotice("+442079460958", "Certificado disponivel")).toBe(true);
    expect(validVoiceNotice("client123@example.pt", "Aviso")).toBe(false);
    expect(validVoiceNotice("", "Aviso")).toBe(false);
    expect(validVoiceNotice("912345678", " \n\t ")).toBe(false);
    expect(validVoiceNotice("912345678", "Curto")).toBe(false);
    expect(validVoiceNotice("+1234567", "Aviso de vistoria")).toBe(false);
    expect(validVoiceNotice("+35191234567", "Aviso de vistoria")).toBe(false);
  });

  it("enforces the server limit with an absolute maximum of 1500 characters", () => {
    expect(validVoiceNotice("912345678", "a".repeat(1500))).toBe(true);
    expect(validVoiceNotice("912345678", "a".repeat(1501))).toBe(false);
    expect(validVoiceNotice("912345678", "a".repeat(100), 100)).toBe(true);
    expect(validVoiceNotice("912345678", "a".repeat(101), 100)).toBe(false);
    expect(validVoiceNotice("912345678", "a".repeat(1501), 2000)).toBe(false);
  });
});

describe("in-memory draft shape and reply metadata", () => {
  it("exposes a new-message draft through matching filters without a history record", () => {
    const draft = { ...createDraft(null, "EMAIL"), recipient: "client@example.pt", subject: "Certificado", body: "Disponivel" };
    expect(matchesLocalDraft(draft, "certificado", "EMAIL", "drafts")).toBe(true);
    expect(matchesLocalDraft(draft, "CLIENT@", "", "all")).toBe(true);
    expect(matchesLocalDraft(draft, "", "SMS", "drafts")).toBe(false);
    expect(matchesLocalDraft(draft, "", "", "failed")).toBe(false);
    expect(matchesLocalDraft(draft, "ausente", "", "drafts")).toBe(false);
    expect(matchesLocalDraft(createDraft(null), "", "", "drafts")).toBe(false);
    expect(matchesLocalDraft(undefined, "", "", "all")).toBe(false);
  });

  it("preserves work-order, raft and client associations only for matching replies", () => {
    const reply = message({ clienteId: 2, jangadaId: 3, ordemServicoId: 4, refTipo: "os", refId: 4 });
    const draft = { ...createDraft(null), recipient: "+351912345678", reply };
    expect(replyReference(draft)).toEqual({ responderA: 1, clienteId: 2, jangadaId: 3, ordemServicoId: 4, refTipo: "os", refId: 4 });
    expect(Object.values(replyReference({ ...draft, recipient: "+442079460958" }))).toEqual(Array(6).fill(undefined));
  });

  it("creates independent, empty drafts per conversation and explicit new message", () => {
    const [conversation] = groupConversations([message()]);
    const first = createDraft(conversation);
    const second = createDraft(conversation);
    first.body = "Privado";
    first.subject = "Assunto";
    first.reply = message();
    expect(second).toEqual({ channel: "SMS", recipient: "912345678", subject: "", body: "", reply: null });
    expect(createDraft(null, "EMAIL")).toEqual({ channel: "EMAIL", recipient: "", subject: "", body: "", reply: null });
  });

  it("only includes reply metadata while recipient identity and exact channel match", () => {
    const draft = { ...createDraft(null), recipient: "+351912345678", reply: message() };
    expect(replyMatches(draft)).toBe(true);
    expect(replyMatches({ ...draft, channel: "WHATSAPP" })).toBe(false);
    expect(replyMatches({ ...draft, recipient: "+44912345678" })).toBe(false);
    expect(replyMatches({ ...draft, reply: null })).toBe(false);
    expect(replyMatches({ ...draft, channel: "EMAIL", recipient: "USER123@example.pt", reply: message({ tipo: "EMAIL", destinatario: "user123@example.pt" }) })).toBe(true);
  });

  it("validates the recipient for the selected channel", () => {
    const draft = createDraft(null, "EMAIL");
    expect(validRecipient({ ...draft, recipient: "user123@example.pt" })).toBe(true);
    expect(validRecipient({ ...draft, recipient: "user@" })).toBe(false);
    expect(validRecipient({ ...draft, channel: "SMS", recipient: "user123@example.pt" })).toBe(false);
    expect(validRecipient({ ...draft, channel: "SMS", recipient: "912345678" })).toBe(true);
  });
});
import { audioFailureIsDefinitive } from "../communication-inbox";

it("distinguishes definite audio failures from uncertain delivery", () => {
  expect(audioFailureIsDefinitive(502, { status: "falhou" })).toBe(true);
  expect(audioFailureIsDefinitive(429, { error: "limite" })).toBe(true);
  expect(audioFailureIsDefinitive(502, { uncertain: true, status: "falhou" })).toBe(false);
  expect(audioFailureIsDefinitive(500, { error: "erro" })).toBe(false);
  expect(audioFailureIsDefinitive(400, null)).toBe(false);
});
