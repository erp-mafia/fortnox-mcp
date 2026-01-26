/**
 * Backwards compatibility layer for auth
 *
 * This file maintains the old API while delegating to the new auth system.
 * New code should use src/auth/index.ts instead.
 *
 * @deprecated Use getTokenProvider() from "../auth/index.js" instead
 */

import { getTokenProvider, EnvVarTokenProvider, initializeTokenProvider } from "../auth/index.js";
import type { ITokenProvider, TokenInfo } from "../auth/types.js";

/**
 * Compatibility wrapper that provides the old FortnoxAuth interface
 * while using the new token provider system internally
 */
export class FortnoxAuth {
  private provider: ITokenProvider;

  constructor() {
    // Ensure the token provider is initialized with EnvVarTokenProvider for local mode
    const provider = new EnvVarTokenProvider();
    initializeTokenProvider(provider);
    this.provider = provider;
  }

  async getAccessToken(): Promise<string> {
    return this.provider.getAccessToken();
  }

  isAuthenticated(): boolean {
    return this.provider.isAuthenticated();
  }

  getTokenInfo(): { expiresAt: Date; scope: string } | null {
    const info = this.provider.getTokenInfo();
    if (!info) return null;
    return {
      expiresAt: new Date(info.expiresAt),
      scope: info.scope
    };
  }
}

// Singleton instance for backwards compatibility
let authInstance: FortnoxAuth | null = null;

/**
 * Get the FortnoxAuth singleton instance
 * @deprecated Use getTokenProvider() from "../auth/index.js" instead
 */
export function getFortnoxAuth(): FortnoxAuth {
  if (!authInstance) {
    authInstance = new FortnoxAuth();
  }
  return authInstance;
}
