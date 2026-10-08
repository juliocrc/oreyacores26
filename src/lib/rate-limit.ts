/**
 * OREYACORESDELUXE - Simple In-Memory Rate Limiter for Sensitive API Routes
 */

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(identifier: string, limit = 20, windowMs = 60000): { success: boolean; allowed: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  let record = rateLimitMap.get(identifier);

  if (!record || now > record.resetTime) {
    record = { count: 1, resetTime: now + windowMs };
    rateLimitMap.set(identifier, record);
    return { success: true, allowed: true, remaining: limit - 1, retryAfterMs: 0 };
  }

  if (record.count >= limit) {
    const retryAfterMs = record.resetTime - now;
    return { success: false, allowed: false, remaining: 0, retryAfterMs };
  }

  record.count += 1;
  rateLimitMap.set(identifier, record);
  return { success: true, allowed: true, remaining: limit - record.count, retryAfterMs: 0 };
}
