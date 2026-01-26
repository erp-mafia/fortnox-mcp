import { TokenInfo } from "../types.js";

/**
 * Interface for token storage backends
 * Allows different storage implementations (memory, Vercel KV, Postgres, etc.)
 */
export interface ITokenStorage {
  /**
   * Get tokens for a user
   * @param userId - Unique user identifier
   * @returns Token info or null if not found
   */
  get(userId: string): Promise<TokenInfo | null>;

  /**
   * Store tokens for a user
   * @param userId - Unique user identifier
   * @param tokens - Token information to store
   */
  set(userId: string, tokens: TokenInfo): Promise<void>;

  /**
   * Delete tokens for a user
   * @param userId - Unique user identifier
   */
  delete(userId: string): Promise<void>;

  /**
   * Check if tokens exist for a user
   * @param userId - Unique user identifier
   */
  exists(userId: string): Promise<boolean>;
}

/**
 * Extended token info with additional metadata for storage
 */
export interface StoredTokenInfo extends TokenInfo {
  /** Fortnox company ID associated with these tokens */
  fortnoxCompanyId?: string;
  /** When the tokens were first stored */
  createdAt: number;
  /** When the tokens were last updated */
  updatedAt: number;
}
