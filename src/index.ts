#!/usr/bin/env node
/**
 * Fortnox MCP Server
 *
 * An MCP server for integrating with the Fortnox Swedish accounting system.
 * Provides tools for managing invoices, customers, suppliers, accounts, and vouchers.
 *
 * Authentication:
 *   Required environment variables:
 *   - FORTNOX_CLIENT_ID: Your Fortnox app client ID
 *   - FORTNOX_CLIENT_SECRET: Your Fortnox app client secret
 *   - FORTNOX_REFRESH_TOKEN: OAuth2 refresh token
 *
 *   Optional:
 *   - FORTNOX_ACCESS_TOKEN: Current access token (will be refreshed automatically)
 *   - TRANSPORT: 'stdio' (default) or 'http'
 *   - PORT: HTTP server port (default: 3000)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";

import { getFortnoxAuth } from "./services/auth.js";
import { registerCustomerTools } from "./tools/customers.js";
import { registerInvoiceTools } from "./tools/invoices.js";
import { registerSupplierTools } from "./tools/suppliers.js";
import { registerAccountTools } from "./tools/accounts.js";
import { registerVoucherTools } from "./tools/vouchers.js";
import { registerCompanyTools } from "./tools/company.js";

// Create the MCP server
const server = new McpServer({
  name: "fortnox-mcp-server",
  version: "1.0.0"
});

// Register all tools
registerCustomerTools(server);
registerInvoiceTools(server);
registerSupplierTools(server);
registerAccountTools(server);
registerVoucherTools(server);
registerCompanyTools(server);

/**
 * Run the server with stdio transport (for local/CLI usage)
 */
async function runStdio(): Promise<void> {
  // Validate authentication on startup
  try {
    const auth = getFortnoxAuth();
    if (!auth.isAuthenticated()) {
      console.error(
        "WARNING: No authentication configured. Set FORTNOX_REFRESH_TOKEN environment variable."
      );
    } else {
      console.error("[FortnoxMCP] Authentication configured, ready to connect");
    }
  } catch (error) {
    console.error(
      `ERROR: ${error instanceof Error ? error.message : String(error)}`
    );
    console.error(
      "\nRequired environment variables:\n" +
      "  FORTNOX_CLIENT_ID     - Your Fortnox app client ID\n" +
      "  FORTNOX_CLIENT_SECRET - Your Fortnox app client secret\n" +
      "  FORTNOX_REFRESH_TOKEN - OAuth2 refresh token from authorization"
    );
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[FortnoxMCP] Server running via stdio");
}

/**
 * Run the server with HTTP transport (for remote/web usage)
 */
async function runHTTP(): Promise<void> {
  // Validate authentication on startup
  try {
    const auth = getFortnoxAuth();
    if (!auth.isAuthenticated()) {
      console.error(
        "WARNING: No authentication configured. Set FORTNOX_REFRESH_TOKEN environment variable."
      );
    }
  } catch (error) {
    console.error(
      `ERROR: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }

  const app = express();
  app.use(express.json());

  // Health check endpoint
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "fortnox-mcp-server" });
  });

  // MCP endpoint
  app.post("/mcp", async (req, res) => {
    // Create new transport for each request (stateless)
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });

    res.on("close", () => transport.close());

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  const port = parseInt(process.env.PORT || "3000", 10);
  app.listen(port, () => {
    console.error(`[FortnoxMCP] Server running on http://localhost:${port}/mcp`);
    console.error(`[FortnoxMCP] Health check: http://localhost:${port}/health`);
  });
}

// Determine transport and run
const transport = process.env.TRANSPORT || "stdio";

if (transport === "http") {
  runHTTP().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
} else {
  runStdio().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
}
