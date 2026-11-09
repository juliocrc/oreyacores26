import { authConfig, getAuthSession, getIsSecureUrl } from "./auth";
import { auth } from "./auth";
import prisma from "@/lib/prisma";
import { getAuthSecret } from "@/lib/auth";
import bcrypt from "bcryptjs";

jest.mock("next-auth", () => ({ __esModule: true, CredentialsSignin: class extends Error {}, default: () => ({ handlers: {}, auth: jest.fn() }) }));
jest.mock("next-auth/providers/credentials", () => ({ __esModule: true, default: (options: unknown) => options }));
jest.mock("@/lib/prisma", () => ({ __esModule: true, default: {
  user: { findUnique: jest.fn(), update: jest.fn() },
} }));
jest.mock("@/lib/user-permissions", () => ({ resolveEffectivePermissions: jest.fn() }));
jest.mock("@/lib/permissions-cache", () => ({ getCachedPermissions: jest.fn(), setCachedPermissions: jest.fn() }));
jest.mock("@/lib/communications", () => ({ encontrarClientePorContacto: jest.fn() }));
jest.mock("bcryptjs", () => ({ compare: jest.fn(), hash: jest.fn() }));

const jwt = authConfig.callbacks!.jwt!;
const token = { sub: "7", role: "USER", sessionId: "current-session" };
function validate() {
  return jwt({ token: { ...token } } as Parameters<typeof jwt>[0]);
}

beforeEach(() => jest.resetAllMocks());
afterEach(() => jest.restoreAllMocks());

it("does not invalidate a signed JWT on a transient database failure", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.mocked(prisma.user.findUnique).mockRejectedValue(new Error("connection timeout"));
  expect(await validate()).toMatchObject(token);
});

it("still invalidates a session replaced by another login", async () => {
  jest.mocked(prisma.user.findUnique).mockResolvedValue({ activeSessionId: "another-session" } as never);
  expect(await validate()).toBeNull();
});

it("keeps the current active session", async () => {
  jest.mocked(prisma.user.findUnique).mockResolvedValue({ activeSessionId: token.sessionId } as never);
  expect(await validate()).toMatchObject(token);
});

const profile = { id: 7, email: "staff@example.com", role: "USER", activeSessionId: "another-session" };

it("does not let session.update recapture a replaced session", async () => {
  jest.mocked(prisma.user.findUnique).mockResolvedValue(profile as never);
  expect(await jwt({ token: { ...token, email: profile.email }, trigger: "update" } as Parameters<typeof jwt>[0])).toBeNull();
  expect(prisma.user.update).not.toHaveBeenCalled();
});

it("refreshes the current profile without reclaiming the session", async () => {
  jest.mocked(prisma.user.findUnique).mockResolvedValue({ ...profile, activeSessionId: token.sessionId } as never);
  expect(await jwt({ token: { ...token, email: profile.email }, trigger: "update" } as Parameters<typeof jwt>[0])).toMatchObject(token);
  expect(prisma.user.update).not.toHaveBeenCalled();
});

it("does not issue a token when the initial session claim fails", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.mocked(prisma.user.findUnique).mockResolvedValue(profile as never);
  jest.mocked(prisma.user.update).mockRejectedValue(new Error("write failed"));
  await expect(jwt({ token: { email: profile.email }, user: { id: "7", email: profile.email } } as Parameters<typeof jwt>[0])).rejects.toThrow("write failed");
});

it("preserves a current session on a transient profile refresh read failure", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.mocked(prisma.user.findUnique).mockRejectedValue(new Error("timeout"));
  expect(await jwt({ token: { ...token }, trigger: "update" } as Parameters<typeof jwt>[0])).toMatchObject(token);
});

it("catches asynchronous auth session failures", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.mocked(auth).mockRejectedValue(new Error("session failure") as never);
  await expect(getAuthSession()).resolves.toBeNull();
});

it.each([
  [{ NEXTAUTH_URL: "http://localhost:3000", VERCEL_URL: "preview.example.com" }, false],
  [{ AUTH_URL: "https://app.example.com" }, true],
  [{ VERCEL_URL: "preview.example.com" }, true],
  [{}, false],
])("selects matching issuer/proxy secure cookies for %j", (env, expected) => {
  jest.replaceProperty(process, "env", { NODE_ENV: "test", ...env });
  expect(getIsSecureUrl()).toBe(expected);
});

it("uses a configured stable secret for repeated calls", () => {
  jest.replaceProperty(process, "env", { NODE_ENV: "production", AUTH_SECRET: "test-only-stable-secret" });
  expect(getAuthSecret()).toBe("test-only-stable-secret");
  expect(getAuthSecret()).toBe(getAuthSecret());
});

it("rejects a missing production secret instead of generating a per-process secret", () => {
  jest.replaceProperty(process, "env", { NODE_ENV: "production" });
  expect(() => getAuthSecret()).toThrow("must be set in production");
});

it("does not override JWT lifetime independently of session lifetime", () => {
  expect(authConfig.jwt?.maxAge).toBeUndefined();
  expect(authConfig.session?.strategy).toBe("jwt");
});

const provider = authConfig.providers[0] as unknown as { authorize: (credentials: Record<string, string>) => Promise<unknown> };

it.each(["production", "development", "test"] as const)("rejects forged staff IDs in %s even with bypass enabled", async (NODE_ENV) => {
  jest.replaceProperty(process, "env", { NODE_ENV, AUTH_BYPASS: "true", AUTH_URL: "http://localhost:3000" });
  expect(await provider.authorize({ loginType: "passwordless", userId: "1" })).toBeNull();
  expect(prisma.user.findUnique).not.toHaveBeenCalled();
  expect(prisma.user.update).not.toHaveBeenCalled();
});

it("rejects a bare staff ID without a login type", async () => {
  expect(await provider.authorize({ userId: "1" })).toBeNull();
  expect(prisma.user.findUnique).not.toHaveBeenCalled();
});

it.each([
  { NODE_ENV: "production", AUTH_BYPASS: "true", AUTH_URL: "http://localhost:3000" },
  { NODE_ENV: "development", AUTH_BYPASS: "true", VERCEL: "1", AUTH_URL: "http://localhost:3000" },
  { NODE_ENV: "development" },
] as const)("does not bootstrap a staff password remotely or by default: %j", async (env) => {
  jest.replaceProperty(process, "env", env);
  jest.mocked(prisma.user.findUnique).mockResolvedValue({ id: 7, role: "ADMIN", passwordHash: null } as never);
  expect(await provider.authorize({ email: "staff@example.com", password: "attacker-password" })).toBeNull();
  expect(bcrypt.hash).not.toHaveBeenCalled();
  expect(prisma.user.update).not.toHaveBeenCalled();
});

it.each([true, false])("checks the existing staff password in production (valid=%s)", async (valid) => {
  jest.replaceProperty(process, "env", { NODE_ENV: "production", AUTH_BYPASS: "true" });
  jest.mocked(prisma.user.findUnique).mockResolvedValue({ ...profile, passwordHash: "stored-hash" } as never);
  (bcrypt.compare as jest.Mock).mockResolvedValue(valid);
  const result = await provider.authorize({ email: "staff@example.com", password: "secret" });
  expect(bcrypt.compare).toHaveBeenCalledWith("secret", "stored-hash");
  if (valid) expect(result).toMatchObject({ id: "7" });
  else expect(result).toBeNull();
  expect(prisma.user.update).toHaveBeenCalledTimes(valid ? 1 : 0);
});

it("preserves explicitly local dev kiosk password setup", async () => {
  jest.replaceProperty(process, "env", { NODE_ENV: "development", AUTH_BYPASS: "true", AUTH_URL: "http://localhost:3000" });
  jest.mocked(prisma.user.findUnique).mockResolvedValue({ ...profile, passwordHash: null } as never);
  jest.mocked(prisma.user.update).mockResolvedValue({ id: 7 } as never);
  (bcrypt.hash as jest.Mock).mockResolvedValue("local-hash");
  expect(await provider.authorize({ email: profile.email, password: "local-password" })).toMatchObject({ id: "7" });
  expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { passwordHash: "local-hash" } }));
});
