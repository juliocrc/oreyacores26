import { NextRequest } from "next/server";
import { POST } from "./route";
import { getAuthSession } from "@/auth";
import prisma from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

jest.mock("@/auth", () => ({ getAuthSession: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ __esModule: true, default: { cliente: { findUnique: jest.fn() } } }));
jest.mock("@/lib/rate-limit", () => ({ checkRateLimit: jest.fn() }));

const request = (phone: string) => new NextRequest("http://localhost/api/portal/confirmar-telemovel", { method: "POST", body: JSON.stringify({ phone }) });
beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getAuthSession).mockResolvedValue({ user: { id: "1", role: "CLIENTE", clienteId: 42 } } as never);
  jest.mocked(checkRateLimit).mockResolvedValue({ allowed: true, status: 200 } as never);
  jest.mocked(prisma.cliente.findUnique).mockResolvedValue({ telmovel: "+351 912 345 678" } as never);
});
it("requires a client session", async () => {
  jest.mocked(getAuthSession).mockResolvedValue(null);
  expect((await POST(request("912345678"))).status).toBe(401);
  expect(prisma.cliente.findUnique).not.toHaveBeenCalled();
});
it("compares only the authenticated client's registered mobile", async () => {
  expect((await POST(request("912345678"))).status).toBe(200);
  expect(prisma.cliente.findUnique).toHaveBeenCalledWith({ where: { id: 42 }, select: { telmovel: true } });
  expect((await POST(request("912345679"))).status).toBe(400);
});
it("fails closed when rate limiting is unavailable", async () => {
  jest.mocked(checkRateLimit).mockResolvedValue({ allowed: false, status: 503 } as never);
  expect((await POST(request("912345678"))).status).toBe(503);
  expect(prisma.cliente.findUnique).not.toHaveBeenCalled();
});
