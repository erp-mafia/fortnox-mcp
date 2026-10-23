/**
 * Test harness: runs the real MCP server in memory with every tool registered, and
 * replaces axios's HTTP adapter with a router that serves fixtures. Nothing reaches
 * Fortnox, and no token files are read or written.
 */
import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { initializeTokenProvider } from "../src/auth/index.js";
import { apiRateLimiter, rateLimitRetryConfig } from "../src/services/api.js";
import { registerAllTools } from "../src/tools/index.js";

export interface FakeRequest {
  method: string;
  path: string;
  params: Record<string, string>;
}

export interface FakeResponse {
  status?: number;
  data: unknown;
  headers?: Record<string, string>;
}

export type Route = (req: FakeRequest) => FakeResponse | undefined;

export interface FakeFortnox {
  requests: FakeRequest[];
}

/** Route requests to fixture handlers; a request no handler answers fails the test with a 404 */
export function installFakeFortnox(routes: Route[]): FakeFortnox {
  const requests: FakeRequest[] = [];

  axios.defaults.adapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    const url = new URL(config.url ?? "");
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(config.params ?? {})) {
      if (value !== undefined) params[key] = String(value);
    }
    const req: FakeRequest = { method: (config.method ?? "get").toUpperCase(), path: url.pathname, params };
    requests.push(req);

    let res: FakeResponse | undefined;
    for (const route of routes) {
      res = route(req);
      if (res) break;
    }
    res ??= { status: 404, data: { ErrorInformation: { message: `No fixture for ${req.method} ${req.path}` } } };

    const response: AxiosResponse = {
      data: res.data,
      status: res.status ?? 200,
      statusText: String(res.status ?? 200),
      headers: res.headers ?? {},
      config
    };
    if (response.status >= 400) {
      throw new AxiosError(`Request failed with status ${response.status}`, "ERR_BAD_RESPONSE", config, null, response);
    }
    return response;
  };

  return { requests };
}

export function json(data: unknown): FakeResponse {
  return { data };
}

/** Start an in-memory MCP client connected to a server with all tools registered */
export async function startClient(): Promise<Client> {
  initializeTokenProvider({
    getAccessToken: async () => "test-access-token",
    isAuthenticated: () => true,
    getTokenInfo: () => null
  });
  // Keep tests fast: no client-side throttling, near-instant 429 backoff
  apiRateLimiter.configure(10_000, 1000, 0);
  rateLimitRetryConfig.baseDelayMs = 1;

  const server = new McpServer({ name: "fortnox-mcp-test", version: "0.0.0" });
  registerAllTools(server);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(clientTransport);
  return client;
}

export async function callToolJson<T = any>(client: Client, name: string, args: Record<string, unknown>): Promise<T> {
  const result = await client.callTool({ name, arguments: { ...args, response_format: "json" } });
  const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
  if (result.isError) {
    throw new Error(`Tool ${name} failed: ${text}`);
  }
  return JSON.parse(text) as T;
}
