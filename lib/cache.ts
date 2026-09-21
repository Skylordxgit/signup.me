import { getRedis, isRedisAvailable } from './redis';

interface MemoryCacheEntry<T> {
  value: T;
  expiresAt: number;
}

const memoryStore = new Map<string, MemoryCacheEntry<unknown>>();
const inFlightRequests = new Map<string, Promise<unknown>>();
const MAX_MEMORY_KEYS = 5000;

function pruneMemoryStore() {
  const now = Date.now();
  for (const [key, entry] of memoryStore.entries()) {
    if (entry.expiresAt < now) {
      memoryStore.delete(key);
    }
  }
  if (memoryStore.size > MAX_MEMORY_KEYS) {
    // Evict oldest 20%
    const keys = Array.from(memoryStore.keys());
    for (let i = 0; i < Math.floor(keys.length * 0.2); i++) {
      memoryStore.delete(keys[i]);
    }
  }
}

// Periodic cleanup of expired in-memory cache keys every 60 seconds
if (typeof setInterval !== 'undefined') {
  const timer = setInterval(pruneMemoryStore, 60000);
  if (timer.unref) timer.unref();
}

/**
 * Cache GET: Fetches from Redis (if available) or In-Memory store.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const now = Date.now();
  // Check in-memory store first for microsecond response
  const mem = memoryStore.get(key);
  if (mem && mem.expiresAt > now) {
    return mem.value as T;
  }

  // Check Redis
  const redis = getRedis();
  if (redis && isRedisAvailable()) {
    try {
      const data = await redis.get(key);
      if (data) {
        const parsed = JSON.parse(data) as T;
        // Keep in memory cache with remaining TTL (up to 30s)
        memoryStore.set(key, { value: parsed, expiresAt: now + 30000 });
        return parsed;
      }
    } catch {
      // Redis get failed, fall back gracefully
    }
  }

  return null;
}

/**
 * Cache SET: Stores in Redis (with TTL) and In-Memory store.
 */
export async function cacheSet<T>(key: string, value: T, ttlSeconds = 300): Promise<void> {
  const now = Date.now();
  memoryStore.set(key, { value, expiresAt: now + ttlSeconds * 1000 });

  const redis = getRedis();
  if (redis && isRedisAvailable()) {
    try {
      await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      // Redis set failed, memory cache remains active
    }
  }
}

/**
 * Cache DELETE / Invalidate: Removes key from memory and Redis.
 */
export async function cacheDelete(key: string): Promise<void> {
  memoryStore.delete(key);
  const redis = getRedis();
  if (redis && isRedisAvailable()) {
    try {
      await redis.del(key);
    } catch {
      // Redis del failed
    }
  }
}

/**
 * Invalidate multiple keys matching a prefix or wildcard.
 */
export async function cacheInvalidatePrefix(prefix: string): Promise<void> {
  for (const key of Array.from(memoryStore.keys())) {
    if (key.startsWith(prefix)) {
      memoryStore.delete(key);
    }
  }

  const redis = getRedis();
  if (redis && isRedisAvailable()) {
    try {
      const keys = await redis.keys(`${prefix}*`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch {
      // Redis pattern del failed
    }
  }
}

/**
 * Cache-Aside with Single-Flight / Stampede Protection.
 * If 10,000 requests query the same missing or expired key simultaneously:
 * - Exactly ONE request executes `fetcher()`.
 * - All other 9,999 concurrent requests await the identical Promise and get the cached result.
 * - ZERO thundering herd / MySQL overload!
 */
export async function cacheGetOrSet<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds = 300
): Promise<T> {
  // 1. Try cache hit
  const cached = await cacheGet<T>(key);
  if (cached !== null && cached !== undefined) {
    return cached;
  }

  // 2. Stampede Protection: Single-Flight Request Coalescing
  const existingPromise = inFlightRequests.get(key);
  if (existingPromise) {
    return (await existingPromise) as T;
  }

  // 3. Initiate single-flight execution
  const fetchPromise = (async () => {
    try {
      const fresh = await fetcher();
      if (fresh !== null && fresh !== undefined) {
        await cacheSet(key, fresh, ttlSeconds);
      }
      return fresh;
    } finally {
      inFlightRequests.delete(key);
    }
  })();

  inFlightRequests.set(key, fetchPromise);
  return fetchPromise;
}
