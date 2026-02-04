export type AuthMode = "local" | "remote";
export type TransportMode = "stdio" | "http";

export interface ServerConfig {
  authMode: AuthMode;
  transport: TransportMode;
  serverUrl?: string;
  jwtSecret?: string;
  port: number;
}

export function loadConfig(): ServerConfig {
  const authMode = (process.env.AUTH_MODE as AuthMode) || "local";
  const transport = (process.env.TRANSPORT as TransportMode) || "stdio";
  const port = parseInt(process.env.PORT || "3000", 10);

  const config: ServerConfig = {
    authMode,
    transport,
    port,
  };

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

export function validateEnvironment(_config: ServerConfig): void {
  // Validation handled by loadConfig throwing on missing required vars
}

export function logConfig(_config: ServerConfig): void {
  // Logging removed - callers can log if needed
}
