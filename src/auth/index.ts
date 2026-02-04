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

export function initializeTokenProvider(provider: ITokenProvider): void {
  tokenProvider = provider;
}

export function getTokenProvider(): ITokenProvider {
  if (!tokenProvider) {
    tokenProvider = new EnvVarTokenProvider();
  }
  return tokenProvider;
}

export function createTokenProvider(mode: "local" | "remote"): ITokenProvider {
  if (mode === "remote") {
    const storage = getStorageFromEnv();
    return new DatabaseTokenProvider(storage);
  }
  return new EnvVarTokenProvider();
}
