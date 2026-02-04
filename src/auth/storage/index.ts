export * from "./types.js";
export { MemoryTokenStorage, getMemoryStorage } from "./memory.js";
export {
  UpstashRedisTokenStorage,
  VercelKVTokenStorage,
  getVercelKVStorage,
  getUpstashRedisStorage
} from "./vercelKV.js";

import { ITokenStorage } from "./types.js";
import { MemoryTokenStorage } from "./memory.js";
import { UpstashRedisTokenStorage } from "./vercelKV.js";

export type StorageType = "memory" | "vercel-kv" | "upstash-redis";

export function createTokenStorage(type: StorageType): ITokenStorage {
  switch (type) {
    case "vercel-kv":
    case "upstash-redis":
      return new UpstashRedisTokenStorage();
    case "memory":
    default:
      return new MemoryTokenStorage();
  }
}

export function getStorageFromEnv(): ITokenStorage {
  const storageType = process.env.TOKEN_STORAGE as StorageType | undefined;

  // Default to upstash-redis in production, memory in development
  if (storageType) {
    return createTokenStorage(storageType);
  }

  // Auto-detect based on environment
  if (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) {
    return new UpstashRedisTokenStorage();
  }

  console.error("[Storage] Warning: Using in-memory storage. Tokens will be lost on restart.");
  return new MemoryTokenStorage();
}
