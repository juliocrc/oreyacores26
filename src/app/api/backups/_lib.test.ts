import { getAuthSession } from "@/auth";
import { requireAdminOrBypass } from "./_lib";

jest.mock("@/auth", () => ({ getAuthSession: jest.fn() }));

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getAuthSession).mockResolvedValue(null);
});

afterEach(() => jest.restoreAllMocks());

it.each([
  { NODE_ENV: "production" },
  { NODE_ENV: "production", VERCEL: "1" },
  { NODE_ENV: "development", VERCEL_ENV: "preview" },
  { NODE_ENV: "development", AUTH_URL: "https://public.example.com" },
] as const)("rejects anonymous backup access despite AUTH_BYPASS: %j", async (env) => {
  jest.replaceProperty(process, "env", { AUTH_URL: "http://localhost:3000", ...env, AUTH_BYPASS: "true" });
  expect(await requireAdminOrBypass()).toEqual({ ok: false, status: 401 });
  expect(getAuthSession).toHaveBeenCalledTimes(1);
});

it.each(["USER", "CLIENTE"] as const)("rejects a real %s session in production with bypass set", async (role) => {
  jest.replaceProperty(process, "env", { NODE_ENV: "production", AUTH_BYPASS: "true" });
  jest.mocked(getAuthSession).mockResolvedValue({ user: { id: "7", role } } as never);
  expect(await requireAdminOrBypass()).toEqual({ ok: false, status: 401 });
});

it.each(["true", "false"])("preserves real ADMIN backup access in production (bypass=%s)", async (AUTH_BYPASS) => {
  jest.replaceProperty(process, "env", { NODE_ENV: "production", VERCEL: "1", AUTH_BYPASS });
  jest.mocked(getAuthSession).mockResolvedValue({ user: { id: "7", role: "ADMIN" } } as never);
  expect(await requireAdminOrBypass()).toEqual({ ok: true });
  expect(getAuthSession).toHaveBeenCalledTimes(1);
});

it.each(["development", "test"] as const)("preserves explicitly local %s backup bypass", async (NODE_ENV) => {
  jest.replaceProperty(process, "env", { NODE_ENV, AUTH_BYPASS: "true", AUTH_URL: "http://localhost:3000" });
  expect(await requireAdminOrBypass()).toEqual({ ok: true });
  expect(getAuthSession).not.toHaveBeenCalled();
});

it("requires a session when local bypass is not explicitly enabled", async () => {
  jest.replaceProperty(process, "env", { NODE_ENV: "development", AUTH_URL: "http://localhost:3000" });
  expect(await requireAdminOrBypass()).toEqual({ ok: false, status: 401 });
});
