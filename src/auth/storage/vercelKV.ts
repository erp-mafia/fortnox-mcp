import { TokenInfo } from "../types.js";
import { ITokenStorage, StoredTokenInfo } from "./types.js";

// Token TTL: 90 days in seconds
const TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;

/**
 * Upstash Redis token storage
 * Uses Upstash's serverless Redis for token persistence on Vercel
 *
 * Required environment variables:
 * - UPSTASH_REDIS_REST_URL: Upstash Redis REST URL (or KV_REST_API_URL for backwards compat)
 * - UPSTASH_REDIS_REST_TOKEN: Upstash Redis REST token (or KV_REST_API_TOKEN)
 */
export class UpstashRedisTokenStorage implements ITokenStorage {
  private prefix: string;
  private redis: import("@upstash/redis").Redis | null = null;

  constructor(prefix = "fortnox_tokens:") {
    this.prefix = prefix;
  }

  /**
   * Lazy load the Redis client to avoid issues when @upstash/redis is not installed
   */
  private async getRedis() {
    if (!this.redis) {
      try {
        const { Redis } = await import("@upstash/redis");

        // Support both new Upstash env vars and old Vercel KV env vars
        const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
        const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

        if (!url || !token) {
          throw new Error("Missing Redis configuration");
        }

        this.redis = new Redis({ url, token });
      } catch (error) {
        throw new Error(
          "Upstash Redis not available. Install @upstash/redis and configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN."
        );
      }
    }
    return this.redis;
  }

  private key(userId: string): string {
    return `${this.prefix}${userId}`;
  }

  async get(userId: string): Promise<TokenInfo | null> {
    const redis = await this.getRedis();
    const stored = await redis.get<StoredTokenInfo>(this.key(userId));

    if (!stored) return null;

    return {
      accessToken: stored.accessToken,
      refreshToken: stored.refreshToken,
      expiresAt: stored.expiresAt,
      scope: stored.scope
    };
  }

  async set(userId: string, tokens: TokenInfo): Promise<void> {
    const redis = await this.getRedis();
    const existing = await redis.get<StoredTokenInfo>(this.key(userId));
    const now = Date.now();

    const stored: StoredTokenInfo = {
      ...tokens,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };

    // Set with TTL for automatic cleanup
    await redis.set(this.key(userId), stored, { ex: TOKEN_TTL_SECONDS });
  }

  async delete(userId: string): Promise<void> {
    const redis = await this.getRedis();
    await redis.del(this.key(userId));
  }

  async exists(userId: string): Promise<boolean> {
    const redis = await this.getRedis();
    const result = await redis.exists(this.key(userId));
    return result > 0;
  }
}

// Backwards compatibility aliases
export { UpstashRedisTokenStorage as VercelKVTokenStorage };

// Default storage instance
let redisStorage: UpstashRedisTokenStorage | null = null;

export function getVercelKVStorage(): UpstashRedisTokenStorage {
  if (!redisStorage) {
    redisStorage = new UpstashRedisTokenStorage();
  }
  return redisStorage;
}

export function getUpstashRedisStorage(): UpstashRedisTokenStorage {
  return getVercelKVStorage();
}
