import { authConfig } from "./auth";
import prisma from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { encontrarClientePorContacto } from "@/lib/communications";

jest.mock("next-auth", () => ({ __esModule: true, CredentialsSignin: class extends Error {}, default: () => ({ handlers: {} }) }));
jest.mock("next-auth/providers/credentials", () => ({ __esModule: true, default: (options: unknown) => options }));
jest.mock("@/lib/prisma", () => ({ __esModule: true, default: {
  cliente: { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
  user: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
} }));
jest.mock("@/lib/user-permissions", () => ({ resolveEffectivePermissions: jest.fn() }));
jest.mock("@/lib/permissions-cache", () => ({ getCachedPermissions: jest.fn(), setCachedPermissions: jest.fn() }));
jest.mock("@/lib/communications", () => ({ encontrarClientePorContacto: jest.fn() }));
jest.mock("@/lib/rate-limit", () => ({ checkRateLimit: jest.fn() }));

const provider = authConfig.providers[0] as unknown as { authorize: (credentials: Record<string, string>) => Promise<unknown> };
const login = (extra = {}) => provider.authorize({ loginType: "client", email: "owner@example.com", code: "12345", ...extra });
const client = { id: 7, nome: "Owner", email: "owner@example.com", nif: "123456789", verificationCode: "12345", verificationCodeExpires: new Date(Date.now() + 600000), portalAtivo: true };

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(checkRateLimit).mockReturnValue({ allowed: true } as never);
  jest.mocked(prisma.cliente.findFirst).mockResolvedValue(client as never);
  jest.mocked(prisma.cliente.updateMany).mockResolvedValue({ count: 1 });
  jest.mocked(prisma.user.findFirst).mockResolvedValue({ id: 8, email: client.email, role: "CLIENTE" } as never);
});

it("uses the existing limiter before client lookup", async () => {
  jest.mocked(checkRateLimit).mockReturnValue({ allowed: false, status: 429 } as never);
  await expect(login()).rejects.toMatchObject({ code: "rate_limit_exceeded" });
  expect(prisma.cliente.findFirst).not.toHaveBeenCalled();
});

it("fails closed before looking up or consuming codes on backend failure", async () => {
  jest.mocked(checkRateLimit).mockResolvedValue({ allowed: false, status: 503 } as never);
  await expect(login()).rejects.toMatchObject({ code: "rate_limit_unavailable" });
  expect(prisma.cliente.findFirst).not.toHaveBeenCalled();
  expect(prisma.cliente.updateMany).not.toHaveBeenCalled();
});

it.each([null, new Date(Date.now() - 1)])("rejects missing/expired OTP expiry: %s", async (expiry) => {
  jest.mocked(prisma.cliente.findFirst).mockResolvedValue({ ...client, verificationCodeExpires: expiry } as never);
  expect(await login()).toBeNull();
  expect(prisma.cliente.updateMany).not.toHaveBeenCalled();
});

it("rejects incorrect codes without consuming them", async () => {
  expect(await login({ code: "99999" })).toBeNull();
  expect(prisma.cliente.updateMany).not.toHaveBeenCalled();
});

it("atomically consumes OTP and rejects concurrent replay", async () => {
  jest.mocked(prisma.cliente.updateMany).mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
  const results = await Promise.all([login(), login()]);
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(prisma.cliente.updateMany).toHaveBeenCalledWith({
    where: { id: 7, verificationCode: "12345", verificationCodeExpires: { gt: expect.any(Date) } },
    data: { verificationCode: null, verificationCodeExpires: null },
  });
});

it("rejects the administrator-issued permanent NIF login", async () => {
  jest.mocked(prisma.cliente.findMany).mockResolvedValue([{ ...client, nif: "123456789", verificationCodeExpires: null }] as never);
  expect(await login({ nif: "123 456 789" })).toBeNull();
  expect(prisma.cliente.updateMany).not.toHaveBeenCalled();
});

it("accepts NIF only as an identifier with a single-use temporary code", async () => {
  jest.mocked(prisma.cliente.findMany).mockResolvedValue([client] as never);
  expect(await login({ nif: "123 456 789" })).toMatchObject({ id: "8" });
  expect(prisma.cliente.updateMany).toHaveBeenCalledTimes(1);
});

it("never accepts NIF as the secret even when copied into the verification field", async () => {
  jest.mocked(prisma.cliente.findMany).mockResolvedValue([{ ...client, verificationCode: client.nif }] as never);
  expect(await login({ nif: client.nif, code: client.nif })).toBeNull();
  expect(prisma.cliente.updateMany).not.toHaveBeenCalled();
});

it("rejects even a five-digit NIF copied into a future-dated code", async () => {
  jest.mocked(prisma.cliente.findFirst).mockResolvedValue({ ...client, nif: "12345" } as never);
  expect(await login()).toBeNull();
  expect(prisma.cliente.updateMany).not.toHaveBeenCalled();
});

it.each([null, new Date(0), new Date("invalid")])("rejects missing or invalid expiry across NIF and phone login: %s", async (expiry) => {
  const record = { ...client, verificationCodeExpires: expiry };
  jest.mocked(prisma.cliente.findMany).mockResolvedValue([record] as never);
  jest.mocked(encontrarClientePorContacto).mockResolvedValue({ id: client.id } as never);
  jest.mocked(prisma.cliente.findUnique).mockResolvedValue(record as never);
  expect(await login({ nif: client.nif })).toBeNull();
  expect(await login({ phone: "912345678" })).toBeNull();
  expect(prisma.cliente.updateMany).not.toHaveBeenCalled();
});

it("never uses clientAccessCode as a fallback secret", async () => {
  jest.mocked(prisma.cliente.findFirst).mockResolvedValue({ ...client, verificationCode: null, clientAccessCode: "12345" } as never);
  expect(await login()).toBeNull();
  expect(prisma.cliente.updateMany).not.toHaveBeenCalled();
});

it("returns identity only, without authentication codes", async () => {
  const result = await login();
  expect(result).toMatchObject({ id: "8" });
  expect(JSON.stringify(result)).not.toMatch(/12345|verificationCode|clientAccessCode/);
});

it("does not reassign another account with the same email", async () => {
  jest.mocked(prisma.user.findFirst).mockResolvedValue(null);
  jest.mocked(prisma.user.findUnique).mockResolvedValue({ id: 99, role: "ADMIN" } as never);
  expect(await login()).toBeNull();
  expect(prisma.user.update).not.toHaveBeenCalled();
});

it("does not allow client accounts to bypass OTP through password bootstrap", async () => {
  jest.mocked(prisma.user.findUnique).mockResolvedValue({ id: 8, role: "CLIENTE", passwordHash: null } as never);
  expect(await provider.authorize({ email: client.email, password: "anything" })).toBeNull();
  expect(prisma.user.update).not.toHaveBeenCalled();
});
