import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/comunicacoes/openwa/route";
import { getAccessContext } from "../access-control";
import { isWhatsAppAllowed } from "../whatsapp-provider";
import { checkRateLimit } from "../rate-limit";
import { openwaStatus } from "../openwa";

jest.mock("../access-control", () => ({ getAccessContext: jest.fn() }));
jest.mock("../whatsapp-provider", () => ({ isWhatsAppAllowed: jest.fn() }));
jest.mock("../rate-limit", () => ({ checkRateLimit: jest.fn() }));
jest.mock("../openwa", () => ({ openwaStatus: jest.fn() }));

const request = (body: unknown) => new NextRequest("http://localhost/api/comunicacoes/openwa", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getAccessContext).mockResolvedValue({ userId: 7 } as never);
  jest.mocked(isWhatsAppAllowed).mockResolvedValue(true);
  jest.mocked(checkRateLimit).mockReturnValue({ allowed: true } as never);
  jest.mocked(openwaStatus).mockResolvedValue({ configured: true, ready: false, status: "created", open: true, timeZone: "Atlantic/Azores", hours: "hours" });
});

it("status is read-only and non-cacheable", async () => {
  const req = new NextRequest("http://localhost/api/comunicacoes/openwa");
  const response = await GET(req);
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(openwaStatus).toHaveBeenCalledWith(false, req.signal);
});

it("forwards caller cancellation for both status and connect", async () => {
  const get = new NextRequest("http://localhost/api/comunicacoes/openwa");
  await GET(get);
  expect(openwaStatus).toHaveBeenLastCalledWith(false, get.signal);
  const post = request({ action: "connect" });
  await POST(post);
  expect(openwaStatus).toHaveBeenLastCalledWith(true, post.signal);
});

it.each([false, true])("requires auth for lifecycle and status (%s)", async (post) => {
  jest.mocked(getAccessContext).mockResolvedValue(null);
  expect((await (post ? POST(request({ action: "connect" })) : GET(new NextRequest("http://localhost/api/comunicacoes/openwa")))).status).toBe(401);
  expect(openwaStatus).not.toHaveBeenCalled();
});

it.each([false, true])("preserves the single allowed WhatsApp user (%s)", async (post) => {
  jest.mocked(isWhatsAppAllowed).mockResolvedValue(false);
  expect((await (post ? POST(request({ action: "connect" })) : GET(new NextRequest("http://localhost/api/comunicacoes/openwa")))).status).toBe(403);
  expect(openwaStatus).not.toHaveBeenCalled();
});

it("rate limits lifecycle before any provider I/O", async () => {
  jest.mocked(checkRateLimit).mockReturnValue({ allowed: false, retryAfterMs: 4500 } as never);
  const response = await POST(request({ action: "connect" }));
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("5");
  expect(openwaStatus).not.toHaveBeenCalled();
});

it("returns 503 before provider I/O on limiter backend failure", async () => {
  jest.mocked(checkRateLimit).mockResolvedValue({ allowed: false, status: 503 } as never);
  expect((await POST(request({ action: "connect" }))).status).toBe(503);
  expect((await GET(new NextRequest("http://localhost/api/comunicacoes/openwa"))).status).toBe(503);
  expect(openwaStatus).not.toHaveBeenCalled();
});

it.each(["connect", "refresh"])("only explicit connect can create/start (action=%s)", async (action) => {
  expect((await POST(request({ action }))).status).toBe(200);
  expect(openwaStatus).toHaveBeenCalledWith(action === "connect", expect.any(AbortSignal));
});

it("does not invent an unverified disconnect API", async () => {
  const response = await POST(request({ action: "disconnect" }));
  expect(response.status).toBe(410);
  expect(await response.json()).toMatchObject({ code: "DISCONNECT_UNSUPPORTED" });
  expect(openwaStatus).not.toHaveBeenCalled();
});

it.each([{}, null, [], { action: "start" }, { action: "connect", url: "https://evil.test" }, { action: "refresh", sessionId: "untrusted" }])("rejects unsupported lifecycle input %j", async (body) => {
  expect((await POST(request(body))).status).toBe(400);
  expect(openwaStatus).not.toHaveBeenCalled();
});

it("bounds real body bytes even without Content-Length", async () => {
  expect((await POST(request({ action: "x".repeat(2000) }))).status).toBe(413);
  expect(openwaStatus).not.toHaveBeenCalled();
});
