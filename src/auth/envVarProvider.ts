import axios, { AxiosError } from "axios";
import { FORTNOX_OAUTH_URL, TOKEN_REFRESH_BUFFER_MS } from "../constants.js";
import { ITokenProvider, TokenInfo, AuthRequiredError } from "./types.js";
import { getFortnoxCredentials } from "./credentials.js";

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

/**
 * Token provider that reads from environment variables
 * Used for local mode (npx) where user provides their own refresh token
 */
export class EnvVarTokenProvider implements ITokenProvider {
  private clientId: string;
  private clientSecret: string;
  private tokens: TokenInfo | null = null;
  private refreshPromise: Promise<string> | null = null;

  constructor() {
    const { clientId, clientSecret } = getFortnoxCredentials();
    this.clientId = clientId;
    this.clientSecret = clientSecret;

    // Initialize from environment if tokens provided
    const refreshToken = process.env.FORTNOX_REFRESH_TOKEN;
    const accessToken = process.env.FORTNOX_ACCESS_TOKEN;

    if (refreshToken) {
      this.tokens = {
        accessToken: accessToken || "",
        refreshToken: refreshToken,
        expiresAt: accessToken ? Date.now() + 3600000 : 0,
        scope: process.env.FORTNOX_SCOPE || ""
      };
    }
  }

  /**
   * Get a valid access token, refreshing if necessary
   * userId parameter is ignored in local mode (single user)
   */
  async getAccessToken(_userId?: string): Promise<string> {
    if (!this.tokens) {
      throw new AuthRequiredError();
    }

    const needsRefresh = Date.now() >= this.tokens.expiresAt - TOKEN_REFRESH_BUFFER_MS;

    if (needsRefresh || !this.tokens.accessToken) {
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
   * Check if we have valid authentication
   */
  isAuthenticated(_userId?: string): boolean {
    return this.tokens !== null && this.tokens.refreshToken !== "";
  }

  /**
   * Get current token info
   */
  getTokenInfo(_userId?: string): TokenInfo | null {
    return this.tokens;
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

    console.error(`[FortnoxAuth] Token refreshed, expires at: ${new Date(this.tokens.expiresAt).toISOString()}`);
    console.error(`[FortnoxAuth] New refresh token: ${response.refresh_token}`);
    console.error(`[FortnoxAuth] UPDATE your config with the new FORTNOX_REFRESH_TOKEN above!`);
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
