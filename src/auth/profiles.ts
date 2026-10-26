/**
 * Company profiles: one Fortnox company per file in ~/.fortnox-mcp/profiles/<name>.json.
 *
 * Each file holds that company's rotating refresh token, the identity of the company the
 * token was issued for (recorded by `npm run get-token -- --profile <name>`) and whether
 * the profile is read-only. Client ID and secret are shared by all profiles and come from
 * the environment.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, renameSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface CompanyIdentity {
  name: string;
  orgNumber: string;
  databaseNumber?: number | string | null;
}

export interface ProfileFile {
  refreshToken: string;
  accessToken?: string;
  expiresAt?: number;
  scope?: string;
  /** The company the token belongs to; checked against Fortnox before first use */
  company?: CompanyIdentity;
  /** Refuse tools that write to Fortnox for this company */
  readOnly?: boolean;
  updatedAt?: number;
}

const PROFILE_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;

export function isValidProfileName(name: string): boolean {
  return PROFILE_NAME.test(name);
}

export function assertValidProfileName(name: string): void {
  if (!isValidProfileName(name)) {
    throw new Error(
      `Invalid profile name "${name}". Use lowercase letters, digits and dashes (max 40 characters).`
    );
  }
}

/** ~/.fortnox-mcp, or FORTNOX_MCP_HOME when set */
export function fortnoxHome(): string {
  return process.env.FORTNOX_MCP_HOME || join(homedir(), ".fortnox-mcp");
}

export function profilesDir(home = fortnoxHome()): string {
  return join(home, "profiles");
}

export function profilePath(name: string, home = fortnoxHome()): string {
  assertValidProfileName(name);
  return join(profilesDir(home), `${name}.json`);
}

/** Names of all profiles on disk, sorted */
export function listProfileNames(home = fortnoxHome()): string[] {
  const dir = profilesDir(home);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.slice(0, -".json".length))
    .filter(isValidProfileName)
    .sort();
}

export function readProfile(name: string, home = fortnoxHome()): ProfileFile | null {
  try {
    const data = JSON.parse(readFileSync(profilePath(name, home), "utf-8")) as ProfileFile;
    return typeof data.refreshToken === "string" ? data : null;
  } catch {
    return null;
  }
}

/** Write a profile atomically (temp file + rename) with owner-only permissions */
export function writeProfile(name: string, profile: ProfileFile, home = fortnoxHome()): void {
  const dir = profilesDir(home);
  mkdirSync(dir, { mode: 0o700, recursive: true });
  const path = profilePath(name, home);
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ ...profile, updatedAt: Date.now() }, null, 2), { mode: 0o600 });
  renameSync(tmp, path);
}

/** Compare organisation numbers ignoring dashes and spaces */
export function sameOrgNumber(a: string, b: string): boolean {
  const digits = (s: string) => s.replace(/\D/g, "");
  return digits(a) !== "" && digits(a) === digits(b);
}
