#!/usr/bin/env npx tsx
/**
 * Fortnox OAuth2 Token Helper
 *
 * This script helps you obtain a refresh token through the OAuth2 flow.
 *
 * Usage:
 *   1. Run: npx tsx scripts/get-token.ts
 *   2. Open the URL in your browser
 *   3. Authorize the app in Fortnox
 *   4. Copy the authorization code from the redirect URL
 *   5. Paste it when prompted
 *   6. Save the refresh token to your environment
 *
 * Several companies:
 *   npx tsx scripts/get-token.ts --profile <name> [--read-only]
 *   Log in to Fortnox as the company you want, authorize, and the token is saved to
 *   ~/.fortnox-mcp/profiles/<name>.json together with the company's name and
 *   organisation number. Nothing secret is printed. Run once per company.
 */

import http from "http";
import { URL } from "url";
import readline from "readline";
import { assertValidProfileName, profilePath, readProfile, writeProfile } from "../src/auth/profiles.js";

function parseArgs(argv: string[]): { profile: string | null; readOnly: boolean } {
  let profile: string | null = null;
  let readOnly = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--profile") {
      profile = argv[++i] ?? "";
    } else if (argv[i].startsWith("--profile=")) {
      profile = argv[i].slice("--profile=".length);
    } else if (argv[i] === "--read-only") {
      readOnly = true;
    } else {
      console.error(`Unknown argument: ${argv[i]}`);
      process.exit(1);
    }
  }
  if (profile !== null) {
    try {
      assertValidProfileName(profile);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  }
  return { profile, readOnly };
}

const ARGS = parseArgs(process.argv.slice(2));

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Error: ${name} must be set in your environment.`);
    console.error("Register an app at https://developer.fortnox.se to get your credentials.");
    process.exit(1);
  }
  return value;
}

const CLIENT_ID = requireEnv("FORTNOX_CLIENT_ID");
const CLIENT_SECRET = requireEnv("FORTNOX_CLIENT_SECRET");
const REDIRECT_PORT = 8888;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;

const SCOPES = [
  "customer",
  "invoice",
  "supplier",
  "supplierinvoice",
  "bookkeeping",
  "companyinformation",
  "connectfile",
  "archive"
];

async function getAuthorizationCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "", `http://localhost:${REDIRECT_PORT}`);

      if (url.pathname === "/callback") {
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`<h1>Error: ${error}</h1><p>${url.searchParams.get("error_description")}</p>`);
          reject(new Error(error));
          server.close();
          return;
        }

        if (code) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body style="font-family: sans-serif; padding: 40px; text-align: center;">
                <h1>✓ Authorization Successful!</h1>
                <p>You can close this window and return to the terminal.</p>
                <p style="color: #666;">Authorization code received.</p>
              </body>
            </html>
          `);
          resolve(code);
          setTimeout(() => server.close(), 1000);
        }
      }
    });

    server.listen(REDIRECT_PORT, () => {
      const authUrl = new URL("https://apps.fortnox.se/oauth-v1/auth");
      authUrl.searchParams.set("client_id", CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
      authUrl.searchParams.set("scope", SCOPES.join(" "));
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("state", "fortnox-mcp");

      console.log("\n╔════════════════════════════════════════════════════════════╗");
      console.log("║           FORTNOX OAUTH2 AUTHORIZATION                      ║");
      console.log("╚════════════════════════════════════════════════════════════╝\n");
      console.log("Step 1: Open this URL in your browser:\n");
      console.log(`  ${authUrl.toString()}\n`);
      console.log("Step 2: Log in to Fortnox and authorize the application\n");
      console.log("Step 3: You will be redirected back here automatically\n");
      console.log("Waiting for authorization...\n");
    });

    server.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
        console.error(`Port ${REDIRECT_PORT} is already in use. Please close other applications using it.`);
      }
      reject(err);
    });
  });
}

async function exchangeCodeForTokens(code: string): Promise<{ access_token: string; refresh_token: string; expires_in: number; scope: string }> {
  const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

  const response = await fetch("https://apps.fortnox.se/oauth-v1/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: code,
      redirect_uri: REDIRECT_URI
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  return response.json();
}

async function fetchCompany(accessToken: string): Promise<{ name: string; orgNumber: string; databaseNumber: number | string | null }> {
  const response = await fetch("https://api.fortnox.se/3/companyinformation", {
    headers: { "Authorization": `Bearer ${accessToken}`, "Accept": "application/json" }
  });
  if (!response.ok) {
    throw new Error(`Could not read company information (HTTP ${response.status}). The companyinformation scope is required for profiles.`);
  }
  const info = (await response.json()).CompanyInformation;
  return { name: info.CompanyName, orgNumber: info.OrganizationNumber, databaseNumber: info.DatabaseNumber ?? null };
}

async function saveProfile(name: string, tokens: { access_token: string; refresh_token: string; expires_in: number; scope: string }) {
  const company = await fetchCompany(tokens.access_token);
  const existing = readProfile(name);
  if (existing?.company?.orgNumber && existing.company.orgNumber.replace(/\D/g, "") !== company.orgNumber.replace(/\D/g, "")) {
    throw new Error(
      `Profile "${name}" belongs to ${existing.company.name} (${existing.company.orgNumber}), but you authorized ` +
      `${company.name} (${company.orgNumber}). Log in to the right company, or use another profile name.`
    );
  }
  writeProfile(name, {
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    scope: tokens.scope,
    company,
    readOnly: ARGS.readOnly || existing?.readOnly === true
  });
  console.log(`✓ Saved profile "${name}" for ${company.name} (${company.orgNumber})${ARGS.readOnly ? ", read-only" : ""}`);
  console.log(`  ${profilePath(name)}\n`);
  console.log("Restart your MCP client. Tools now take company: \"" + name + "\".");
  console.log("The Claude Desktop config needs only FORTNOX_CLIENT_ID and FORTNOX_CLIENT_SECRET;");
  console.log("FORTNOX_REFRESH_TOKEN is ignored once profiles exist.\n");
}

async function main() {
  try {
    console.log("Starting OAuth2 authorization flow...\n");
    if (ARGS.profile) {
      console.log(`Profile "${ARGS.profile}": log in to Fortnox as the company this profile is for.\n`);
    }

    const code = await getAuthorizationCode();
    console.log("✓ Authorization code received\n");

    console.log("Exchanging code for tokens...\n");
    const tokens = await exchangeCodeForTokens(code);

    if (ARGS.profile) {
      await saveProfile(ARGS.profile, tokens);
      return;
    }

    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║                    SUCCESS!                                 ║");
    console.log("╚════════════════════════════════════════════════════════════╝\n");

    console.log("Add these to your environment:\n");
    console.log("─────────────────────────────────────────────────────────────");
    console.log(`export FORTNOX_CLIENT_ID="${CLIENT_ID}"`);
    console.log(`export FORTNOX_CLIENT_SECRET="${CLIENT_SECRET}"`);
    console.log(`export FORTNOX_REFRESH_TOKEN="${tokens.refresh_token}"`);
    console.log("─────────────────────────────────────────────────────────────\n");

    console.log("Or add to Claude Desktop config:\n");
    console.log(JSON.stringify({
      "env": {
        "FORTNOX_CLIENT_ID": CLIENT_ID,
        "FORTNOX_CLIENT_SECRET": CLIENT_SECRET,
        "FORTNOX_REFRESH_TOKEN": tokens.refresh_token
      }
    }, null, 2));

    console.log("\n✓ Done! You can now use the Fortnox MCP server.\n");

  } catch (error) {
    console.error("\n✗ Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
