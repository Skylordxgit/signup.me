import Redis from 'ioredis';

let redisClient: Redis | null = null;
let isRedisConnected = false;
let redisInitAttempted = false;

export function getRedisConfig(): { url: string } | { host: string; port: number; password?: string; db: number } | null {
  const url = process.env.REDIS_URL || process.env.REDISCLOUD_URL;
  if (url) return { url };

  const host = process.env.REDIS_HOST;
  if (host) {
    return {
      host,
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      db: Number(process.env.REDIS_DB || 0),
    };
  }
  return null;
}

export function isRedisConfigured(): boolean {
  return Boolean(getRedisConfig());
}

export function getRedis(): Redis | null {
  if (redisClient) return redisClient;
  const config = getRedisConfig();
  if (!config) return null;

  if (redisInitAttempted) return redisClient;
  redisInitAttempted = true;

  try {
    const client = 'url' in config
      ? new Redis(config.url, {
          maxRetriesPerRequest: 2,
          enableReadyCheck: true,
          connectTimeout: 4000,
          lazyConnect: true,
          retryStrategy(times: number) {
            if (times > 5) return null; // Stop retrying after 5 attempts to avoid hanging
            return Math.min(times * 200, 2000);
          },
        })
      : new Redis({
          host: config.host,
          port: config.port,
          password: config.password,
          db: config.db,
          maxRetriesPerRequest: 2,
          enableReadyCheck: true,
          connectTimeout: 4000,
          lazyConnect: true,
          retryStrategy(times: number) {
            if (times > 5) return null;
            return Math.min(times * 200, 2000);
          },
        });

    client.on('connect', () => {
      isRedisConnected = true;
    });

    client.on('ready', () => {
      isRedisConnected = true;
    });

    client.on('error', (err) => {
      isRedisConnected = false;
      // Log connection error in non-production or once
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[Redis] Connection warning:', err.message);
      }
    });

    client.on('close', () => {
      isRedisConnected = false;
    });

    // Initiate connection asynchronously without blocking
    client.connect().catch((err) => {
      isRedisConnected = false;
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[Redis] Could not connect to Redis server:', err.message);
      }
    });

    redisClient = client;
    return redisClient;
  } catch (error) {
    console.warn('[Redis] Initialization error:', error);
    return null;
  }
}

export function isRedisAvailable(): boolean {
  return isRedisConnected && redisClient !== null && redisClient.status === 'ready';
}
