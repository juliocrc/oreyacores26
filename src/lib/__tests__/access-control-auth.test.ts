import { getAccessContext } from "@/lib/access-control";
import { getAuthSession } from "@/auth";
import prisma from "@/lib/prisma";

jest.mock("@/auth", () => ({ getAuthSession: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ __esModule: true, default: { serviceStation: { findMany: jest.fn() } } }));
jest.mock("@/lib/user-permissions", () => ({ resolveEffectivePermissions: jest.fn() }));

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getAuthSession).mockResolvedValue(null);
});
afterEach(() => jest.restoreAllMocks());

it.each([
  { NODE_ENV: "production" },
  { NODE_ENV: "production", VERCEL: "1" },
  { NODE_ENV: "development", VERCEL_ENV: "preview" },
] as const)("never grants anonymous production/hosted admin access: %j", async (env) => {
  jest.replaceProperty(process, "env", { ...env, AUTH_BYPASS: "true", AUTH_URL: "http://localhost:3000" });
  expect(await getAccessContext()).toBeNull();
  expect(prisma.serviceStation.findMany).not.toHaveBeenCalled();
});

it("preserves explicitly local test bypass", async () => {
  jest.replaceProperty(process, "env", { NODE_ENV: "test", AUTH_BYPASS: "true", AUTH_URL: "http://localhost:3000" });
  jest.mocked(prisma.serviceStation.findMany).mockResolvedValue([{ id: 12 }] as never);
  expect(await getAccessContext()).toMatchObject({ role: "ADMIN", isAdmin: true, allowedStationIds: [12] });
});

it("does not treat a client OTP session as staff", async () => {
  jest.mocked(getAuthSession).mockResolvedValue({ user: { id: "8", email: "client@example.com", role: "CLIENTE" } } as never);
  expect(await getAccessContext()).toBeNull();
});
