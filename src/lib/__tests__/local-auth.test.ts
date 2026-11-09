import { isLocalAuthBypassEnabled } from "@/lib/local-auth";

afterEach(() => jest.restoreAllMocks());

it.each([
  { NODE_ENV: "production", AUTH_URL: "http://localhost:3000" },
  { NODE_ENV: "test", VERCEL: "1", AUTH_URL: "http://localhost:3000" },
  { NODE_ENV: "development", VERCEL_ENV: "preview", AUTH_URL: "http://localhost:3000" },
  { NODE_ENV: "test", VERCEL_URL: "preview.vercel.app", AUTH_URL: "http://localhost:3000" },
  { NODE_ENV: "development", VERCEL_PROJECT_PRODUCTION_URL: "app.vercel.app", AUTH_URL: "http://localhost:3000" },
  { NODE_ENV: "development", RENDER: "true", AUTH_URL: "http://localhost:3000" },
  { NODE_ENV: "development", AUTH_URL: "https://public.example.com" },
  { NODE_ENV: "development", AUTH_URL: "http://localhost:3000", NEXTAUTH_URL: "https://public.example.com" },
  { NODE_ENV: "development", AUTH_URL: "http://localhost.evil.test" },
  { NODE_ENV: "development", AUTH_URL: "not-a-url" },
  { NODE_ENV: "development" },
] as const)("blocks bypass for %j", (env) => {
  jest.replaceProperty(process, "env", { ...env, AUTH_BYPASS: "true" });
  expect(isLocalAuthBypassEnabled()).toBe(false);
});

it.each(["development", "test"] as const)("requires explicit local opt-in in %s", (NODE_ENV) => {
  jest.replaceProperty(process, "env", { NODE_ENV, AUTH_URL: "http://127.0.0.1:3000" });
  expect(isLocalAuthBypassEnabled()).toBe(false);
  process.env.AUTH_BYPASS = "true";
  expect(isLocalAuthBypassEnabled()).toBe(true);
});
