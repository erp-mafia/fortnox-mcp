export interface TokenInfo {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
}

// Abstraction for local/remote token retrieval
export interface ITokenProvider {
  getAccessToken(userId?: string): Promise<string>;
  isAuthenticated(userId?: string): boolean;
  getTokenInfo(userId?: string): TokenInfo | null;
}

export interface RequestContext {
  userId?: string;
  sessionId?: string;
}

export class AuthRequiredError extends Error {
  constructor(public userId?: string) {
    super(userId
      ? `Authentication required for user ${userId}`
      : "Authentication required. Set FORTNOX_REFRESH_TOKEN environment variable."
    );
    this.name = "AuthRequiredError";
  }
}
