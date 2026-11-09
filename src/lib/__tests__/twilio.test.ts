import {
  mapTwilioStatus,
  toWhatsAppAddress,
  twilioSignature,
  validTwilioSignature,
} from "../twilio";

describe("mapTwilioStatus", () => {
  it("mapeia os estados de entrega do Twilio para a central", () => {
    expect(mapTwilioStatus("queued")).toBe("pendente");
    expect(mapTwilioStatus("accepted")).toBe("pendente");
    expect(mapTwilioStatus("scheduled")).toBe("pendente");
    expect(mapTwilioStatus("sending")).toBe("pendente");
    expect(mapTwilioStatus("sent")).toBe("enviado");
    expect(mapTwilioStatus("delivered")).toBe("entregue");
    expect(mapTwilioStatus("read")).toBe("lido");
    expect(mapTwilioStatus("failed")).toBe("falhou");
    expect(mapTwilioStatus("undelivered")).toBe("falhou");
    expect(mapTwilioStatus("canceled")).toBe("falhou");
  });

  it("ignora estados desconhecidos e vazios", () => {
    expect(mapTwilioStatus("DELIVERED")).toBe("entregue");
    expect(mapTwilioStatus("em_transito")).toBeNull();
    expect(mapTwilioStatus("")).toBeNull();
    expect(mapTwilioStatus(null)).toBeNull();
  });
});

describe("toWhatsAppAddress", () => {
  it("normaliza números nacionais e E.164", () => {
    expect(toWhatsAppAddress("912345678")).toBe("whatsapp:+351912345678");
    expect(toWhatsAppAddress("+351912345678")).toBe("whatsapp:+351912345678");
    expect(toWhatsAppAddress("whatsapp:+351912345678")).toBe("whatsapp:+351912345678");
  });

  it("devolve vazio para números inválidos", () => {
    expect(toWhatsAppAddress("")).toBe("");
    expect(toWhatsAppAddress("abc")).toBe("");
    expect(toWhatsAppAddress(null)).toBe("");
  });
});

describe("assinatura Twilio", () => {
  const authToken = "12345";
  const url = "https://mycompany.com/myapp.php?foo=1&bar=2";
  const params = {
    CallSid: "CA1234567890ABCDE",
    Caller: "+12349013030",
    Digits: "1234",
    From: "+12349013030",
    To: "+18005551212",
  };

  it("gera a assinatura do exemplo oficial do Twilio", () => {
    expect(twilioSignature(authToken, url, params)).toBe("0/KCTR6DLpKmkAf8muzZqo1nDgQ=");
  });

  it("não depende da ordem dos parâmetros", () => {
    const invertido = Object.fromEntries(Object.entries(params).reverse());
    expect(twilioSignature(authToken, url, invertido)).toBe(
      twilioSignature(authToken, url, params),
    );
  });

  it("valida a assinatura correta e rejeita alterações", () => {
    const signature = twilioSignature(authToken, url, params);
    expect(validTwilioSignature(authToken, signature, url, params)).toBe(true);
    expect(validTwilioSignature(authToken, signature, url, { ...params, Digits: "9999" })).toBe(false);
    expect(validTwilioSignature(authToken, "", url, params)).toBe(false);
    expect(validTwilioSignature("", signature, url, params)).toBe(false);
  });
});
