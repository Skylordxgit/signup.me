import { getRedis, isRedisAvailable } from './redis';

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetInSeconds: number;
}

interface MemoryBucket {
  count: number;
  resetAt: number;
}

const memoryRateLimitStore = new Map<string, MemoryBucket>();

/**
 * Checks and increments rate limit for a given key.
 *
 * @param key Identifier for the bucket (e.g. `login:192.168.1.1` or `upload:workspace_id`)
 * @param limit Maximum allowed requests in the window
 * @param windowSeconds Duration of the rate limit window in seconds
 */
export async function checkRateLimit(
  key: string,
  limit = 20,
  windowSeconds = 60
): Promise<RateLimitResult> {
  const fullKey = `ratelimit:${key}`;
  const now = Date.now();

  const redis = getRedis();
  if (redis && isRedisAvailable()) {
    try {
      const current = await redis.incr(fullKey);
      if (current === 1) {
        await redis.expire(fullKey, windowSeconds);
      }
      const ttl = await redis.ttl(fullKey);
      const resetInSeconds = ttl > 0 ? ttl : windowSeconds;

      return {
        allowed: current <= limit,
        limit,
        remaining: Math.max(0, limit - current),
        resetInSeconds,
      };
    } catch {
      // Fallback to memory on Redis error
    }
  }

  // In-memory rate limiting fallback
  let bucket = memoryRateLimitStore.get(fullKey);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 1, resetAt: now + windowSeconds * 1000 };
    memoryRateLimitStore.set(fullKey, bucket);
    return {
      allowed: true,
      limit,
      remaining: limit - 1,
      resetInSeconds: windowSeconds,
    };
  }

  bucket.count += 1;
  const resetInSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

  return {
    allowed: bucket.count <= limit,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    resetInSeconds,
  };
}

/**
 * Helper to extract client IP address safely from trusted headers or connection.
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  const realIp = headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  const cfIp = headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.trim();
  return '127.0.0.1';
}
