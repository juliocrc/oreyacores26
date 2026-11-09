import { isOpenwaConfigured, openwaStatus, sendOpenwa } from "../openwa";

const originalFetch = global.fetch;
const env = { ...process.env };
const fetchMock = jest.fn();
const ready = { id: "ephemeral-1", name: "orey-acores", status: "ready" };
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

beforeEach(() => {
  jest.useFakeTimers({ now: new Date("2026-07-06T10:00:00Z") });
  jest.resetAllMocks();
  process.env = { ...env, WHATSAPP_PROVIDER: "openwa", OPENWA_BASE_URL: "https://orey-openwa.onrender.com", OPENWA_API_KEY: "server-only-test-key" };
  delete process.env.OPENWA_SESSION_NAME;
  global.fetch = fetchMock;
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); process.env = { ...env }; global.fetch = originalFetch; });

it.each([
  "http://orey-openwa.onrender.com", "https://user:pass@orey-openwa.onrender.com", "https://orey-openwa.onrender.com?secret=x",
  "https://orey-openwa.onrender.com#fragment", "https://orey-openwa.onrender.com/api", "https://orey-openwa.onrender.com:8443",
  "https://localhost", "https://127.0.0.1", "https://10.0.0.1", "https://169.254.169.254", "https://[::1]",
  "https://orey-openwa.onrender.com.evil.test", "https://evil.test", "invalid",
])("rejects unsafe target %s without sending credentials", async (target) => {
  process.env.OPENWA_BASE_URL = target;
  expect(isOpenwaConfigured()).toBe(false);
  expect(await openwaStatus()).toMatchObject({ configured: false, ready: false });
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each(["", "secret\r\nX-Injected: yes", " key", "key\t", "a".repeat(4097)])("rejects unsafe/missing API keys", (key) => {
  process.env.OPENWA_API_KEY = key;
  expect(isOpenwaConfigured()).toBe(false);
});

it("requires explicit provider selection, not merely OpenWA env credentials", () => {
  delete process.env.WHATSAPP_PROVIDER;
  expect(isOpenwaConfigured()).toBe(false);
});

it("status does not create or start a missing session", async () => {
  fetchMock.mockResolvedValue(response([]));
  expect(await openwaStatus()).toMatchObject({ configured: true, ready: false, status: "absent" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toBe("https://orey-openwa.onrender.com/api/sessions?name=orey-acores");
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "GET", redirect: "error", cache: "no-store", headers: { "X-API-Key": "server-only-test-key" } });
});

it("cancels provider status requests when the caller closes the connection", async () => {
  const controller = new AbortController();
  fetchMock.mockImplementation((_, options) => new Promise((_, reject) => {
    options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
  }));
  const pending = openwaStatus(true, controller.signal);
  controller.abort();
  expect(await pending).toMatchObject({ status: "unavailable" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
});

it("does no provider I/O for an already aborted request", async () => {
  const controller = new AbortController(); controller.abort();
  expect(await openwaStatus(true, controller.signal)).toMatchObject({ status: "unavailable" });
  expect(fetchMock).not.toHaveBeenCalled();
});

it("bounds the whole lifecycle rather than adding each request timeout", async () => {
  jest.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException("timeout", "TimeoutError")), ms);
    return controller.signal;
  });
  fetchMock.mockImplementationOnce(() => new Promise((resolve) => {
    setTimeout(() => resolve(response([{ ...ready, status: "disconnected" }])), 89_000);
  })).mockImplementationOnce((_, options) => new Promise((_, reject) => {
    options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
  }));
  const pending = openwaStatus(true);
  await jest.advanceTimersByTimeAsync(89_000);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[1][0]).toContain("/start");
  await jest.advanceTimersByTimeAsync(11_000);
  expect(await pending).toMatchObject({ status: "unavailable" });
  expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it.each(["created", "initializing", "qr_ready", "authenticating", "ready", "disconnected", "action_required", "failed"])("ordinary status never mutates a %s session", async (status) => {
  fetchMock.mockImplementation(async (url: string) => response(url.endsWith("/qr") ? {} : url.includes("?name=") ? [{ ...ready, status }] : { ...ready, status }));
  expect(await openwaStatus()).toMatchObject({ configured: true, ready: status === "ready", status });
  expect(fetchMock.mock.calls.every(([, options]) => options.method === "GET")).toBe(true);
});

it.each(["initializing", "qr_ready", "authenticating", "ready"])("repeated connect does not restart a %s session", async (status) => {
  fetchMock.mockImplementation(async (url: string) => response(url.endsWith("/qr") ? {} : url.includes("?name=") ? [{ ...ready, status }] : { ...ready, status }));
  expect(await openwaStatus(true)).toMatchObject({ status });
  expect(await openwaStatus(true)).toMatchObject({ status });
  expect(fetchMock.mock.calls.every(([, options]) => options.method === "GET")).toBe(true);
});

it.each([201, 409])("connect creates or rereads a duplicate (%s), then starts without a body", async (status) => {
  fetchMock.mockResolvedValueOnce(response([]))
    .mockResolvedValueOnce(response(status === 201 ? { id: "ephemeral-2" } : { error: "duplicate" }, status))
    .mockResolvedValueOnce(response([{ ...ready, id: "ephemeral-2", status: "created" }]))
    .mockResolvedValueOnce(response({ status: "initializing" }))
    .mockResolvedValueOnce(response({ ...ready, id: "ephemeral-2", status: "initializing" }));
  expect(await openwaStatus(true)).toMatchObject({ status: "initializing", ready: false });
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ name: "orey-acores" });
  expect(fetchMock.mock.calls[3]).toEqual(["https://orey-openwa.onrender.com/api/sessions/ephemeral-2/start", expect.objectContaining({ method: "POST" })]);
  expect(fetchMock.mock.calls[3][1].body).toBeUndefined();
});

it("bounds QR PNGs and never exposes a session ID or API key", async () => {
  const png = `data:image/png;base64,${Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]).toString("base64")}`;
  fetchMock.mockResolvedValueOnce(response([{ ...ready, status: "qr_ready" }]))
    .mockResolvedValueOnce(response({ ...ready, status: "qr_ready" }))
    .mockResolvedValueOnce(response({ qrCode: png, status: "qr_ready" }));
  const result = await openwaStatus();
  expect(result).toMatchObject({ status: "qr_ready", qrCode: png, ready: false });
  expect(JSON.stringify(result)).not.toContain(ready.id);
  expect(JSON.stringify(result)).not.toContain(process.env.OPENWA_API_KEY);
});

it.each(["https://evil.test/qr.png", "data:image/svg+xml;base64,AAAA", "data:image/png;base64,AAAA", `data:image/png;base64,${"A".repeat(700_000)}`])("rejects unsafe or oversized QR payloads", async (qrCode) => {
  fetchMock.mockResolvedValueOnce(response([{ ...ready, status: "qr_ready" }])).mockResolvedValueOnce(response({ ...ready, status: "qr_ready" })).mockResolvedValueOnce(response({ qrCode }));
  expect(await openwaStatus()).not.toHaveProperty("qrCode");
});

it("treats QR not ready 400 as nonfatal", async () => {
  fetchMock.mockResolvedValueOnce(response([{ ...ready, status: "qr_ready" }])).mockResolvedValueOnce(response({ ...ready, status: "qr_ready" })).mockResolvedValueOnce(response({ error: "not ready" }, 400));
  expect(await openwaStatus()).toMatchObject({ status: "qr_ready", ready: false });
});

it("rediscovers ephemeral IDs for every send and uses stable communication idempotency keys", async () => {
  fetchMock.mockResolvedValueOnce(response([ready])).mockResolvedValueOnce(response({ messageId: "message-1", timestamp: 123 }, 201))
    .mockResolvedValueOnce(response([{ ...ready, id: "ephemeral-2" }])).mockResolvedValueOnce(response({ messageId: "message-2", timestamp: 124 }, 201));
  expect(await sendOpenwa("912345678", { text: "Hello" }, 42)).toEqual({ ok: true, providerId: "message-1" });
  expect(await sendOpenwa("912345678", { text: "Hello" }, 43)).toEqual({ ok: true, providerId: "message-2" });
  expect(fetchMock.mock.calls[1][0]).toContain("/ephemeral-1/messages/send-text");
  expect(fetchMock.mock.calls[3][0]).toContain("/ephemeral-2/messages/send-text");
  expect(fetchMock.mock.calls[1][1].headers["Idempotency-Key"]).toBe("orey-communication-42");
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ chatId: "351912345678@c.us", text: "Hello", linkPreview: false });
  expect(fetchMock.mock.calls[1][1].signal).toBeInstanceOf(AbortSignal);
});

it("sends bounded raw base64 MP3 audio, not a URL, PTT or text fallback", async () => {
  fetchMock.mockResolvedValueOnce(response([ready])).mockResolvedValueOnce(response({ messageId: "audio-1", timestamp: 123 }, 201));
  expect((await sendOpenwa("912345678", { audio: Buffer.from("mp3") }, 42)).ok).toBe(true);
  expect(fetchMock.mock.calls[1][0]).toContain("/messages/send-audio");
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ chatId: "351912345678@c.us", base64: "bXAz", mimetype: "audio/mpeg", ptt: false });
});

it("sends the PDF as a separate document with a stable idempotency key", async () => {
  fetchMock.mockResolvedValueOnce(response([ready])).mockResolvedValueOnce(response({ messageId: "doc-1", timestamp: 123 }, 201));
  const pdf = Buffer.from("%PDF-1.4\nexample");
  expect(await sendOpenwa("912345678", { pdf, filename: "fatura.pdf" }, 42)).toEqual({ ok: true, providerId: "doc-1" });
  expect(fetchMock.mock.calls[1][0]).toContain("/messages/send-document");
  expect(fetchMock.mock.calls[1][1].headers["Idempotency-Key"]).toBe("orey-communication-42");
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ chatId: "351912345678@c.us", base64: pdf.toString("base64"), mimetype: "application/pdf", filename: "fatura.pdf" });
});

it.each([409, 408, 500, 502, 503])("never retries or falls back for ambiguous HTTP %s", async (status) => {
  fetchMock.mockResolvedValueOnce(response([ready])).mockResolvedValueOnce(response({ error: "secret provider detail" }, status));
  const result = await sendOpenwa("912345678", { audio: Buffer.from("mp3") }, 42);
  expect(result).toMatchObject({ ok: false, uncertain: true });
  expect(JSON.stringify(result)).not.toContain("secret");
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it.each([new Error("secret network detail"), new DOMException("timeout", "TimeoutError")])("never retries after thrown send failures", async (error) => {
  fetchMock.mockResolvedValueOnce(response([ready])).mockRejectedValueOnce(error);
  expect(await sendOpenwa("912345678", { text: "Hello" }, 42)).toMatchObject({ ok: false, uncertain: true });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it.each([null, {}, { messageId: "id" }, { timestamp: 123 }, { messageId: "", timestamp: 123 }])("does not invent acceptance for malformed send response %j", async (data) => {
  fetchMock.mockResolvedValueOnce(response([ready])).mockResolvedValueOnce(response(data, 201));
  expect(await sendOpenwa("912345678", { audio: Buffer.from("mp3") }, 42)).toMatchObject({ ok: false, uncertain: true });
});

it("does not retry redirects, non-JSON acceptance or oversized responses", async () => {
  for (const reply of [new Response("not json", { status: 201 }), response({ messageId: "x".repeat(1024 * 1024), timestamp: 123 }, 201)]) {
    fetchMock.mockResolvedValueOnce(response([ready])).mockResolvedValueOnce(reply);
    expect(await sendOpenwa("912345678", { text: "Hello" }, 42)).toMatchObject({ ok: false, uncertain: true });
  }
  expect(fetchMock).toHaveBeenCalledTimes(4);
});

it("definite rejection is not falsely accepted or retried", async () => {
  fetchMock.mockResolvedValueOnce(response([ready])).mockResolvedValueOnce(response({}, 400));
  expect(await sendOpenwa("912345678", { text: "Hello" }, 42)).toEqual({ ok: false, error: expect.stringContaining("400") });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it.each(["created", "initializing", "disconnected", "failed"])("does not create/start or send to an unready session: %s", async (status) => {
  fetchMock.mockResolvedValue(response([{ ...ready, status }]));
  expect((await sendOpenwa("912345678", { text: "Hello" }, 42)).ok).toBe(false);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("rejects missing persistent IDs and oversized audio before any network I/O", async () => {
  expect((await sendOpenwa("912345678", { text: "Hello" })).ok).toBe(false);
  expect((await sendOpenwa("912345678", { audio: Buffer.alloc(10 * 1024 * 1024 + 1) }, 42)).ok).toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("rejects out-of-hours sends without silently queuing or calling OpenWA", async () => {
  jest.setSystemTime(new Date("2026-07-06T12:30:00Z"));
  expect(await sendOpenwa("912345678", { text: "access code" }, 42)).toMatchObject({ ok: false, closed: true });
  expect(fetchMock).not.toHaveBeenCalled();
});
