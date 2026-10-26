import axios, { AxiosError } from "axios";
import { FORTNOX_OAUTH_URL, TOKEN_REFRESH_BUFFER_MS } from "../constants.js";
import { ITokenProvider, TokenInfo } from "./types.js";
import { getFortnoxCredentials } from "./credentials.js";
import { readProfile, writeProfile, ProfileFile } from "./profiles.js";

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
}

/**
 * Token provider for one company profile. Fortnox rotates the refresh token on every
 * refresh, so each new token is written back to that profile's own file.
 */
export class ProfileTokenProvider implements ITokenProvider {
  private tokens: TokenInfo | null;
  private refreshPromise: Promise<string> | null = null;

  constructor(
    readonly profile: string,
    initial: ProfileFile,
    private home?: string
  ) {
    this.tokens = {
      accessToken: initial.accessToken || "",
      refreshToken: initial.refreshToken,
      expiresAt: initial.expiresAt || 0,
      scope: initial.scope || ""
    };
  }

  async getAccessToken(): Promise<string> {
    if (!this.tokens) {
      throw new Error(this.reauthorizeMessage("its refresh token was rejected earlier"));
    }
    if (this.tokens.accessToken && Date.now() < this.tokens.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
      return this.tokens.accessToken;
    }
    if (!this.refreshPromise) {
      this.refreshPromise = this.refresh().finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }

  isAuthenticated(): boolean {
    return this.tokens !== null && this.tokens.refreshToken !== "";
  }

  getTokenInfo(): TokenInfo | null {
    return this.tokens;
  }

  private async refresh(): Promise<string> {
    // Another process (e.g. a second MCP client) may have rotated the token since we
    // read the file; the token we hold would then be dead, so pick up the newer one.
    const onDisk = readProfile(this.profile, this.home);
    if (onDisk && onDisk.refreshToken !== this.tokens!.refreshToken) {
      this.tokens = {
        accessToken: onDisk.accessToken || "",
        refreshToken: onDisk.refreshToken,
        expiresAt: onDisk.expiresAt || 0,
        scope: onDisk.scope || ""
      };
      if (this.tokens.accessToken && Date.now() < this.tokens.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
        return this.tokens.accessToken;
      }
    }

    const { clientId, clientSecret } = getFortnoxCredentials();
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    try {
      const response = await axios.post<TokenResponse>(
        `${FORTNOX_OAUTH_URL}/token`,
        new URLSearchParams({ grant_type: "refresh_token", refresh_token: this.tokens!.refreshToken }),
        { headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" } }
      );
      const expiresAt = Date.now() + response.data.expires_in * 1000;
      this.tokens = {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresAt,
        scope: response.data.scope
      };
      try {
        writeProfile(this.profile, {
          ...(readProfile(this.profile, this.home) ?? onDisk ?? {}),
          refreshToken: response.data.refresh_token,
          accessToken: response.data.access_token,
          expiresAt,
          scope: response.data.scope
        }, this.home);
      } catch (error) {
        console.error(
          `[FortnoxAuth] Warning: could not save the new refresh token for profile "${this.profile}": ` +
          `${error instanceof Error ? error.message : String(error)}`
        );
      }
      return this.tokens.accessToken;
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 401) {
        throw new Error(`Profile "${this.profile}": invalid client credentials. Check FORTNOX_CLIENT_ID and FORTNOX_CLIENT_SECRET.`);
      }
      if (error instanceof AxiosError && error.response?.status === 400) {
        this.tokens = null;
        throw new Error(this.reauthorizeMessage("Fortnox rejected its refresh token"));
      }
      throw new Error(
        `Profile "${this.profile}": could not refresh the access token: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private reauthorizeMessage(reason: string): string {
    return `Profile "${this.profile}" needs to be authorized again (${reason}). ` +
      `Run: npm run get-token -- --profile ${this.profile}`;
  }
}
