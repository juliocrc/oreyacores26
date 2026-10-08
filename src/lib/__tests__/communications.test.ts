jest.mock("../sms-provider", () => ({
  sendSms: jest.fn(async () => ({ ok: true })),
}));

jest.mock("../whatsapp-provider", () => ({
  sendWhatsAppApi: jest.fn(async () => ({ ok: true, enviadoDeFacto: true, link: "", providerId: "wamid-test" })),
  whatsappApiConfigurado: jest.fn(() => true),
}));

jest.mock("../prisma", () => ({
  __esModule: true,
  default: {
    comunicacao: { create: jest.fn(), findFirst: jest.fn() },
    cliente: { findUnique: jest.fn() },
  },
}));

import prisma from "../prisma";
import { sendSms } from "../sms-provider";
import {
  digitosContacto,
  normalizarParaBusca,
  getClientePhone,
  buildWhatsAppUrl,
  enviarComunicacao,
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
      expect.objectContaining({ data: expect.objectContaining({ tipo: "SMS", canal: "textbee", status: "enviado" }) }),
    );
  });

  it("registra comunicação sem enviar envio para EMAIL", async () => {
    const result = await enviarComunicacao({
      tipo: "EMAIL",
      mensagem: "Orçamento pronto",
      destinatario: "cliente@exemplo.com",
      ref: { refTipo: "PedidoAssistencia", refId: 9 },
    });
    expect(result.ok).toBe(true);
    expect(prisma.comunicacao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tipo: "EMAIL",
          canal: "email",
          status: "enviado",
          refTipo: "PedidoAssistencia",
          refId: 9,
        }),
      }),
    );
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
