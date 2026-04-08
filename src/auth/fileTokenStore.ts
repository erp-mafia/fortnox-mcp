import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

interface PersistedTokens {
  refreshToken: string;
  accessToken?: string;
  expiresAt?: number;
  scope?: string;
  updatedAt: number;
}

const TOKEN_DIR = join(homedir(), ".fortnox-mcp");
const TOKEN_FILE = join(TOKEN_DIR, "tokens.json");

function ensureDir(): void {
  if (!existsSync(TOKEN_DIR)) {
    mkdirSync(TOKEN_DIR, { mode: 0o700, recursive: true });
  }
}

export function readPersistedTokens(): PersistedTokens | null {
  try {
    if (!existsSync(TOKEN_FILE)) {
      return null;
    }
    const data = readFileSync(TOKEN_FILE, "utf-8");
    return JSON.parse(data) as PersistedTokens;
  } catch {
    return null;
  }
}

export function persistTokens(
  refreshToken: string,
  accessToken: string,
  expiresAt: number,
  scope: string
): void {
  try {
    ensureDir();
    const data: PersistedTokens = {
      refreshToken,
      accessToken,
      expiresAt,
      scope,
      updatedAt: Date.now(),
    };
    writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2), {
      mode: 0o600,
    });
  } catch (error) {
    console.error(
      `[FortnoxAuth] Warning: Could not persist refresh token to ${TOKEN_FILE}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
