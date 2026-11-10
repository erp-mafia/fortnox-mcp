import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { installFakeFortnox, startClient, callToolJson, json, type FakeRequest, type FakeFortnox } from "./helpers.js";
import { loadCompanyRegistry } from "../src/auth/companies.js";
import { writeProfile, profilePath, type ProfileFile } from "../src/auth/profiles.js";

/** Made-up companies; the fake Fortnox tells them apart by access token */
const ALPHA = { name: "Example Alpha AB", orgNumber: "000000-0001" };
const BETA = { name: "Example Beta AB", orgNumber: "000000-0002" };
const COMPANY_BY_TOKEN: Record<string, typeof ALPHA> = {
  "alpha-access": ALPHA,
  "beta-access-new": BETA,
  "gamma-access": ALPHA
};
const IN_AN_HOUR = () => Date.now() + 3600_000;

function fakeFortnox(): FakeFortnox {
  return installFakeFortnox([
    (req: FakeRequest) => {
      if (req.path !== "/oauth-v1/token") return undefined;
      const form = new URLSearchParams(String(req.body));
      assert.equal(form.get("refresh_token"), "beta-refresh-old");
      return json({ access_token: "beta-access-new", refresh_token: "beta-refresh-new", expires_in: 3600, scope: "companyinformation bookkeeping" });
    },
    (req: FakeRequest) => {
      const company = COMPANY_BY_TOKEN[(req.authorization ?? "").replace("Bearer ", "")];
      if (!company) return { status: 401, data: { message: "unknown token" } };
      if (req.path === "/3/companyinformation") {
        return json({ CompanyInformation: { CompanyName: company.name, OrganizationNumber: company.orgNumber, DatabaseNumber: 1 } });
      }
      if (req.path === "/3/financialyears") {
        const id = company === ALPHA ? 1 : 2;
        return json({ FinancialYears: [{ Id: id, FromDate: "2030-01-01", ToDate: "2030-12-31", AccountChartType: "Example" }] });
      }
      return undefined;
    }
  ]);
}

function makeHome(profiles: Record<string, ProfileFile>): string {
  const home = mkdtempSync(join(tmpdir(), "fortnox-mcp-test-"));
  for (const [name, profile] of Object.entries(profiles)) writeProfile(name, profile, home);
  return home;
}

const alphaProfile = (): ProfileFile => ({ refreshToken: "alpha-refresh", accessToken: "alpha-access", expiresAt: IN_AN_HOUR(), company: ALPHA });
// Expired access token: the first call has to refresh it
const betaProfile = (): ProfileFile => ({ refreshToken: "beta-refresh-old", accessToken: "beta-access-old", expiresAt: 0, company: BETA });

async function clientFor(home: string, allow?: string[]): Promise<Client> {
  const companies = loadCompanyRegistry({ home, allow });
  assert.ok(companies);
  return startClient({ companies });
}

async function callTool(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  return { isError: result.isError === true, text: (result.content as Array<{ text: string }>)[0]?.text ?? "" };
}

before(() => {
  process.env.FORTNOX_CLIENT_ID = "test-client-id";
  process.env.FORTNOX_CLIENT_SECRET = "test-client-secret";
  delete process.env.FORTNOX_PROFILES;
});

describe("several company profiles", () => {
  let home: string;
  let client: Client;
  before(async () => {
    home = makeHome({ alpha: alphaProfile(), beta: betaProfile() });
    client = await clientFor(home);
  });

  test("every tool requires a company, chosen from the profiles", async () => {
    const { tools } = await client.listTools();
    const lacking = tools
      .filter((t) => t.name !== "fortnox_list_companies")
      .filter((t) => !(t.inputSchema.required ?? []).includes("company"))
      .map((t) => t.name);
    assert.deepEqual(lacking, []);
    const company = (tools.find((t) => t.name === "fortnox_list_financial_years")!.inputSchema.properties as Record<string, { enum?: string[]; description?: string }>).company;
    assert.deepEqual(company.enum, ["alpha", "beta"]);
    assert.match(company.description!, /Example Alpha AB/);
  });

  test("each call uses its own company's token, and the result says which company", async () => {
    const fake = fakeFortnox();
    const alpha = await callToolJson(client, "fortnox_list_financial_years", { company: "alpha" });
    assert.deepEqual(alpha.company, { profile: "alpha", name: ALPHA.name, org_number: ALPHA.orgNumber });
    assert.equal(alpha.financial_years[0].id, 1);

    const beta = await callToolJson(client, "fortnox_list_financial_years", { company: "beta" });
    assert.equal(beta.company.name, BETA.name);
    assert.equal(beta.financial_years[0].id, 2);

    const api = fake.requests.filter((r) => r.path.startsWith("/3/"));
    assert.ok(api.every((r) => (r.path === "/3/financialyears" || r.path === "/3/companyinformation")));
    assert.deepEqual(new Set(api.map((r) => r.authorization)), new Set(["Bearer alpha-access", "Bearer beta-access-new"]));
  });

  test("a rotated refresh token is saved to that company's profile only", () => {
    const beta = JSON.parse(readFileSync(profilePath("beta", home), "utf8"));
    const alpha = JSON.parse(readFileSync(profilePath("alpha", home), "utf8"));
    assert.equal(beta.refreshToken, "beta-refresh-new");
    assert.equal(beta.company.orgNumber, BETA.orgNumber, "keeps the recorded company");
    assert.equal(alpha.refreshToken, "alpha-refresh");
  });

  test("markdown output starts with the company", async () => {
    fakeFortnox();
    const { isError, text } = await callTool(client, "fortnox_list_financial_years", { company: "alpha" });
    assert.equal(isError, false);
    assert.equal(text.split("\n")[0], `**Company:** ${ALPHA.name} (${ALPHA.orgNumber}), profile "alpha"`);
  });

  test("a call without a company, or with an unknown one, is refused before reaching Fortnox", async () => {
    const fake = fakeFortnox();
    const missing = await callTool(client, "fortnox_list_financial_years", {});
    assert.equal(missing.isError, true);
    const unknown = await callTool(client, "fortnox_list_financial_years", { company: "delta" });
    assert.equal(unknown.isError, true);
    assert.equal(fake.requests.length, 0);
  });

  test("fortnox_list_companies lists the companies without tokens", async () => {
    const out = await callToolJson(client, "fortnox_list_companies", {});
    assert.deepEqual(out.companies.map((c: any) => [c.profile, c.company_name, c.org_number]), [
      ["alpha", ALPHA.name, ALPHA.orgNumber],
      ["beta", BETA.name, BETA.orgNumber]
    ]);
    const { text } = await callTool(client, "fortnox_list_companies", {});
    assert.doesNotMatch(text, /access|refresh/);
  });
});

describe("company guards", () => {
  test("a token that belongs to another company is refused", async () => {
    // gamma is registered for Beta, but its token belongs to Alpha
    const home = makeHome({ alpha: alphaProfile(), gamma: { refreshToken: "gamma-refresh", accessToken: "gamma-access", expiresAt: IN_AN_HOUR(), company: BETA } });
    const client = await clientFor(home);
    const fake = fakeFortnox();
    const { isError, text } = await callTool(client, "fortnox_list_financial_years", { company: "gamma" });
    assert.equal(isError, true);
    assert.match(text, /Refusing to use profile "gamma".*Example Alpha AB/);
    assert.deepEqual(fake.requests.map((r) => r.path), ["/3/companyinformation"]);

    const again = await callTool(client, "fortnox_list_financial_years", { company: "gamma" });
    assert.equal(again.isError, true, "stays refused");
  });

  test("a read-only profile refuses tools that write", async () => {
    const home = makeHome({ alpha: { ...alphaProfile(), readOnly: true }, beta: betaProfile() });
    const client = await clientFor(home);
    const fake = fakeFortnox();
    const { isError, text } = await callTool(client, "fortnox_delete_account", { company: "alpha", account_number: 9999 });
    assert.equal(isError, true);
    assert.match(text, /read-only/);
    assert.equal(fake.requests.length, 0);
  });

  test("with a single profile the company is optional", async () => {
    const home = makeHome({ alpha: alphaProfile() });
    const client = await clientFor(home);
    fakeFortnox();
    const out = await callToolJson(client, "fortnox_list_financial_years", {});
    assert.equal(out.company.profile, "alpha");
  });

  test("FORTNOX_PROFILES limits the companies a server can reach", async () => {
    const home = makeHome({ alpha: alphaProfile(), beta: betaProfile() });
    const client = await clientFor(home, ["beta"]);
    const { tools } = await client.listTools();
    const company = (tools.find((t) => t.name === "fortnox_list_financial_years")!.inputSchema.properties as Record<string, { enum?: string[] }>).company;
    assert.deepEqual(company.enum, ["beta"]);
    assert.throws(() => loadCompanyRegistry({ home, allow: ["delta"] }), /do not exist: delta/);
  });

  test("with no profiles the server keeps its single-company mode", () => {
    assert.equal(loadCompanyRegistry({ home: makeHome({}) }), null);
  });
});
