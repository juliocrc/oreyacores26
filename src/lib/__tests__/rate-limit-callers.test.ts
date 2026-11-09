import { NextRequest } from "next/server";
import { POST as register } from "@/app/api/auth/register/route";
import { PUT, DELETE } from "@/app/api/stock/[id]/route";
import { checkRateLimit } from "@/lib/rate-limit";
import prisma from "@/lib/prisma";

jest.mock("@/auth", () => ({ getAuthSession: async () => ({ user: { id: "1", role: "ADMIN" } }) }));
jest.mock("@/lib/access-control", () => ({ getAccessContext: async () => ({ isAdmin: true, userId: 1 }) }));
jest.mock("@/lib/prisma", () => ({ __esModule: true, default: {
  stock: { findUnique: jest.fn(), update: jest.fn() }, user: { findUnique: jest.fn(), create: jest.fn() },
} }));
jest.mock("@/lib/rate-limit", () => ({ checkRateLimit: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

it.each([429, 503])("register and stock return %s without database side effects", async (status) => {
  jest.mocked(checkRateLimit).mockResolvedValue({ allowed: false, status, retryAfterMs: status === 429 ? 1000 : 0 } as never);
  const req = () => new NextRequest("http://localhost/api", { method: "POST", body: JSON.stringify({ email: "owner@example.com", password: "password123" }) });
  const context = () => ({ params: Promise.resolve({ id: "7" }) });
  expect((await register(req())).status).toBe(status);
  expect((await PUT(req(), context())).status).toBe(status);
  expect((await DELETE(req(), context())).status).toBe(status);
  expect(prisma.stock.findUnique).not.toHaveBeenCalled();
  expect(prisma.stock.update).not.toHaveBeenCalled();
  expect(prisma.user.findUnique).not.toHaveBeenCalled();
  expect(prisma.user.create).not.toHaveBeenCalled();
});
