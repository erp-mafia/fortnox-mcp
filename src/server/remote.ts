import express, { Express, Request, Response, NextFunction } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";

import {
  FortnoxProxyOAuthProvider,
  getUserIdFromAuth,
  initializeTokenProvider,
} from "../auth/index.js";
import { runWithContext } from "../auth/context.js";
import { registerCustomerTools } from "../tools/customers.js";
import { registerInvoiceTools } from "../tools/invoices.js";
import { registerSupplierTools } from "../tools/suppliers.js";
import { registerAccountTools } from "../tools/accounts.js";
import { registerVoucherTools } from "../tools/vouchers.js";
import { registerCompanyTools } from "../tools/company.js";
import { ITokenStorage } from "../auth/storage/types.js";

export interface RemoteServerOptions {
  /** Server URL (e.g., https://fortnox-mcp.vercel.app) */
  serverUrl: string;
  /** JWT secret for signing tokens */
  jwtSecret: string;
  /** Token storage backend */
  tokenStorage: ITokenStorage;
  /** Port to listen on (for local development) */
  port?: number;
}

/**
 * Create and configure the remote MCP server with OAuth support
 */
export function createRemoteServer(options: RemoteServerOptions): Express {
  const { serverUrl, jwtSecret, tokenStorage } = options;

  // Create OAuth provider
  const oauthProvider = new FortnoxProxyOAuthProvider(
    jwtSecret,
    serverUrl,
    tokenStorage
  );

  // Initialize the global token provider for remote mode
  initializeTokenProvider(oauthProvider.getTokenProvider());

  // Create Express app
  const app = express();
  app.use(express.json());

  // Trust proxy headers (for Vercel, etc.)
  app.set("trust proxy", 1);

  // Health check endpoint (no auth required)
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      server: "fortnox-mcp-server",
      mode: "remote",
    });
  });

  // Install MCP OAuth router (handles /.well-known/*, /authorize, /token, /register, /revoke)
  app.use(
    mcpAuthRouter({
      provider: oauthProvider,
      issuerUrl: new URL(serverUrl),
      scopesSupported: ["fortnox:read", "fortnox:write"],
      resourceName: "Fortnox MCP Server",
    })
  );

  // Fortnox OAuth callback handler
  app.get("/oauth/fortnox/callback", async (req, res) => {
    try {
      const { code, state, error, error_description } = req.query;

      if (error) {
        console.error(`[OAuth] Fortnox error: ${error} - ${error_description}`);
        res.status(400).send(`OAuth error: ${error_description || error}`);
        return;
      }

      if (!code || !state) {
        res.status(400).send("Missing code or state parameter");
        return;
      }

      // Handle the Fortnox callback
      const result = await oauthProvider.handleFortnoxCallback(
        code as string,
        state as string
      );

      // Redirect back to Claude with our authorization code
      const redirectUrl = new URL(result.redirectUri);
      redirectUrl.searchParams.set("code", result.code);
      if (result.state) {
        redirectUrl.searchParams.set("state", result.state);
      }

      res.redirect(redirectUrl.toString());
    } catch (error) {
      console.error("[OAuth] Callback error:", error);
      res.status(500).send("OAuth callback failed");
    }
  });

  // Create MCP server
  const mcpServer = new McpServer({
    name: "fortnox-mcp-server",
    version: "1.0.0",
  });

  // Register all tools
  registerCustomerTools(mcpServer);
  registerInvoiceTools(mcpServer);
  registerSupplierTools(mcpServer);
  registerAccountTools(mcpServer);
  registerVoucherTools(mcpServer);
  registerCompanyTools(mcpServer);

  // Protected MCP endpoint
  app.post(
    "/mcp",
    // Require valid Bearer token
    requireBearerAuth({
      verifier: oauthProvider,
      resourceMetadataUrl: `${serverUrl}/.well-known/oauth-protected-resource/mcp`,
    }),
    async (req: Request, res: Response) => {
      try {
        // Get user ID from auth
        const userId = req.auth ? getUserIdFromAuth(req.auth) : undefined;

        if (!userId) {
          res.status(401).json({ error: "No user context" });
          return;
        }

        // Create transport for this request
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });

        res.on("close", () => transport.close());

        // Run MCP request within user context
        await runWithContext({ userId }, async () => {
          await mcpServer.connect(transport);
          await transport.handleRequest(req, res, req.body);
        });
      } catch (error) {
        console.error("[MCP] Request error:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    }
  );

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[Server] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

/**
 * Start the remote server (for local development)
 */
export async function runRemoteServer(options: RemoteServerOptions): Promise<void> {
  const app = createRemoteServer(options);
  const port = options.port || parseInt(process.env.PORT || "3000", 10);

  app.listen(port, () => {
    console.error(`[FortnoxMCP] Remote server running on http://localhost:${port}`);
    console.error(`[FortnoxMCP] OAuth endpoints:`);
    console.error(`  - Metadata: http://localhost:${port}/.well-known/oauth-authorization-server`);
    console.error(`  - Authorize: http://localhost:${port}/authorize`);
    console.error(`  - Token: http://localhost:${port}/token`);
    console.error(`[FortnoxMCP] MCP endpoint: http://localhost:${port}/mcp`);
    console.error(`[FortnoxMCP] Health check: http://localhost:${port}/health`);
  });
}
