import { createHmac } from "crypto";

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

// One Redis transaction: denied requests do not extend the fixed window.
export const RATE_LIMIT_SCRIPT = `
local count = tonumber(redis.call('GET', KEYS[1]) or '0')
local ttl = redis.call('PTTL', KEYS[1])
if count > 0 and ttl <= 0 then
  return redis.error_reply('Invalid rate limit TTL')
end
if count >= tonumber(ARGV[1]) then
  return {0, 0, ttl}
end
count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return {1, tonumber(ARGV[1]) - count, redis.call('PTTL', KEYS[1])}
`;

export type RateLimitResult = {
  success: boolean;
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
  status: 200 | 429 | 503;
};

export async function checkRateLimit(identifier: string, limit = 20, windowMs = 60000): Promise<RateLimitResult> {
  const unavailable: RateLimitResult = { success: false, allowed: false, remaining: 0, retryAfterMs: 0, status: 503 };
  if (!Number.isSafeInteger(limit) || limit <= 0 || !Number.isSafeInteger(windowMs) || windowMs <= 0) return unavailable;

  const backend = process.env.RATE_LIMIT_BACKEND;
  const namespace = process.env.RATE_LIMIT_NAMESPACE?.trim();
  const secret = process.env.RATE_LIMIT_KEY_SECRET?.trim();
  const environment = process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown";
  if (!namespace || !/^[a-zA-Z0-9:_-]{1,100}$/.test(namespace) || !secret) return unavailable;
  const key = `rl:${namespace}:${environment}:${createHmac("sha256", secret).update(identifier).digest("hex")}`;

  if (backend === "local" && (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") && (environment === "development" || environment === "test")) {
    const now = Date.now();
    for (const [storedKey, record] of rateLimitMap) {
      if (record.resetTime <= now) rateLimitMap.delete(storedKey);
    }
    let record = rateLimitMap.get(key);
    if (!record) {
      record = { count: 0, resetTime: now + windowMs };
      rateLimitMap.set(key, record);
    }
    if (record.count >= limit) return { success: false, allowed: false, remaining: 0, retryAfterMs: record.resetTime - now, status: 429 };
    record.count += 1;
    return { success: true, allowed: true, remaining: limit - record.count, retryAfterMs: 0, status: 200 };
  }

  if (backend !== "upstash") return unavailable;
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return unavailable;
  try {
    const endpoint = new URL(url);
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) return unavailable;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["EVAL", RATE_LIMIT_SCRIPT, "1", key, String(limit), String(windowMs)]),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return unavailable;
    const payload = await response.json();
    const result = payload?.result;
    if (payload?.error || !Array.isArray(result) || result.length !== 3) return unavailable;
    const [allowed, remaining, ttl] = result;
    if ((allowed !== 0 && allowed !== 1) || !Number.isSafeInteger(remaining) || remaining < 0 || remaining >= limit ||
        !Number.isSafeInteger(ttl) || ttl <= 0 || ttl > windowMs || (allowed === 0 && remaining !== 0)) return unavailable;
    return { success: allowed === 1, allowed: allowed === 1, remaining, retryAfterMs: allowed === 1 ? 0 : ttl, status: allowed === 1 ? 200 : 429 };
  } catch {
    // Never log identifiers, tokens, or upstream response bodies, and never fall back locally.
    return unavailable;
  }
}
