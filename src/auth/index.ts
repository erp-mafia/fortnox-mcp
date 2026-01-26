/**
 * Auth module - provides authentication abstraction for local and remote modes
 */

export * from "./types.js";
export * from "./context.js";
export * from "./credentials.js";
export { EnvVarTokenProvider } from "./envVarProvider.js";
export { DatabaseTokenProvider } from "./databaseProvider.js";
export { FortnoxProxyOAuthProvider, getUserIdFromAuth } from "./oauthProvider.js";
export * from "./storage/index.js";

import { ITokenProvider } from "./types.js";
import { EnvVarTokenProvider } from "./envVarProvider.js";
import { DatabaseTokenProvider } from "./databaseProvider.js";
import { getStorageFromEnv } from "./storage/index.js";

// Global token provider instance
let tokenProvider: ITokenProvider | null = null;

/**
 * Initialize the token provider
 * Call this at startup with the appropriate provider for your mode
 */
export function initializeTokenProvider(provider: ITokenProvider): void {
  tokenProvider = provider;
}

/**
 * Get the current token provider
 * Defaults to EnvVarTokenProvider if not explicitly initialized
 */
export function getTokenProvider(): ITokenProvider {
  if (!tokenProvider) {
    tokenProvider = new EnvVarTokenProvider();
  }
  return tokenProvider;
}

/**
 * Create the appropriate token provider based on mode
 */
export function createTokenProvider(mode: "local" | "remote"): ITokenProvider {
  if (mode === "remote") {
    const storage = getStorageFromEnv();
    return new DatabaseTokenProvider(storage);
  }
  return new EnvVarTokenProvider();
}
