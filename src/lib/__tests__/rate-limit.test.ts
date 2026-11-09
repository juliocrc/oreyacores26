import { checkRateLimit, RATE_LIMIT_SCRIPT } from "../rate-limit";

const originalFetch = global.fetch;
let fetchMock: jest.Mock;

beforeEach(() => {
  jest.replaceProperty(process, "env", {
    NODE_ENV: "test", RATE_LIMIT_BACKEND: "upstash", RATE_LIMIT_NAMESPACE: "limiter-test",
    RATE_LIMIT_KEY_SECRET: "test-only-hmac-secret", UPSTASH_REDIS_REST_URL: "https://redis.example.com",
    UPSTASH_REDIS_REST_TOKEN: "test-only-token",
  });
  fetchMock = jest.fn().mockResolvedValue(Response.json({ result: [1, 2, 60000] }));
  global.fetch = fetchMock;
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

it("sends a single authenticated EVAL with hashed, environment-scoped keys", async () => {
  expect(await checkRateLimit("email:owner@example.com", 3)).toMatchObject({ allowed: true, remaining: 2, status: 200 });
  const [url, options] = fetchMock.mock.calls[0];
  expect(String(url)).toBe("https://redis.example.com/");
  expect(options).toMatchObject({ method: "POST", cache: "no-store", redirect: "error", headers: { Authorization: "Bearer test-only-token" } });
  const command = JSON.parse(options.body);
  expect(command).toEqual(["EVAL", RATE_LIMIT_SCRIPT, "1", expect.stringMatching(/^rl:limiter-test:test:[a-f0-9]{64}$/), "3", "60000"]);
  expect(options.body).not.toContain("owner@example.com");
  expect(options.body).not.toContain("test-only-hmac-secret");
});

it("hashes global, identity and id keys consistently and isolates environments", async () => {
  for (const key of ["client-code:global", "client-code:email:owner@example.com", "client-code:id:7"]) {
    await checkRateLimit(key, 3);
    await checkRateLimit(key, 3);
  }
  const keys = fetchMock.mock.calls.map(([, options]) => JSON.parse(options.body)[3]);
  expect(new Set(keys).size).toBe(3);
  expect(keys[0]).toBe(keys[1]);
  process.env.VERCEL_ENV = "preview";
  await checkRateLimit("client-code:global", 3);
  expect(JSON.parse(fetchMock.mock.calls[6][1].body)[3]).not.toBe(keys[0]);
});

it("returns quota denial with Redis TTL", async () => {
  fetchMock.mockResolvedValue(Response.json({ result: [0, 0, 12345] }));
  expect(await checkRateLimit("quota", 3)).toEqual({ success: false, allowed: false, remaining: 0, retryAfterMs: 12345, status: 429 });
});

it.each(["RATE_LIMIT_BACKEND", "RATE_LIMIT_NAMESPACE", "RATE_LIMIT_KEY_SECRET", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"])("fails closed without %s", async (key) => {
  delete process.env[key];
  expect(await checkRateLimit("secret", 3)).toMatchObject({ allowed: false, status: 503 });
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each(["enabled", "false", "disabled", "unknown"])("does not allow an unsupported backend %s", async (backend) => {
  process.env.RATE_LIMIT_BACKEND = backend;
  expect(await checkRateLimit("secret", 3)).toMatchObject({ allowed: false, status: 503 });
});

it.each([
  { error: "ERR" }, {}, { result: null }, { result: [1, 2] },
  { result: [1, 2, -1] }, { result: [1, 2, 60001] }, { result: [1, 3, 1000] },
  { result: [0, 1, 1000] }, { result: ["1", 2, 1000] }, { result: [1, 2.5, 1000] },
])("fails closed on invalid Redis reply %j", async (payload) => {
  fetchMock.mockResolvedValue(Response.json(payload));
  expect(await checkRateLimit("secret", 3)).toMatchObject({ allowed: false, status: 503 });
});

it("does not fall back on network errors, timeouts, HTTP errors or invalid JSON", async () => {
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  for (const result of [new Error("token or PII"), new DOMException("timeout", "TimeoutError"), new Response("secret", { status: 401 }), new Response("not json")]) {
    if (result instanceof Error) fetchMock.mockRejectedValueOnce(result);
    else fetchMock.mockResolvedValueOnce(result);
    expect(await checkRateLimit("owner@example.com", 3)).toMatchObject({ allowed: false, status: 503 });
  }
  expect(log).not.toHaveBeenCalled();
});

it("rejects insecure Redis URLs", async () => {
  process.env.UPSTASH_REDIS_REST_URL = "http://redis.example.com";
  expect(await checkRateLimit("secret", 3)).toMatchObject({ status: 503 });
  expect(fetchMock).not.toHaveBeenCalled();
});

it("permits only explicitly configured local development/test and expires at the exact boundary", async () => {
  process.env.RATE_LIMIT_BACKEND = "local";
  const clock = jest.spyOn(Date, "now").mockReturnValue(1000);
  expect(await checkRateLimit("local-boundary", 1, 100)).toMatchObject({ allowed: true });
  clock.mockReturnValue(1050);
  expect(await checkRateLimit("local-boundary", 1, 100)).toMatchObject({ status: 429, retryAfterMs: 50 });
  clock.mockReturnValue(1100);
  expect(await checkRateLimit("local-boundary", 1, 100)).toMatchObject({ allowed: true });
  jest.replaceProperty(process, "env", { ...process.env, NODE_ENV: "production" });
  expect(await checkRateLimit("local-boundary", 1, 100)).toMatchObject({ status: 503 });
  jest.replaceProperty(process, "env", { ...process.env, NODE_ENV: "development" });
  process.env.VERCEL_ENV = "production";
  expect(await checkRateLimit("local-boundary", 1, 100)).toMatchObject({ status: 503 });
  process.env.VERCEL_ENV = "preview";
  expect(await checkRateLimit("local-boundary", 1, 100)).toMatchObject({ status: 503 });
});

it("shares quota across concurrent callers via mocked REST (not a real Redis/Lua test)", async () => {
  const store = new Map<string, { count: number; reset: number }>();
  let now = 1000;
  fetchMock.mockImplementation(async (_url, options) => {
    const [command, script, , key, limit, window] = JSON.parse(options.body);
    expect(command).toBe("EVAL");
    expect(script).toBe(RATE_LIMIT_SCRIPT);
    let record = store.get(key);
    if (!record || now >= record.reset) {
      record = { count: 0, reset: now + Number(window) };
      store.set(key, record);
    }
    if (record.count >= Number(limit)) return Response.json({ result: [0, 0, record.reset - now] });
    record.count++;
    return Response.json({ result: [1, Number(limit) - record.count, record.reset - now] });
  });
  const results = await Promise.all(Array.from({ length: 40 }, () => checkRateLimit("shared", 3, 100)));
  expect(results.filter(result => result.allowed)).toHaveLength(3);
  expect(results.filter(result => result.status === 429)).toHaveLength(37);
  now = 1050;
  expect(await checkRateLimit("shared", 3, 100)).toMatchObject({ status: 429, retryAfterMs: 50 });
  now = 1100;
  expect(await checkRateLimit("shared", 3, 100)).toMatchObject({ allowed: true });
});
