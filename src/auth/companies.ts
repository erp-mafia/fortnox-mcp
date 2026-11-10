/**
 * Registry of the Fortnox companies this server can reach (one per profile).
 *
 * The server cannot tell which chat or project is calling, so it never picks a company
 * on its own: with several profiles every tool call must name one. Before a profile is
 * used, the company behind its token is checked against the identity recorded for it,
 * so a token pasted into the wrong profile is refused instead of silently used.
 */
import { listProfileNames, readProfile, writeProfile, sameOrgNumber, fortnoxHome, CompanyIdentity } from "./profiles.js";
import { ProfileTokenProvider } from "./profileProvider.js";
import { ITokenProvider } from "./types.js";

export interface CompanyEntry {
  profile: string;
  tokenProvider: ITokenProvider;
  readOnly: boolean;
  /** Identity recorded in the profile, updated from Fortnox once verified */
  identity: CompanyIdentity | null;
}

/** Fetches the identity of the company a token belongs to (the companyinformation endpoint) */
export type FetchIdentity = (entry: CompanyEntry) => Promise<CompanyIdentity>;

export interface CompanyStamp {
  profile: string;
  name: string | null;
  org_number: string | null;
  /** Set when the company could not be verified, e.g. the token lacks the companyinformation scope */
  warning?: string;
}

type Verification = { ok: true; warning?: string } | { ok: false; error: string };

export class CompanyRegistry {
  private verifications = new Map<string, Promise<Verification>>();

  constructor(
    private entries: Map<string, CompanyEntry>,
    private home?: string
  ) {}

  get names(): string[] {
    return [...this.entries.keys()];
  }

  list(): CompanyEntry[] {
    return [...this.entries.values()];
  }

  /** The entry for `company`, or the only entry when there is exactly one and none is given */
  resolve(company: string | undefined): CompanyEntry {
    if (company === undefined || company === "") {
      if (this.entries.size === 1) return this.list()[0];
      throw new Error(
        `This server is connected to several Fortnox companies; pass "company" with one of: ${this.describeChoices()}. ` +
        `Use the company the project's instructions name. Do not guess.`
      );
    }
    const entry = this.entries.get(company);
    if (!entry) {
      throw new Error(`Unknown company "${company}". Valid companies: ${this.describeChoices()}.`);
    }
    return entry;
  }

  describeChoices(): string {
    return this.list()
      .map((e) => (e.identity ? `${e.profile} (${e.identity.name}, ${e.identity.orgNumber})` : e.profile))
      .join(", ");
  }

  /**
   * Check once per profile that its token belongs to the recorded company. Fails closed
   * on a mismatch. A missing companyinformation scope only produces a warning, since the
   * check is then impossible rather than failed. Other errors are not cached, so a
   * network hiccup is retried on the next call.
   */
  async verify(entry: CompanyEntry, fetchIdentity: FetchIdentity): Promise<CompanyStamp> {
    let pending = this.verifications.get(entry.profile);
    if (!pending) {
      pending = this.runVerification(entry, fetchIdentity);
      this.verifications.set(entry.profile, pending);
      pending.catch(() => this.verifications.delete(entry.profile));
    }
    const result = await pending;
    if (!result.ok) throw new Error(result.error);
    return this.stamp(entry, result.warning);
  }

  stamp(entry: CompanyEntry, warning?: string): CompanyStamp {
    return {
      profile: entry.profile,
      name: entry.identity?.name ?? null,
      org_number: entry.identity?.orgNumber ?? null,
      ...(warning ? { warning } : {})
    };
  }

  private async runVerification(entry: CompanyEntry, fetchIdentity: FetchIdentity): Promise<Verification> {
    let actual: CompanyIdentity;
    try {
      actual = await fetchIdentity(entry);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/Missing OAuth scope/i.test(message)) {
        return {
          ok: true,
          warning: `Company not verified: the token for "${entry.profile}" lacks the companyinformation scope.`
        };
      }
      throw new Error(`Could not verify which company profile "${entry.profile}" belongs to: ${message}`);
    }

    const expected = entry.identity;
    if (expected?.orgNumber && !sameOrgNumber(expected.orgNumber, actual.orgNumber)) {
      return {
        ok: false,
        error:
          `Refusing to use profile "${entry.profile}": its token belongs to ${actual.name} (${actual.orgNumber}), ` +
          `but the profile is registered for ${expected.name} (${expected.orgNumber}). ` +
          `Re-authorize with: npm run get-token -- --profile ${entry.profile}`
      };
    }

    if (!expected?.orgNumber || expected.name !== actual.name) {
      // Record the identity for profiles created without one, and keep the name current
      entry.identity = actual;
      const file = readProfile(entry.profile, this.home);
      if (file) {
        try {
          writeProfile(entry.profile, { ...file, company: actual }, this.home);
        } catch {
          // The stamp still carries the identity; saving it is only a convenience
        }
      }
    }
    return { ok: true };
  }
}

export interface LoadCompaniesOptions {
  home?: string;
  /** Only these profiles (FORTNOX_PROFILES, comma separated) */
  allow?: string[];
}

/**
 * Load every profile from disk. Returns null when there are none, so the server keeps
 * its single-company behaviour (FORTNOX_REFRESH_TOKEN) for existing setups.
 */
export function loadCompanyRegistry(options: LoadCompaniesOptions = {}): CompanyRegistry | null {
  const home = options.home ?? fortnoxHome();
  const allow = options.allow ?? parseAllowList(process.env.FORTNOX_PROFILES);
  let names = listProfileNames(home);
  if (allow) {
    const missing = allow.filter((name) => !names.includes(name));
    if (missing.length > 0) {
      throw new Error(`FORTNOX_PROFILES names profiles that do not exist: ${missing.join(", ")}`);
    }
    names = names.filter((name) => allow.includes(name));
  }

  const entries = new Map<string, CompanyEntry>();
  for (const name of names) {
    const file = readProfile(name, home);
    if (!file) {
      console.error(`[FortnoxMCP] Skipping profile "${name}": the file has no refresh token`);
      continue;
    }
    entries.set(name, {
      profile: name,
      tokenProvider: new ProfileTokenProvider(name, file, home),
      readOnly: file.readOnly === true,
      identity: file.company?.orgNumber ? file.company : null
    });
  }
  return entries.size > 0 ? new CompanyRegistry(entries, home) : null;
}

function parseAllowList(value: string | undefined): string[] | undefined {
  const names = (value ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return names.length > 0 ? names : undefined;
}
