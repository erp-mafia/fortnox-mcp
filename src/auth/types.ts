/**
 * Token information stored for a user
 */
export interface TokenInfo {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
}

/**
 * Token provider interface for abstracting token retrieval
 * Allows different implementations for local (env vars) and remote (database) modes
 */
export interface ITokenProvider {
  /**
   * Get a valid access token, refreshing if necessary
   * @param userId - Optional user ID for multi-user mode (remote)
   */
  getAccessToken(userId?: string): Promise<string>;

  /**
   * Check if authentication is available
   * @param userId - Optional user ID for multi-user mode (remote)
   */
  isAuthenticated(userId?: string): boolean;

  /**
   * Get token info for debugging
   * @param userId - Optional user ID for multi-user mode (remote)
   */
  getTokenInfo(userId?: string): TokenInfo | null;
}

/**
 * Request context for passing user information through async operations
 */
export interface RequestContext {
  userId?: string;
  sessionId?: string;
}

/**
 * Error thrown when authentication is required but not available
 */
export class AuthRequiredError extends Error {
  constructor(public userId?: string) {
    super(userId
      ? `Authentication required for user ${userId}`
      : "Authentication required. Set FORTNOX_REFRESH_TOKEN environment variable."
    );
    this.name = "AuthRequiredError";
  }
}
