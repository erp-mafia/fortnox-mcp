/**
 * Server configuration
 *
 * Determines the mode of operation and required settings
 */

export type AuthMode = "local" | "remote";
export type TransportMode = "stdio" | "http";

export interface ServerConfig {
  /** Authentication mode: local (env vars) or remote (OAuth) */
  authMode: AuthMode;

  /** Transport mode for local auth: stdio or http */
  transport: TransportMode;

  /** Server URL for remote mode (required in remote mode) */
  serverUrl?: string;

  /** JWT secret for remote mode (required in remote mode) */
  jwtSecret?: string;

  /** HTTP port (for http transport or remote mode) */
  port: number;
}

/**
 * Load configuration from environment variables
 */
export function loadConfig(): ServerConfig {
  const authMode = (process.env.AUTH_MODE as AuthMode) || "local";
  const transport = (process.env.TRANSPORT as TransportMode) || "stdio";
  const port = parseInt(process.env.PORT || "3000", 10);

  const config: ServerConfig = {
    authMode,
    transport,
    port,
  };

  // Validate remote mode configuration
  if (authMode === "remote") {
    config.serverUrl = process.env.SERVER_URL;
    config.jwtSecret = process.env.JWT_SECRET;

    if (!config.serverUrl) {
      throw new Error(
        "SERVER_URL environment variable is required in remote mode"
      );
    }

    if (!config.jwtSecret) {
      throw new Error(
        "JWT_SECRET environment variable is required in remote mode"
      );
    }

    // In remote mode, always use HTTP transport
    config.transport = "http";
  }

  return config;
}

/**
 * Validate that required environment variables are set for the given mode
 */
export function validateEnvironment(config: ServerConfig): void {
  if (config.authMode === "local") {
    // Check for Fortnox credentials
    if (!process.env.FORTNOX_CLIENT_ID || !process.env.FORTNOX_CLIENT_SECRET) {
      console.error(
        "WARNING: FORTNOX_CLIENT_ID and FORTNOX_CLIENT_SECRET are not set."
      );
    }

    if (!process.env.FORTNOX_REFRESH_TOKEN) {
      console.error(
        "WARNING: FORTNOX_REFRESH_TOKEN is not set. Authentication will fail."
      );
    }
  }

  if (config.authMode === "remote") {
    // Check for storage configuration
    if (!process.env.UPSTASH_REDIS_REST_URL && !process.env.KV_REST_API_URL) {
      console.error(
        "WARNING: No Redis configuration found. Using in-memory storage (not recommended for production)."
      );
    }
  }
}

/**
 * Log the current configuration (without sensitive values)
 */
export function logConfig(config: ServerConfig): void {
  console.error("[FortnoxMCP] Configuration:");
  console.error(`  - Auth mode: ${config.authMode}`);
  console.error(`  - Transport: ${config.transport}`);

  if (config.authMode === "remote") {
    console.error(`  - Server URL: ${config.serverUrl}`);
    console.error(`  - JWT secret: ***`);
  }

  if (config.transport === "http" || config.authMode === "remote") {
    console.error(`  - Port: ${config.port}`);
  }
}
