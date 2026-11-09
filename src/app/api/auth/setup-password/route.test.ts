import { NextRequest } from "next/server";
import { getAuthSession } from "@/auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { POST } from "./route";

jest.mock("@/auth", () => ({ getAuthSession: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ __esModule: true, default: {
  user: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
} }));
jest.mock("bcryptjs", () => ({ hash: jest.fn() }));

function request(secret?: string) {
  return new NextRequest("https://example.test/api/auth/setup-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "staff@example.com", password: "test-only-password", secret }),
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getAuthSession).mockResolvedValue(null);
  jest.replaceProperty(process, "env", { NODE_ENV: "production", AUTH_BYPASS: "true" });
});

afterEach(() => jest.restoreAllMocks());

it.each([
  { env: {}, secret: undefined },
  { env: { ALLOW_ADMIN_BOOTSTRAP: "true" }, secret: undefined },
  { env: { SETUP_PASSWORD_SECRET: "test-only-secret" }, secret: "test-only-secret" },
  { env: { ALLOW_ADMIN_BOOTSTRAP: "true", SETUP_PASSWORD_SECRET: "test-only-secret" }, secret: undefined },
  { env: { ALLOW_ADMIN_BOOTSTRAP: "true", SETUP_PASSWORD_SECRET: "test-only-secret" }, secret: "wrong-secret" },
])("cannot bootstrap/reset staff passwords without both explicit enablement and proof: %j", async ({ env, secret }) => {
  jest.replaceProperty(process, "env", { NODE_ENV: "production", AUTH_BYPASS: "true", ...env });
  expect((await POST(request(secret))).status).toBe(403);
  expect(bcrypt.hash).not.toHaveBeenCalled();
  expect(prisma.user.findUnique).not.toHaveBeenCalled();
  expect(prisma.user.update).not.toHaveBeenCalled();
  expect(prisma.user.create).not.toHaveBeenCalled();
});

it.each(["USER", "CLIENTE"] as const)("does not treat a %s session as bootstrap authorization", async (role) => {
  jest.mocked(getAuthSession).mockResolvedValue({ user: { id: "7", role } } as never);
  expect((await POST(request())).status).toBe(403);
  expect(bcrypt.hash).not.toHaveBeenCalled();
  expect(prisma.user.update).not.toHaveBeenCalled();
  expect(prisma.user.create).not.toHaveBeenCalled();
});
