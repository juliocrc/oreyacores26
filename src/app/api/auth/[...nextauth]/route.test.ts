import { POST } from "./route";
import { handlers } from "@/auth";
import { NextRequest } from "next/server";

jest.mock("@/auth", () => ({ handlers: { GET: jest.fn(), POST: jest.fn() } }));

it.each(["redirect", "json"])("maps Auth.js limiter errors to HTTP status for %s responses", async (mode) => {
  for (const [code, status] of [["rate_limit_unavailable", 503], ["rate_limit_exceeded", 429]] as const) {
    const url = `http://localhost/login?error=CredentialsSignin&code=${code}`;
    jest.mocked(handlers.POST).mockResolvedValue(mode === "redirect" ? Response.redirect(url) : Response.json({ url }));
    const response = await POST(new NextRequest("http://localhost/api/auth/callback/credentials", { method: "POST" }));
    expect(response.status).toBe(status);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ url });
  }
});

it("preserves ordinary Auth.js responses and cookies", async () => {
  const response = Response.json({ url: "http://localhost/" }, { headers: { "Set-Cookie": "session=test" } });
  jest.mocked(handlers.POST).mockResolvedValue(response);
  expect(await POST(new NextRequest("http://localhost/api/auth/callback/credentials", { method: "POST" }))).toBe(response);
});
