import axios, { AxiosError } from "axios";
import { FORTNOX_OAUTH_URL, TOKEN_REFRESH_BUFFER_MS } from "../constants.js";

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

interface TokenStorage {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
}

/**
 * Fortnox OAuth2 Authentication Manager
 *
 * Handles OAuth2 authorization code flow, token storage, and automatic refresh.
 *
 * Required environment variables:
 * - FORTNOX_CLIENT_ID: Your Fortnox app client ID
 * - FORTNOX_CLIENT_SECRET: Your Fortnox app client secret
 * - FORTNOX_REFRESH_TOKEN: Initial refresh token (obtained from OAuth flow)
 *
 * Optional:
 * - FORTNOX_ACCESS_TOKEN: Optionally provide existing access token
 */
export class FortnoxAuth {
  private clientId: string;
  private clientSecret: string;
  private tokens: TokenStorage | null = null;
  private refreshPromise: Promise<string> | null = null;

  constructor() {
    const clientId = process.env.FORTNOX_CLIENT_ID;
    const clientSecret = process.env.FORTNOX_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error(
        "Missing required environment variables: FORTNOX_CLIENT_ID and FORTNOX_CLIENT_SECRET must be set"
      );
    }

    this.clientId = clientId;
    this.clientSecret = clientSecret;

    // Initialize from environment if tokens provided
    const refreshToken = process.env.FORTNOX_REFRESH_TOKEN;
    const accessToken = process.env.FORTNOX_ACCESS_TOKEN;

    if (refreshToken) {
      this.tokens = {
        accessToken: accessToken || "",
        refreshToken: refreshToken,
        expiresAt: accessToken ? Date.now() + 3600000 : 0, // Assume 1 hour if access token provided
        scope: process.env.FORTNOX_SCOPE || ""
      };
    }
  }

  /**
   * Get a valid access token, refreshing if necessary
   */
  async getAccessToken(): Promise<string> {
    // If no tokens, we need initial authentication
    if (!this.tokens) {
      throw new Error(
        "No authentication tokens available. Set FORTNOX_REFRESH_TOKEN environment variable."
      );
    }

    // Check if token needs refresh (with buffer time)
    const needsRefresh = Date.now() >= this.tokens.expiresAt - TOKEN_REFRESH_BUFFER_MS;

    if (needsRefresh || !this.tokens.accessToken) {
      // Deduplicate concurrent refresh requests
      if (!this.refreshPromise) {
        this.refreshPromise = this.refreshAccessToken().finally(() => {
          this.refreshPromise = null;
        });
      }
      return this.refreshPromise;
    }

    return this.tokens.accessToken;
  }

  /**
   * Exchange authorization code for tokens (initial OAuth flow)
   */
  async exchangeAuthorizationCode(code: string, redirectUri: string): Promise<void> {
    const tokenUrl = `${FORTNOX_OAUTH_URL}/token`;
    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");

    try {
      const response = await axios.post<TokenResponse>(
        tokenUrl,
        new URLSearchParams({
          grant_type: "authorization_code",
          code: code,
          redirect_uri: redirectUri
        }),
        {
          headers: {
            "Authorization": `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded"
          }
        }
      );

      this.storeTokens(response.data);
    } catch (error) {
      throw this.handleAuthError(error, "Failed to exchange authorization code");
    }
  }

  /**
   * Refresh the access token using the refresh token
   */
  private async refreshAccessToken(): Promise<string> {
    if (!this.tokens?.refreshToken) {
      throw new Error("No refresh token available");
    }

    const tokenUrl = `${FORTNOX_OAUTH_URL}/token`;
    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");

    try {
      const response = await axios.post<TokenResponse>(
        tokenUrl,
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: this.tokens.refreshToken
        }),
        {
          headers: {
            "Authorization": `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded"
          }
        }
      );

      this.storeTokens(response.data);
      return this.tokens!.accessToken;
    } catch (error) {
      // Clear invalid tokens
      this.tokens = null;
      throw this.handleAuthError(error, "Failed to refresh access token");
    }
  }

  /**
   * Store tokens from OAuth response
   */
  private storeTokens(response: TokenResponse): void {
    this.tokens = {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      expiresAt: Date.now() + response.expires_in * 1000,
      scope: response.scope
    };

    // Log token refresh for debugging (to stderr so it doesn't interfere with stdio transport)
    console.error(`[FortnoxAuth] Token refreshed, expires at: ${new Date(this.tokens.expiresAt).toISOString()}`);
    console.error(`[FortnoxAuth] New refresh token: ${response.refresh_token}`);
    console.error(`[FortnoxAuth] UPDATE your config with the new FORTNOX_REFRESH_TOKEN above!`);
  }

  /**
   * Get the OAuth authorization URL for user consent
   */
  getAuthorizationUrl(redirectUri: string, scopes: string[], state?: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      scope: scopes.join(" "),
      response_type: "code",
      access_type: "offline"
    });

    if (state) {
      params.set("state", state);
    }

    return `${FORTNOX_OAUTH_URL}/auth?${params.toString()}`;
  }

  /**
   * Check if we have valid authentication
   */
  isAuthenticated(): boolean {
    return this.tokens !== null && this.tokens.refreshToken !== "";
  }

  /**
   * Get current token info (for debugging)
   */
  getTokenInfo(): { expiresAt: Date; scope: string } | null {
    if (!this.tokens) return null;
    return {
      expiresAt: new Date(this.tokens.expiresAt),
      scope: this.tokens.scope
    };
  }

  /**
   * Handle authentication errors with descriptive messages
   */
  private handleAuthError(error: unknown, context: string): Error {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      const data = error.response?.data;

      if (status === 401) {
        return new Error(
          `${context}: Invalid credentials. Check FORTNOX_CLIENT_ID and FORTNOX_CLIENT_SECRET.`
        );
      }
      if (status === 400) {
        const errorDesc = data?.error_description || data?.error || "Bad request";
        return new Error(
          `${context}: ${errorDesc}. The refresh token may be expired or revoked. ` +
          `Please re-authorize the application.`
        );
      }
      return new Error(
        `${context}: API error ${status} - ${JSON.stringify(data)}`
      );
    }

    return new Error(`${context}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Singleton instance
let authInstance: FortnoxAuth | null = null;

export function getFortnoxAuth(): FortnoxAuth {
  if (!authInstance) {
    authInstance = new FortnoxAuth();
  }
  return authInstance;
}
