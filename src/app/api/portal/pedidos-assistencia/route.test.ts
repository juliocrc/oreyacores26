import { NextRequest } from "next/server";
import { GET, POST } from "./route";
import { getAuthSession } from "@/auth";
import prisma from "@/lib/prisma";

jest.mock("@/auth", () => ({ getAuthSession: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ __esModule: true, default: {
  cliente: { findUnique: jest.fn() }, navio: { findUnique: jest.fn() },
  jangada: { findUnique: jest.fn() }, pedidoAssistencia: { create: jest.fn(), findMany: jest.fn() },
} }));

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getAuthSession).mockResolvedValue({ user: { id: "1", role: "CLIENTE", clienteId: 7 } } as never);
  jest.mocked(prisma.cliente.findUnique).mockResolvedValue({ id: 7, nome: "Owner" } as never);
});

it("lists only the authenticated client's requests, even for similar client IDs", async () => {
  jest.mocked(prisma.pedidoAssistencia.findMany).mockResolvedValue([
    { id: 1, metadados: '{"clienteId":70}', estado: 'novo' },
    { id: 2, metadados: '{"clienteId":7}', estado: 'aberto' },
    { id: 3, metadados: 'invalid', estado: 'novo' },
  ] as never);
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect((await response.json()).pedidos).toEqual([expect.objectContaining({ id: 2 })]);
});

it("rejects non-client sessions before querying requests", async () => {
  jest.mocked(getAuthSession).mockResolvedValue({ user: { id: '1', role: 'TECNICO', clienteId: 7 } } as never);
  expect((await GET()).status).toBe(403);
  expect(prisma.pedidoAssistencia.findMany).not.toHaveBeenCalled();
});

it.each([{ navioId: 10 }, { jangadaId: 20 }])("rejects assistance referencing another client's fleet: %j", async (reference) => {
  jest.mocked(prisma.navio.findUnique).mockResolvedValue({ id: 10, clienteId: 99 } as never);
  jest.mocked(prisma.jangada.findUnique).mockResolvedValue({ id: 20, shipId: 10 } as never);
  const response = await POST(new NextRequest("http://localhost/api/portal/pedidos-assistencia", {
    method: "POST", body: JSON.stringify({ clienteId: 7, motivo: "Help", descricao: "Inspect", ...reference }),
  }));
  expect(response.status).toBe(403);
  expect(prisma.pedidoAssistencia.create).not.toHaveBeenCalled();
});
