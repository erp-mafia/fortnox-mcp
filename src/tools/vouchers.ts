import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fortnoxRequest } from "../services/api.js";
import { ResponseFormat } from "../constants.js";
import {
  buildToolResponse,
  buildErrorResponse,
  formatMoney,
  formatDisplayDate,
  formatListMarkdown,
  buildPaginationMeta
} from "../services/formatters.js";
import {
  ListVouchersSchema,
  GetVoucherSchema,
  CreateVoucherSchema,
  ListVoucherSeriesSchema,
  type ListVouchersInput,
  type GetVoucherInput,
  type CreateVoucherInput,
  type ListVoucherSeriesInput
} from "../schemas/vouchers.js";

// API response types
interface FortnoxVoucherRow {
  Account: number;
  Debit?: number;
  Credit?: number;
  Description?: string;
  CostCenter?: string;
  Project?: string;
}

interface FortnoxVoucher {
  VoucherSeries: string;
  VoucherNumber: number;
  Year: number;
  Description: string;
  TransactionDate: string;
  VoucherRows?: FortnoxVoucherRow[];
  "@url"?: string;
}

interface FortnoxVoucherListItem {
  VoucherSeries: string;
  VoucherNumber: number;
  Description: string;
  TransactionDate: string;
  "@url"?: string;
}

interface VoucherListResponse {
  Vouchers: FortnoxVoucherListItem[];
  MetaInformation?: {
    "@TotalResources": number;
    "@TotalPages": number;
    "@CurrentPage": number;
  };
}

interface VoucherResponse {
  Voucher: FortnoxVoucher;
}

interface FortnoxVoucherSeries {
  Code: string;
  Description: string;
  Manual?: boolean;
  "@url"?: string;
}

interface VoucherSeriesListResponse {
  VoucherSeriesCollection: FortnoxVoucherSeries[];
}

/**
 * Register all voucher-related tools
 */
export function registerVoucherTools(server: McpServer): void {
  // List vouchers
  server.registerTool(
    "fortnox_list_vouchers",
    {
      title: "List Fortnox Vouchers",
      description: `List vouchers (accounting entries) from Fortnox.

Retrieves a paginated list of vouchers with optional filtering.

IMPORTANT: You should specify a financial_year to get results. Use the current calendar year (e.g., 2025) if unsure.

Args:
  - limit (number): Max results per page, 1-100 (default: 20)
  - page (number): Page number for pagination (default: 1)
  - voucher_series (string): Filter by voucher series (e.g., 'A', 'B')
  - financial_year (number): Financial year (e.g., 2025) - RECOMMENDED to specify
  - from_date (string): Filter vouchers from this date (YYYY-MM-DD)
  - to_date (string): Filter vouchers to this date (YYYY-MM-DD)
  - response_format ('markdown' | 'json'): Output format

Returns:
  List of vouchers with series, number, description, and date.

Examples:
  - List vouchers for 2025: financial_year=2025
  - List manual vouchers: voucher_series="A", financial_year=2025
  - Vouchers this month: from_date="2025-01-01", to_date="2025-01-31", financial_year=2025`,
      inputSchema: ListVouchersSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: ListVouchersInput) => {
      try {
        let endpoint = "/3/vouchers";
        const queryParams: Record<string, string | number | boolean | undefined> = {
          limit: params.limit,
          page: params.page
        };

        // Use sublist endpoint if filtering by series
        if (params.voucher_series) {
          endpoint = `/3/vouchers/sublist/${encodeURIComponent(params.voucher_series)}`;
        }

        queryParams.financialyear = params.financial_year;
        if (params.from_date) queryParams.fromdate = params.from_date;
        if (params.to_date) queryParams.todate = params.to_date;

        const response = await fortnoxRequest<VoucherListResponse>(endpoint, "GET", undefined, queryParams);
        const vouchers = response.Vouchers || [];
        const total = response.MetaInformation?.["@TotalResources"] || vouchers.length;

        const output = {
          ...buildPaginationMeta(total, params.page, params.limit, vouchers.length),
          vouchers: vouchers.map((v) => ({
            voucher_series: v.VoucherSeries,
            voucher_number: v.VoucherNumber,
            description: v.Description,
            transaction_date: v.TransactionDate
          }))
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          textContent = formatListMarkdown(
            "Vouchers",
            vouchers,
            total,
            params.page,
            params.limit,
            (v) => `- **${v.VoucherSeries}${v.VoucherNumber}** (${formatDisplayDate(v.TransactionDate)}): ${v.Description}`
          );
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );

  // Get single voucher
  server.registerTool(
    "fortnox_get_voucher",
    {
      title: "Get Fortnox Voucher",
      description: `Retrieve detailed information about a specific voucher including all accounting rows.

Args:
  - voucher_series (string): Voucher series (e.g., 'A') (required)
  - voucher_number (number): Voucher number within the series (required)
  - financial_year (number): Financial year ID (defaults to current year)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Complete voucher details including all debit/credit rows.`,
      inputSchema: GetVoucherSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: GetVoucherInput) => {
      try {
        let endpoint = `/3/vouchers/${encodeURIComponent(params.voucher_series)}/${params.voucher_number}`;
        const queryParams: Record<string, string | number | boolean | undefined> = {};

        if (params.financial_year) {
          queryParams.financialyear = params.financial_year;
        }

        const response = await fortnoxRequest<VoucherResponse>(endpoint, "GET", undefined, queryParams);
        const voucher = response.Voucher;

        const output = {
          voucher_series: voucher.VoucherSeries,
          voucher_number: voucher.VoucherNumber,
          year: voucher.Year,
          description: voucher.Description,
          transaction_date: voucher.TransactionDate,
          rows: (voucher.VoucherRows || []).map((row) => ({
            account_number: row.Account,
            debit: row.Debit || 0,
            credit: row.Credit || 0,
            description: row.Description || null,
            cost_center: row.CostCenter || null,
            project: row.Project || null
          }))
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          const lines = [
            `# Voucher ${voucher.VoucherSeries}${voucher.VoucherNumber}`,
            "",
            `**Description**: ${voucher.Description}`,
            `**Date**: ${formatDisplayDate(voucher.TransactionDate)}`,
            `**Year**: ${voucher.Year}`,
            "",
            "## Accounting Rows",
            "",
            "| Account | Description | Debit | Credit |",
            "|---------|-------------|-------|--------|"
          ];

          let totalDebit = 0;
          let totalCredit = 0;

          for (const row of voucher.VoucherRows || []) {
            totalDebit += row.Debit || 0;
            totalCredit += row.Credit || 0;
            lines.push(
              `| ${row.Account} | ${row.Description || "-"} | ${formatMoney(row.Debit || 0)} | ${formatMoney(row.Credit || 0)} |`
            );
          }

          lines.push(`| **Total** | | **${formatMoney(totalDebit)}** | **${formatMoney(totalCredit)}** |`);

          textContent = lines.join("\n");
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );

  // Create voucher
  server.registerTool(
    "fortnox_create_voucher",
    {
      title: "Create Fortnox Voucher",
      description: `Create a new voucher (manual accounting entry) in Fortnox.

IMPORTANT: The sum of debits must equal the sum of credits (balanced entry).

Args:
  - voucher_series (string): Voucher series (e.g., 'A', 'B') (required)
  - description (string): Voucher description (required)
  - transaction_date (string): Transaction date YYYY-MM-DD (required)
  - rows (array): Accounting rows, minimum 2 (required)
    - Each row: { account_number, debit?, credit?, description?, cost_center?, project? }
  - cost_center (string): Default cost center for all rows
  - project (string): Default project for all rows

Returns:
  The created voucher with assigned voucher number.

Example:
  Create a cash payment voucher:
  {
    "voucher_series": "A",
    "description": "Office supplies payment",
    "transaction_date": "2025-01-24",
    "rows": [
      { "account_number": 6110, "debit": 500, "description": "Office supplies" },
      { "account_number": 1910, "credit": 500, "description": "Cash" }
    ]
  }`,
      inputSchema: CreateVoucherSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: CreateVoucherInput) => {
      try {
        // Validate that debits equal credits
        let totalDebit = 0;
        let totalCredit = 0;
        for (const row of params.rows) {
          totalDebit += row.debit || 0;
          totalCredit += row.credit || 0;
        }

        if (Math.abs(totalDebit - totalCredit) > 0.01) {
          return buildErrorResponse(
            new Error(
              `Voucher is not balanced. Total debit (${totalDebit}) must equal total credit (${totalCredit}).`
            )
          );
        }

        const voucherData: Record<string, unknown> = {
          VoucherSeries: params.voucher_series,
          Description: params.description,
          TransactionDate: params.transaction_date,
          VoucherRows: params.rows.map((row) => {
            const voucherRow: Record<string, unknown> = {
              Account: row.account_number
            };
            if (row.debit !== undefined && row.debit > 0) voucherRow.Debit = row.debit;
            if (row.credit !== undefined && row.credit > 0) voucherRow.Credit = row.credit;
            if (row.description) voucherRow.Description = row.description;
            if (row.cost_center || params.cost_center) {
              voucherRow.CostCenter = row.cost_center || params.cost_center;
            }
            if (row.project || params.project) {
              voucherRow.Project = row.project || params.project;
            }
            return voucherRow;
          })
        };

        const response = await fortnoxRequest<VoucherResponse>(
          "/3/vouchers",
          "POST",
          { Voucher: voucherData }
        );
        const voucher = response.Voucher;

        const output = {
          success: true,
          message: `Voucher ${voucher.VoucherSeries}${voucher.VoucherNumber} created successfully`,
          voucher_series: voucher.VoucherSeries,
          voucher_number: voucher.VoucherNumber,
          description: voucher.Description,
          transaction_date: voucher.TransactionDate
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          textContent = `# Voucher Created\n\n` +
            `**Voucher**: ${voucher.VoucherSeries}${voucher.VoucherNumber}\n` +
            `**Description**: ${voucher.Description}\n` +
            `**Date**: ${formatDisplayDate(voucher.TransactionDate)}\n` +
            `**Total**: ${formatMoney(totalDebit)}\n\n` +
            `Voucher has been successfully created and booked.`;
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );

  // List voucher series
  server.registerTool(
    "fortnox_list_voucher_series",
    {
      title: "List Fortnox Voucher Series",
      description: `List available voucher series in Fortnox.

Voucher series are used to categorize vouchers (e.g., 'A' for manual entries, 'B' for bank, etc.).

Args:
  - response_format ('markdown' | 'json'): Output format

Returns:
  List of voucher series with code, description, and whether manual entries are allowed.`,
      inputSchema: ListVoucherSeriesSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: ListVoucherSeriesInput) => {
      try {
        const response = await fortnoxRequest<VoucherSeriesListResponse>("/3/voucherseries");
        const series = response.VoucherSeriesCollection || [];

        const output = {
          count: series.length,
          series: series.map((s) => ({
            code: s.Code,
            description: s.Description,
            manual: s.Manual ?? false
          }))
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          const lines = [
            "# Voucher Series",
            "",
            "| Code | Description | Manual |",
            "|------|-------------|--------|"
          ];

          for (const s of series) {
            lines.push(`| ${s.Code} | ${s.Description} | ${s.Manual ? "Yes" : "No"} |`);
          }

          textContent = lines.join("\n");
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );
}
