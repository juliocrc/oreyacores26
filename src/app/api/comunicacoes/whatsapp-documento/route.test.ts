import { NextRequest } from "next/server";
import { POST } from "./route";
import prisma from "@/lib/prisma";
import { sendOpenwa } from "@/lib/openwa";
jest.mock("@/lib/access-control", () => ({ getAccessContext: jest.fn(async () => ({ userId: 1, email: "admin@example.test" })) }));
jest.mock("@/lib/whatsapp-provider", () => ({ isWhatsAppAllowed: jest.fn(async () => true) }));
jest.mock("@/lib/rate-limit", () => ({ checkRateLimit: jest.fn(async () => ({ allowed: true, status: 200 })) }));
jest.mock("@/lib/openwa", () => ({ isOpenwaConfigured: () => true, sendOpenwa: jest.fn(async () => ({ ok: true, providerId: "provider" })) }));
jest.mock("@/lib/business-hours", () => ({ openwaBusinessHours: () => ({ open: true }) }));
jest.mock("@/lib/prisma", () => ({ __esModule: true, default: { comunicacao: { create: jest.fn(async () => ({ id: 42 })), update: jest.fn(async () => ({})) } } }));

function request(content = "%PDF-1.4 test", confirmed = "true") {
  const form = new FormData();
  form.set("pdf", new File([content], "fatura.pdf", { type: "application/pdf" }));
  form.set("destinatario", "+351912345678");
  form.set("confirmed", confirmed);
  return new NextRequest("http://localhost/api/comunicacoes/whatsapp-documento", { method: "POST", body: form });
}
beforeEach(() => jest.clearAllMocks());
it("regista e envia PDF apenas após confirmação", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(prisma.comunicacao.create).toHaveBeenCalledTimes(1);
  expect(sendOpenwa).toHaveBeenCalledWith("+351912345678", expect.objectContaining({ filename: "fatura.pdf" }), 42);
});
it("rejeita ficheiros inválidos ou sem confirmação", async () => {
  expect((await POST(request("não é pdf"))).status).toBe(400);
  expect((await POST(request("%PDF-1.4", "false"))).status).toBe(400);
  expect(sendOpenwa).not.toHaveBeenCalled();
});
it("não apresenta sucesso quando a entrega é incerta", async () => {
  jest.mocked(sendOpenwa).mockResolvedValueOnce({ ok: false, uncertain: true });
  const response = await POST(request());
  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({ uncertain: true, id: 42 });
});
