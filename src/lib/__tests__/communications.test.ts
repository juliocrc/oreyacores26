jest.mock("../sms-provider", () => ({
  sendSms: jest.fn(async () => ({ ok: true, provider: "infinireach" })),
}));

jest.mock("../email-sender", () => ({
  sendEmail: jest.fn(),
}));

jest.mock("../whatsapp-provider", () => ({
  sendWhatsAppApi: jest.fn(async () => ({ ok: true, enviadoDeFacto: true, link: "", providerId: "wamid-test" })),
  whatsappApiConfigurado: jest.fn(() => true),
}));

jest.mock("../prisma", () => ({
  __esModule: true,
  default: {
    comunicacao: { create: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    cliente: { findUnique: jest.fn(), findMany: jest.fn() },
  },
}));

import prisma from "../prisma";
import { sendSms } from "../sms-provider";
import { sendEmail } from "../email-sender";
import { sendWhatsAppApi } from "../whatsapp-provider";
import {
  digitosContacto,
  normalizarParaBusca,
  getClientePhone,
  buildWhatsAppUrl,
  enviarComunicacao,
  encontrarClientePorContacto,
  registarComunicacaoManual,
} from "../communications";

describe("digitosContacto", () => {
  it("extrai apenas os dígitos", () => {
    expect(digitosContacto("+351 912 345 678")).toBe("351912345678");
    expect(digitosContacto("(91) 234-5678")).toBe("912345678");
    expect(digitosContacto("abc123!@#")).toBe("123");
    expect(digitosContacto(null)).toBe("");
    expect(digitosContacto(undefined)).toBe("");
  });
});

describe("normalizarParaBusca", () => {
  it("reduz ao discriminador nacional de 9 dígitos", () => {
    expect(normalizarParaBusca("+351912345678")).toBe("912345678");
    expect(normalizarParaBusca("00351912345678")).toBe("912345678");
    expect(normalizarParaBusca("912345678")).toBe("912345678");
    expect(normalizarParaBusca("correio@orey.com")).toBe("");
  });

  it("devolve vazio sem contacto", () => {
    expect(normalizarParaBusca(null)).toBe("");
    expect(normalizarParaBusca("")).toBe("");
  });
});

describe("getClientePhone", () => {
  it("dá prioridade ao telemóvel", () => {
    expect(getClientePhone({ telmovel: "912111222", telefone: "295222333" })).toBe("912111222");
  });

  it("usa telefone quando não há telemóvel", () => {
    expect(getClientePhone({ telmovel: "", telefone: "295222333" })).toBe("295222333");
    expect(getClientePhone({ telmovel: null, telefone: null })).toBe("");
  });

  it("tolera referências vazias", () => {
    expect(getClientePhone(null)).toBe("");
    expect(getClientePhone(undefined)).toBe("");
  });
});

describe("buildWhatsAppUrl", () => {
  it("constrói o link wa.me com E.164 e texto codificado", () => {
    const url = buildWhatsAppUrl("912345678", "Olá cliente!");
    expect(url.startsWith("https://wa.me/351912345678?text=")).toBe(true);
    expect(url).toContain("%20");
  });

  it("usa wa.me/ quando não há número", () => {
    expect(buildWhatsAppUrl("", "teste")).toBe("https://wa.me/?text=teste");
  });
});

describe("enviarComunicacao", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.comunicacao.create as jest.Mock).mockResolvedValue({ id: 55 });
    (sendEmail as jest.Mock).mockReset().mockResolvedValue({ ok: true });
    (sendWhatsAppApi as jest.Mock).mockReset().mockResolvedValue({
      ok: true, enviadoDeFacto: true, provider: "waba", providerId: "SM-wa", link: "https://wa.me/351912345678",
    });
    (prisma.comunicacao.update as jest.Mock).mockResolvedValue({ id: 42 });
    (prisma.comunicacao.findUnique as jest.Mock).mockResolvedValue({ id: 42, status: "falhou", canal: "waba" });
  });

  it("rejeita mensagens vazias", async () => {
    const result = await enviarComunicacao({ tipo: "SMS", mensagem: "  ", destinatario: "912345678" });
    expect(result.ok).toBe(false);
    expect(prisma.comunicacao.create).not.toHaveBeenCalled();
  });

  it("envia SMS e regista o histórico", async () => {
    const result = await enviarComunicacao({ tipo: "SMS", mensagem: "Olá", destinatario: "+351912345678" });
    expect(sendSms).toHaveBeenCalledWith("+351912345678", "Olá");
    expect(result.ok).toBe(true);
    expect(result.comunicacaoId).toBe(55);
    expect(prisma.comunicacao.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tipo: "SMS", canal: "infinireach", status: "pendente", providerId: null }) }),
    );
  });

  it("does not expose a manual link after an actual WhatsApp send", async () => {
    const result = await enviarComunicacao({ tipo: "WHATSAPP", mensagem: "Teste", destinatario: "912345678" });
    expect(result).toMatchObject({ ok: true, providerId: "SM-wa", comunicacaoId: 55 });
    expect(result.whatsappUrl).toBeUndefined();
    expect(prisma.comunicacao.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "enviado", canal: "waba", providerId: "SM-wa" }),
    }));
  });

  it("keeps manual WhatsApp fallback pending and exposes the link", async () => {
    (sendWhatsAppApi as jest.Mock).mockResolvedValueOnce({ ok: true, enviadoDeFacto: false, link: "https://wa.me/test" });
    const result = await enviarComunicacao({ tipo: "WHATSAPP", mensagem: "Teste", destinatario: "912345678" });
    expect(result).toMatchObject({ ok: true, whatsappUrl: "https://wa.me/test" });
    expect(prisma.comunicacao.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "pendente", canal: "wa.me", providerId: null }),
    }));
  });

  it("updates the existing retry history instead of duplicating its provider SID", async () => {
    const result = await enviarComunicacao({ tipo: "WHATSAPP", mensagem: "Teste", destinatario: "912345678" }, { comunicacaoId: 42 });
    expect(result).toMatchObject({ ok: true, comunicacaoId: 42, providerId: "SM-wa" });
    expect(prisma.comunicacao.create).not.toHaveBeenCalled();
    expect(prisma.comunicacao.update).toHaveBeenCalledWith({
      where: { id: 42 }, data: expect.objectContaining({ status: "enviado", providerId: "SM-wa", erro: null }),
    });
  });

  it("envia EMAIL por SMTP e regista o historico", async () => {
    const result = await enviarComunicacao({
      tipo: "EMAIL",
      mensagem: "Orçamento pronto",
      assunto: "O seu orcamento",
      destinatario: "cliente@exemplo.com",
      ref: { refTipo: "PedidoAssistencia", refId: 9 },
    });
    expect(result.ok).toBe(true);
    expect(result.comunicacaoId).toBe(55);
    expect(sendEmail).toHaveBeenCalledWith({
      to: "cliente@exemplo.com",
      subject: "O seu orcamento",
      text: "Orçamento pronto",
    });
    expect(prisma.comunicacao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tipo: "EMAIL",
          canal: "email",
          assunto: "O seu orcamento",
          status: "enviado",
          refTipo: "PedidoAssistencia",
          refId: 9,
        }),
      }),
    );
  });

  it.each(['julio', 'tecnica'] as const)('passes selected email account %s through to SMTP without storing it', async senderAccount => {
    await enviarComunicacao({ tipo: 'EMAIL', mensagem: 'Teste', destinatario: 'cliente@exemplo.com', senderAccount }, { authenticatedEmail: ' JULIO.CORREIA@OREY.COM ' });
    expect(sendEmail).toHaveBeenCalledWith({ to: 'cliente@exemplo.com', subject: 'Orey Tecnica- Serviços Navais, Lda - Comunicação', text: 'Teste', senderAccount });
    expect(jest.mocked(prisma.comunicacao.create).mock.calls[0][0].data).not.toHaveProperty('senderAccount');
  });

  it.each([undefined, "", "   "])("usa assunto Orey por omissao (%p)", async (assunto) => {
    const result = await enviarComunicacao({ tipo: "EMAIL", mensagem: "Teste", destinatario: " cliente@exemplo.com ", assunto });
    expect(result.ok).toBe(true);
    expect(sendEmail).toHaveBeenCalledWith({ to: "cliente@exemplo.com", subject: "Orey Tecnica- Serviços Navais, Lda - Comunicação", text: "Teste" });
    expect(prisma.comunicacao.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ assunto: "Orey Tecnica- Serviços Navais, Lda - Comunicação", status: "enviado" }),
    }));
  });

  it.each([
    "Email nao configurado. Defina SMTP_HOST, SMTP_USER e SMTP_PASS.",
    "SMTP authentication failed",
    undefined,
  ])("regista falha SMTP e devolve erro (%p)", async (error) => {
    (sendEmail as jest.Mock).mockResolvedValueOnce({ ok: false, error });
    const result = await enviarComunicacao({ tipo: "EMAIL", mensagem: "Teste", destinatario: "cliente@exemplo.com" });
    const erro = error || "Falha ao enviar email.";
    expect(result).toEqual(expect.objectContaining({ ok: false, erro, comunicacaoId: 55 }));
    expect(prisma.comunicacao.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tipo: "EMAIL", canal: "email", status: "falhou", erro }),
    }));
  });

  it.each([new Error("Transporter failed"), "unexpected failure"])("regista erros lancados pelo email (%p)", async (error) => {
    (sendEmail as jest.Mock).mockRejectedValueOnce(error);
    const result = await enviarComunicacao({ tipo: "EMAIL", mensagem: "Teste", destinatario: "cliente@exemplo.com" });
    const erro = error instanceof Error ? error.message : "Falha ao enviar email.";
    expect(result).toEqual(expect.objectContaining({ ok: false, erro, comunicacaoId: 55 }));
    expect(prisma.comunicacao.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "falhou", erro }),
    }));
  });

  it.each([
    "invalid", "cliente@", "@exemplo.com", "cliente@exemplo",
    "a@exemplo.com,b@exemplo.com", "a@exemplo.com;b@exemplo.com",
    "Cliente <cliente@exemplo.com>", "a@exemplo.com\r\nBcc: b@exemplo.com",
    "a,b@exemplo.com", "a;b@exemplo.com", "a b@exemplo.com",
  ])("rejeita destinatario EMAIL invalido antes do envio (%p)", async (destinatario) => {
    const result = await enviarComunicacao({ tipo: "EMAIL", mensagem: "Teste", destinatario });
    expect(result).toEqual({ ok: false, erro: expect.any(String) });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(prisma.comunicacao.create).not.toHaveBeenCalled();
  });

  it("valida tambem o email resolvido da ficha do cliente", async () => {
    (prisma.cliente.findUnique as jest.Mock).mockResolvedValueOnce({ email: "a@exemplo.com,b@exemplo.com" });
    const result = await enviarComunicacao({ tipo: "EMAIL", mensagem: "Teste", ref: { clienteId: 9 } });
    expect(result.ok).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(prisma.comunicacao.create).not.toHaveBeenCalled();
  });
});

describe("encontrarClientePorContacto", () => {
  beforeEach(() => jest.clearAllMocks());

  it("matches email without digits exactly, ignoring case and surrounding spaces", async () => {
    (prisma.cliente.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 1, nome: "Wrong", email: "othercliente@example.com" },
      { id: 2, nome: "Correct", email: " Cliente@Example.COM " },
    ]);
    expect(await encontrarClientePorContacto(" CLIENTE@example.com ")).toEqual({ id: 2, nome: "Correct" });
    expect(prisma.cliente.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.cliente.findMany).toHaveBeenCalledWith({
      where: { email: { not: null } }, select: { id: true, nome: true, email: true },
    });
  });

  it("does not match email substrings or fall back to digits in an email", async () => {
    (prisma.cliente.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 1, nome: "Wrong", email: "other123456789@example.com" },
    ]);
    expect(await encontrarClientePorContacto("123456789@example.com")).toBeNull();
    expect(prisma.cliente.findMany).toHaveBeenCalledTimes(1);
  });

  it("preserves normalized phone matching", async () => {
    (prisma.cliente.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 3, nome: "Phone", telmovel: "+351912345678", telefone: null },
    ]);
    expect(await encontrarClientePorContacto("00351912345678")).toEqual({ id: 3, nome: "Phone" });
  });
});

describe("registarComunicacaoManual", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.comunicacao.create as jest.Mock).mockResolvedValue({ id: 77 });
  });

  it("rejeita registos sem destinatário ou mensagem", async () => {
    expect(await registarComunicacaoManual({ tipo: "CHAMADA", mensagem: "", destinatario: "912" })).toEqual({ ok: false });
    expect(await registarComunicacaoManual({ tipo: "CHAMADA", mensagem: "Olá", destinatario: " " })).toEqual({ ok: false });
    expect(prisma.comunicacao.create).not.toHaveBeenCalled();
  });

  it("cria o registo com o canal, estado e referência pedidos", async () => {
    const result = await registarComunicacaoManual({
      tipo: "CHAMADA",
      canal: "chamada",
      destinatario: "912345678",
      mensagem: "Contacto sobre o pedido",
      status: "enviado",
      ref: { refTipo: "PedidoAssistencia", refId: 12 },
      enviadoPor: "tecnico@orey.com",
    });

    expect(result).toEqual({ ok: true, comunicacaoId: 77 });
    expect(prisma.comunicacao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tipo: "CHAMADA",
          canal: "chamada",
          destinatario: "912345678",
          status: "enviado",
          refTipo: "PedidoAssistencia",
          refId: 12,
          enviadoPor: "tecnico@orey.com",
        }),
      }),
    );
  });
});
