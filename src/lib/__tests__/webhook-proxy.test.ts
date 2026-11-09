import { NextRequest } from "next/server";
import proxy from "@/proxy";
import { getToken } from "next-auth/jwt";

jest.mock("next-auth/jwt", () => ({ getToken: jest.fn() }));
jest.mock("@/lib/auth", () => ({ getAuthSecret: () => "test-session-secret" }));
jest.mock("@/auth", () => ({ getIsSecureUrl: () => true }));

beforeEach(() => {
  jest.resetAllMocks();
  jest.replaceProperty(process, "env", { NODE_ENV: "production", AUTH_BYPASS: "false" });
  jest.mocked(getToken).mockResolvedValue(null);
});

afterEach(() => jest.restoreAllMocks());

it.each(["/notificacoes", "/stock/scanner"])("allows the staff page %s with a session", async (path) => {
  jest.mocked(getToken).mockResolvedValue({ sub: "7", role: "USER" });
  const response = await proxy(new NextRequest(`https://example.test${path}`));
  expect(response.headers.get("x-middleware-next")).toBe("1");
});

it.each(["/notificacoes", "/stock/scanner"])("requires authentication for %s", async (path) => {
  const response = await proxy(new NextRequest(`https://example.test${path}`));
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toContain("/selecionar-tecnico");
});

it.each(["/api/comunicacoes/twilio", "/api/comunicacoes/inbound", "/api/whatsapp/webhook", "/api/comunicacoes/infinireach"])(
  "lets the exact public webhook %s enforce its own authentication", async (path) => {
    const response = await proxy(new NextRequest(`https://example.test${path}`, { method: "POST" }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(getToken).not.toHaveBeenCalled();
  },
);

it.each(["/api/comunicacoes", "/api/comunicacoes/twilio/child", "/api/comunicacoes/twilio-other", "/api/comunicacoes/twilio/", "/api/comunicacoes/infinireach/child", "/api/comunicacoes/infinireach-other", "/api/comunicacoes/infinireach/"])(
  "still requires a session for %s", async (path) => {
    const response = await proxy(new NextRequest(`https://example.test${path}`, { method: "POST" }));
    expect(response.status).toBe(401);
    expect(getToken).toHaveBeenCalledTimes(1);
  },
);

it.each([
  { NODE_ENV: "production" },
  { NODE_ENV: "production", VERCEL: "1" },
  { NODE_ENV: "development", VERCEL_ENV: "preview" },
] as const)("ignores AUTH_BYPASS for production/hosted API and page requests: %j", async (env) => {
  jest.replaceProperty(process, "env", { ...env, AUTH_BYPASS: "true", AUTH_URL: "http://localhost:3000" });
  expect((await proxy(new NextRequest("https://example.test/api/stock"))).status).toBe(401);
  expect((await proxy(new NextRequest("https://example.test/stock"))).status).toBe(307);
});

it.each(["/selecionar-tecnico", "/api/auth/callback/credentials", "/api/auth/client-code"])("keeps the login entry point %s public without granting a session", async (path) => {
  expect((await proxy(new NextRequest(`https://example.test${path}`))).headers.get("x-middleware-next")).toBe("1");
  expect(getToken).not.toHaveBeenCalled();
});

it.each(["/api/custos", "/api/clientes/42", "/api/inspecaoartigo", "/api/navios/merge-duplicates", "/api/stock/file.json", "/api/portal-other/me"])(
  "denies a client session on the internal API %s", async path => {
    jest.mocked(getToken).mockResolvedValue({ sub: "7", role: "CLIENTE", clienteId: 12 });
    const response = await proxy(new NextRequest(`https://example.test${path}`, { method: "DELETE" }));
    expect(response.status).toBe(403);
    expect(response.headers.get("x-middleware-next")).toBeNull();
  },
);

it.each(["/api/portal/me", "/api/portal/documentos", "/api/portal/navios/10", "/api/portal/faturas/42/oficial"])(
  "preserves portal route-level ownership checks for %s", async path => {
    jest.mocked(getToken).mockResolvedValue({ sub: "7", role: "CLIENTE", clienteId: 12 });
    expect((await proxy(new NextRequest(`https://example.test${path}`))).headers.get("x-middleware-next")).toBe("1");
  },
);

it.each(["/api/stock/file.json", "/api/clientes/42.pdf"])("does not treat API paths with extensions as public assets: %s", async path => {
  expect((await proxy(new NextRequest(`https://example.test${path}`))).status).toBe(401);
  expect(getToken).toHaveBeenCalled();
});

it.each([undefined, "UNKNOWN"])("rejects a signed API session with invalid role %s", async role => {
  // Deliberately malformed/legacy JWT claims exercise runtime validation.
  jest.mocked(getToken).mockResolvedValue({ sub: "7", role } as never);
  expect((await proxy(new NextRequest("https://example.test/api/custos"))).status).toBe(401);
});

it.each(["/", "/clientes", "/navios", "/stock/scanner"])("redirects clients away from internal pages: %s", async path => {
  jest.mocked(getToken).mockResolvedValue({ sub: "7", role: "CLIENTE" });
  const response = await proxy(new NextRequest(`https://example.test${path}`));
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("https://example.test/area-cliente");
});

it.each(["/area-cliente", "/area-cliente/login", "/portal-cliente", "/public/orcamento/42", "/api/certificados/pdf?serial=RAFT&t=SIGNED"])(
  "preserves public entry points and token-protected documents: %s", async path => {
    expect((await proxy(new NextRequest(`https://example.test${path}`))).headers.get("x-middleware-next")).toBe("1");
  },
);
