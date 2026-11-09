import { NextRequest } from "next/server";
import { GET, PATCH } from "./route";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";

jest.mock("@/lib/access-control", () => ({ getAccessContext: jest.fn() }));
jest.mock("@/lib/ordens-servico", () => ({ parseOrdemServicoMeta: (value: string) => JSON.parse(value) }));
jest.mock("@/lib/prisma", () => ({ __esModule: true, default: {
  $transaction: jest.fn(), ordemServico: { findUnique: jest.fn(), update: jest.fn() },
  faturaOrdemServico: { findFirst: jest.fn() },
} }));

const updatedAt = new Date("2026-10-26T12:00:00Z");
const destinatario = { nome: "Cliente real", nif: "123456789", morada: "Rua real", localidade: "Horta", ilha: "Faial" };
const request = (write = false, body: unknown = { updatedAt, destinatario }) => new NextRequest("http://localhost/api/ordens-servico/2307/destinatario", {
  method: write ? "PATCH" : "GET", ...(write ? { body: JSON.stringify(body) } : {}),
});

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: true } as never);
  jest.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => (fn as (tx: typeof prisma) => unknown)(prisma) as never);
  jest.mocked(prisma.ordemServico.findUnique).mockResolvedValue({ id: 2307, clienteId: 17, cliente: destinatario, updatedAt,
    metadados: JSON.stringify({ linhas: [{ referencia: "L-1" }], operational: true }),
  } as never);
  jest.mocked(prisma.ordemServico.update).mockResolvedValue({ updatedAt } as never);
});

test.each([null, { isAdmin: false }])("denies read and write without admin access: %j", async access => {
  jest.mocked(getAccessContext).mockResolvedValue(access as never);
  expect((await GET(request())).status).toBe(access ? 403 : 401);
  expect((await PATCH(request(true))).status).toBe(access ? 403 : 401);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

test("loads the actual related client by order ID, never by guessed owner name", async () => {
  expect(await (await GET(request())).json()).toMatchObject({ destinatario, clienteId: 17, locked: false });
  expect(prisma.ordemServico.findUnique).toHaveBeenCalledWith({ where: { id: 2307 }, include: { cliente: true } });
});

test("updates only this order draft and preserves operational metadata", async () => {
  expect((await PATCH(request(true))).status).toBe(200);
  expect(prisma.ordemServico.update).toHaveBeenCalledWith({ where: { id: 2307, updatedAt }, data: {
    metadados: JSON.stringify({ linhas: [{ referencia: "L-1" }], operational: true, destinatarioFaturacao: destinatario }),
  } });
});

test.each([false, true])("issued or cancelled invoices expose frozen recipient and reject edits: cancelled=%s", async cancelada => {
  const frozen = { ...destinatario, morada: "Morada na emissao" };
  jest.mocked(prisma.faturaOrdemServico.findFirst).mockResolvedValue({ fatura: { cancelada, metadados: JSON.stringify({ destinatario: frozen }) } } as never);
  expect(await (await GET(request())).json()).toMatchObject({ destinatario: frozen, locked: true });
  expect((await PATCH(request(true))).status).toBe(409);
  expect(prisma.ordemServico.update).not.toHaveBeenCalled();
});

test("rejects stale versions and identity mutation fields", async () => {
  expect((await PATCH(request(true, { updatedAt: "2025-01-01", destinatario }))).status).toBe(409);
  expect((await PATCH(request(true, { updatedAt, destinatario: { ...destinatario, clienteId: 99 } }))).status).toBe(400);
  expect(prisma.ordemServico.update).not.toHaveBeenCalled();
});
