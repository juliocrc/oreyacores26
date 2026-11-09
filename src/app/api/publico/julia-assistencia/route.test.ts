import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { POST } from "./route";

jest.mock("@/lib/prisma", () => ({ __esModule: true, default: { pedidoAssistencia: { create: jest.fn() } } }));
jest.mock("@/lib/rate-limit", () => ({ checkRateLimit: jest.fn() }));

const payload = { nome: "Ana", email: "ana@example.com", telefone: "", navio: "Barco", descricao: "Preciso de assistência", confirmed: true };
const request = (body: unknown) => new NextRequest("http://localhost/api/publico/julia-assistencia", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(checkRateLimit).mockResolvedValue({ success: true, allowed: true, remaining: 1, retryAfterMs: 0, status: 200 });
  jest.mocked(prisma.pedidoAssistencia.create).mockResolvedValue({ id: 12 } as never);
});
it("regista o potencial cliente sem criar conta", async () => {
  const response = await POST(request(payload));
  expect(response.status).toBe(201);
  expect(prisma.pedidoAssistencia.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ origem: "julia_publica", estado: "novo", email: payload.email }) }));
});
it("não cria pedidos sem confirmação ou contacto", async () => {
  expect((await POST(request({ ...payload, confirmed: false }))).status).toBe(400);
  expect((await POST(request({ ...payload, email: "" }))).status).toBe(400);
  expect(prisma.pedidoAssistencia.create).not.toHaveBeenCalled();
});
it("não cria pedidos se o limitador estiver indisponível", async () => {
  jest.mocked(checkRateLimit).mockResolvedValue({ success: false, allowed: false, remaining: 0, retryAfterMs: 0, status: 503 });
  expect((await POST(request(payload))).status).toBe(503);
  expect(prisma.pedidoAssistencia.create).not.toHaveBeenCalled();
});
it("regista inspeção e certificado como declarações não verificadas", async () => {
  const response = await POST(request({ ...payload, ultimaInspecao: "2026-10-27", certificado: "AZ26-123" }));
  expect(response.status).toBe(201);
  expect(prisma.pedidoAssistencia.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ descricao: expect.stringContaining("Dados declarados pelo visitante, por verificar:") }) }));
  const data = jest.mocked(prisma.pedidoAssistencia.create).mock.calls[0][0].data;
  expect(data.descricao).toContain("2026-10-27");
  expect(data.descricao).toContain("AZ26-123");
});
it("rejeita uma data inválida", async () => {
  expect((await POST(request({ ...payload, ultimaInspecao: "2026-02-30" }))).status).toBe(400);
  expect(prisma.pedidoAssistencia.create).not.toHaveBeenCalled();
});
