import { NextRequest, NextResponse } from "next/server";
import { POST } from "@/app/api/julinho/route";
import { getDashboardScope } from "@/lib/dashboard-access";
import { answerJulinho } from "@/lib/julinho/julinho-answer";
import prisma from "@/lib/prisma";
import { GET as searchGlobal } from "@/app/api/search/global/route";

jest.mock("@/lib/dashboard-access", () => ({ getDashboardScope: jest.fn() }));
jest.mock("@/lib/julinho/julinho-answer", () => ({ answerJulinho: jest.fn() }));
jest.mock("@/app/api/search/global/route", () => ({ GET: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: { serviceStation: { findUnique: jest.fn(async () => ({ nome: "Açores" })) } },
}));

const request = (body: unknown) => new NextRequest("http://localhost/api/julinho", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: typeof body === "string" ? body : JSON.stringify(body),
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getDashboardScope).mockResolvedValue({
    access: { userId: 7, isAdmin: true },
    where: { serviceStationId: 1 },
    stationId: 1,
  } as never);
  jest.mocked(answerJulinho).mockResolvedValue({
    reply: "Há 3 jangadas na estação.",
    action: { type: "navigate", href: "/jangadas", label: "Jangadas" },
  } as never);
});

it("devolve a resposta do Julinho associada à estação ativa", async () => {
  const response = await POST(request({ text: "quantas jangadas", pathname: "/jangadas" }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    reply: "Há 3 jangadas na estação.",
    action: { type: "navigate", href: "/jangadas" },
  });
  expect(answerJulinho).toHaveBeenCalledWith("quantas jangadas", expect.objectContaining({
    where: { serviceStationId: 1 },
    stationName: "Açores",
    pathname: "/jangadas",
  }));
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});

it("propaga a recusa de acesso sem consultar dados", async () => {
  jest.mocked(getDashboardScope).mockResolvedValue({
    error: NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 }),
  } as never);

  const response = await POST(request({ text: "quantas jangadas" }));
  expect(response.status).toBe(401);
  expect(prisma.serviceStation.findUnique).not.toHaveBeenCalled();
  expect(answerJulinho).not.toHaveBeenCalled();
});

it('nega consultas fora dos módulos autorizados, mesmo com sessão interna', async () => {
  jest.mocked(getDashboardScope).mockResolvedValue({ access: { userId: 7, isAdmin: false, permissions: { visibleModules: ['jangadas'], visiblePages: ['/jangadas'] } }, where: { serviceStationId: 1 }, stationId: 1 } as never);
  const response = await POST(request({ text: 'quantos clientes' }));
  expect(response.status).toBe(403);
  expect(answerJulinho).not.toHaveBeenCalled();
});

it('usa a pesquisa global protegida para pedido explícito', async () => {
  jest.mocked(searchGlobal).mockResolvedValue(NextResponse.json([{ type: 'Navio', label: 'Atlântida', href: '/navios/7' }]) as never);
  const response = await POST(request({ text: 'pesquisa global por Atlântida' }));
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.reply).toContain('Navio: Atlântida');
  expect(body.results).toEqual([{ type: 'Navio', label: 'Atlântida', href: '/navios/7' }]);
  expect(searchGlobal).toHaveBeenCalledTimes(1);
  expect(answerJulinho).not.toHaveBeenCalled();
});

it.each([
  [{ text: "" }],
  [{ text: "   " }],
  [{ text: "a".repeat(601) }],
  [{ text: 42 }],
  [{}],
])("rejeita um pedido inválido (%j)", async (body) => {
  const response = await POST(request(body));
  expect(response.status).toBe(400);
  expect(answerJulinho).not.toHaveBeenCalled();
});

it("rejeita JSON inválido e caracteres de controlo", async () => {
  expect((await POST(request("{invalido"))).status).toBe(400);
  expect((await POST(request({ text: "abre\u0000jangadas" }))).status).toBe(400);
  expect(answerJulinho).not.toHaveBeenCalled();
});

it("responde com um erro amigável quando a consulta falha", async () => {
  jest.mocked(answerJulinho).mockRejectedValue(new Error("db down"));
  const response = await POST(request({ text: "resumo" }));
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "Não consegui consultar os dados agora. Tenta novamente." });
});

it("rejeita corpos demasiado grandes", async () => {
  const response = await POST(new NextRequest("http://localhost/api/julinho", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": "9000" },
    body: JSON.stringify({ text: "resumo" }),
  }));
  expect(response.status).toBe(413);
});
