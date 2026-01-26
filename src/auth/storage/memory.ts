import { TokenInfo } from "../types.js";
import { ITokenStorage, StoredTokenInfo } from "./types.js";

/**
 * In-memory token storage
 * Useful for development and testing
 * WARNING: Tokens are lost when the server restarts
 */
export class MemoryTokenStorage implements ITokenStorage {
  private tokens: Map<string, StoredTokenInfo> = new Map();

  async get(userId: string): Promise<TokenInfo | null> {
    const stored = this.tokens.get(userId);
    if (!stored) return null;

    // Return just the TokenInfo fields
    return {
      accessToken: stored.accessToken,
      refreshToken: stored.refreshToken,
      expiresAt: stored.expiresAt,
      scope: stored.scope
    };
  }

  async set(userId: string, tokens: TokenInfo): Promise<void> {
    const existing = this.tokens.get(userId);
    const now = Date.now();

    const stored: StoredTokenInfo = {
      ...tokens,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };

    this.tokens.set(userId, stored);
  }

  async delete(userId: string): Promise<void> {
    this.tokens.delete(userId);
  }

  async exists(userId: string): Promise<boolean> {
    return this.tokens.has(userId);
  }

  /**
   * Clear all tokens (for testing)
   */
  clear(): void {
    this.tokens.clear();
  }

  /**
   * Get count of stored tokens (for debugging)
   */
  size(): number {
    return this.tokens.size;
  }
}

// Default memory storage instance for development
let memoryStorage: MemoryTokenStorage | null = null;

export function getMemoryStorage(): MemoryTokenStorage {
  if (!memoryStorage) {
    memoryStorage = new MemoryTokenStorage();
  }
  return memoryStorage;
}
