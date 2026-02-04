import axios, { AxiosError } from "axios";
import { FORTNOX_OAUTH_URL, TOKEN_REFRESH_BUFFER_MS } from "../constants.js";
import { ITokenProvider, TokenInfo, AuthRequiredError } from "./types.js";
import { ITokenStorage } from "./storage/types.js";
import { getFortnoxCredentials } from "./credentials.js";

// Token provider for remote mode (multi-user with database storage)
export class DatabaseTokenProvider implements ITokenProvider {
  private clientId: string;
  private clientSecret: string;
  private storage: ITokenStorage;
  private refreshPromises: Map<string, Promise<string>> = new Map();

  constructor(storage: ITokenStorage) {
    const { clientId, clientSecret } = getFortnoxCredentials();
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.storage = storage;
  }

  async getAccessToken(userId?: string): Promise<string> {
    if (!userId) {
      throw new AuthRequiredError();
    }

    const tokens = await this.storage.get(userId);
    if (!tokens) {
      throw new AuthRequiredError(userId);
    }

    const needsRefresh = Date.now() >= tokens.expiresAt - TOKEN_REFRESH_BUFFER_MS;

    if (needsRefresh || !tokens.accessToken) {
      // Deduplicate concurrent refresh requests per user
      if (!this.refreshPromises.has(userId)) {
        const promise = this.refreshAccessToken(userId, tokens).finally(() => {
          this.refreshPromises.delete(userId);
        });
        this.refreshPromises.set(userId, promise);
      }
      return this.refreshPromises.get(userId)!;
    }

    return tokens.accessToken;
  }

  isAuthenticated(userId?: string): boolean {
    // For async storage, we can't check synchronously
    // Return true and let getAccessToken throw if not authenticated
    return !!userId;
  }

  getTokenInfo(userId?: string): TokenInfo | null {
    // For async storage, return null (caller should use async methods)
    return null;
  }

  async getTokenInfoAsync(userId: string): Promise<TokenInfo | null> {
    return this.storage.get(userId);
  }

  async storeTokens(userId: string, tokens: TokenInfo): Promise<void> {
    await this.storage.set(userId, tokens);
  }

  async deleteTokens(userId: string): Promise<void> {
    await this.storage.delete(userId);
  }

  async exchangeAuthorizationCode(
    code: string,
    redirectUri: string,
    userId: string
  ): Promise<TokenInfo> {
    const tokenUrl = `${FORTNOX_OAUTH_URL}/token`;
    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");

    try {
      const response = await axios.post<{
        access_token: string;
        refresh_token: string;
        token_type: string;
        expires_in: number;
        scope: string;
      }>(
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

      const tokens: TokenInfo = {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresAt: Date.now() + response.data.expires_in * 1000,
        scope: response.data.scope
      };

      await this.storeTokens(userId, tokens);
      return tokens;
    } catch (error) {
      throw this.handleAuthError(error, "Failed to exchange authorization code");
    }
  }

  private async refreshAccessToken(userId: string, tokens: TokenInfo): Promise<string> {
    if (!tokens.refreshToken) {
      throw new Error("No refresh token available");
    }

    const tokenUrl = `${FORTNOX_OAUTH_URL}/token`;
    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");

    try {
      const response = await axios.post<{
        access_token: string;
        refresh_token: string;
        token_type: string;
        expires_in: number;
        scope: string;
      }>(
        tokenUrl,
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: tokens.refreshToken
        }),
        {
          headers: {
            "Authorization": `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded"
          }
        }
      );

      const newTokens: TokenInfo = {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresAt: Date.now() + response.data.expires_in * 1000,
        scope: response.data.scope
      };

      await this.storeTokens(userId, newTokens);
      return newTokens.accessToken;
    } catch (error) {
      // Clear invalid tokens
      await this.storage.delete(userId);
      throw this.handleAuthError(error, "Failed to refresh access token");
    }
  }

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

  private handleAuthError(error: unknown, context: string): Error {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      const data = error.response?.data;

      if (status === 401) {
        return new Error(
          `${context}: Invalid credentials. Check Fortnox client configuration.`
        );
      }
      if (status === 400) {
        const errorDesc = data?.error_description || data?.error || "Bad request";
        return new Error(
          `${context}: ${errorDesc}. The refresh token may be expired or revoked.`
        );
      }
      return new Error(
        `${context}: API error ${status} - ${JSON.stringify(data)}`
      );
    }

    return new Error(`${context}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
