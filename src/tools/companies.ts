/**
 * Multi-company support for local mode: adds a `company` argument to every tool, runs
 * each call against that company's profile, and stamps every result with the company
 * it came from, so figures from different companies cannot be mixed up unnoticed.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fortnoxRequest } from "../services/api.js";
import { buildToolResponse, buildErrorResponse } from "../services/formatters.js";
import { runWithContextAsync } from "../auth/context.js";
import { CompanyRegistry, CompanyEntry, CompanyStamp } from "../auth/companies.js";
import { CompanyIdentity } from "../auth/profiles.js";
import { ResponseFormat } from "../constants.js";

interface ToolResult {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
  [key: string]: unknown;
}

type ToolHandler = (...args: any[]) => ToolResult | Promise<ToolResult>;

interface ToolConfig {
  inputSchema?: unknown;
  annotations?: { readOnlyHint?: boolean };
  [key: string]: unknown;
}

function runForCompany<T>(entry: CompanyEntry, fn: () => Promise<T>): Promise<T> {
  return runWithContextAsync({ company: { profile: entry.profile, tokenProvider: entry.tokenProvider } }, fn);
}

async function fetchIdentity(entry: CompanyEntry): Promise<CompanyIdentity> {
  const response = await runForCompany(entry, () =>
    fortnoxRequest<{ CompanyInformation: { CompanyName: string; OrganizationNumber: string; DatabaseNumber?: number | string } }>(
      "/3/companyinformation"
    )
  );
  const info = response.CompanyInformation;
  return { name: info.CompanyName, orgNumber: info.OrganizationNumber, databaseNumber: info.DatabaseNumber ?? null };
}

function companyField(registry: CompanyRegistry) {
  const field = z.enum(registry.names as [string, ...string[]]).describe(
    `Fortnox company to use: ${registry.describeChoices()}. ` +
    `Use the company the project's instructions name; never guess or carry one over from another task. ` +
    `Every result states which company it came from.`
  );
  return registry.names.length === 1 ? field.optional() : field;
}

function withCompanyParam(schema: unknown, field: z.ZodTypeAny): unknown {
  if (schema === undefined) return { company: field };
  if (schema instanceof z.ZodObject) return schema.extend({ company: field });
  if (typeof schema === "object" && schema !== null && !(schema instanceof z.ZodType)) {
    return { ...(schema as Record<string, z.ZodTypeAny>), company: field };
  }
  throw new Error("Cannot add the company argument to a tool whose input schema is not an object");
}

/** Add the company to a result: a field in JSON output, a first line in markdown */
export function stampResult(result: ToolResult, stamp: CompanyStamp): ToolResult {
  const label = stamp.name ? `${stamp.name} (${stamp.org_number}), profile "${stamp.profile}"` : `profile "${stamp.profile}"`;
  const content = (result.content ?? []).map((item, index) => {
    if (index !== 0 || item.type !== "text" || typeof item.text !== "string") return item;
    if (result.isError) return { ...item, text: `[Company: ${label}] ${item.text}` };
    try {
      const parsed = JSON.parse(item.text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { ...item, text: JSON.stringify({ company: stamp, ...parsed }, null, 2) };
      }
    } catch {
      // markdown
    }
    const warning = stamp.warning ? `\n*${stamp.warning}*` : "";
    return { ...item, text: `**Company:** ${label}${warning}\n\n${item.text}` };
  });

  const structured = result.structuredContent;
  return {
    ...result,
    content,
    ...(structured && typeof structured === "object" && !Array.isArray(structured)
      ? { structuredContent: { company: stamp, ...(structured as object) } }
      : {})
  };
}

/**
 * A view of `server` whose registerTool adds the company argument and routes each call
 * to that company's profile. Pass it to the register*Tools functions.
 */
export function withCompanySelection(server: McpServer, registry: CompanyRegistry): McpServer {
  const field = companyField(registry);
  const wrapped = Object.create(server) as McpServer;

  wrapped.registerTool = ((name: string, config: ToolConfig, handler: ToolHandler) => {
    const hadInputSchema = config.inputSchema !== undefined;
    const writes = config.annotations?.readOnlyHint !== true;

    const companyHandler = async (args: Record<string, unknown>, extra: unknown): Promise<ToolResult> => {
      const { company, ...rest } = args ?? {};
      let entry: CompanyEntry;
      let stamp: CompanyStamp;
      try {
        entry = registry.resolve(company as string | undefined);
        if (writes && entry.readOnly) {
          return stampResult(
            buildErrorResponse(new Error(`${name} changes data in Fortnox, and profile "${entry.profile}" is read-only.`)),
            registry.stamp(entry)
          );
        }
        stamp = await registry.verify(entry, fetchIdentity);
      } catch (error) {
        return buildErrorResponse(error);
      }
      const result = await runForCompany(entry, async () => (hadInputSchema ? handler(rest, extra) : handler(extra)));
      return stampResult(result, stamp);
    };

    return (server.registerTool as Function).call(
      server,
      name,
      { ...config, inputSchema: withCompanyParam(config.inputSchema, field) },
      companyHandler
    );
  }) as McpServer["registerTool"];

  return wrapped;
}

/** Instructions sent to the client when the server is connected to several companies */
export function companyServerInstructions(registry: CompanyRegistry): string {
  return [
    `This Fortnox server is connected to ${registry.names.length} companies: ${registry.describeChoices()}.`,
    `Every tool takes a "company" argument. Use the company the project's instructions name; if they name none and it`,
    `is unclear which company the user means, ask instead of guessing. Never carry a company over from another task.`,
    `IDs such as invoice, voucher, customer and supplier numbers are per company: the same number can exist in two`,
    `companies, so always pair an ID with its company. Every result states which company it came from; when you`,
    `report figures from more than one company, label each figure with its company and never add them together`,
    `unless the user asks for a combined total.`
  ].join(" ");
}

/** fortnox_list_companies: the companies this server can reach (never tokens) */
export function registerCompanyListTool(server: McpServer, registry: CompanyRegistry): void {
  server.registerTool(
    "fortnox_list_companies",
    {
      title: "List Fortnox Companies",
      description: `List the Fortnox companies this server is connected to, with the profile name to pass as "company" to other tools.

Returns for each company: profile, company name, organisation number (as recorded when it was authorized), and whether it is read-only.`,
      inputSchema: z.object({
        response_format: z.nativeEnum(ResponseFormat)
          .default(ResponseFormat.MARKDOWN)
          .describe("Output format: 'markdown' or 'json'")
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params: { response_format: ResponseFormat }) => {
      const companies = registry.list().map((entry) => ({
        profile: entry.profile,
        company_name: entry.identity?.name ?? null,
        org_number: entry.identity?.orgNumber ?? null,
        read_only: entry.readOnly,
        authorized: entry.tokenProvider.isAuthenticated()
      }));
      const output = { count: companies.length, companies };
      const text = params.response_format === ResponseFormat.JSON
        ? JSON.stringify(output, null, 2)
        : [
          "# Fortnox companies",
          "",
          ...companies.map((c) =>
            `- **${c.profile}**: ${c.company_name ?? "(name not recorded yet)"}` +
            `${c.org_number ? ` (${c.org_number})` : ""}${c.read_only ? ", read-only" : ""}` +
            `${c.authorized ? "" : ", needs authorization"}`)
        ].join("\n");
      return buildToolResponse(text, output);
    }
  );
}
