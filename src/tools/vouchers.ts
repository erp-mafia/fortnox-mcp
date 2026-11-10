import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fortnoxRequest, fetchAllPages } from "../services/api.js";
import { ResponseFormat } from "../constants.js";
import {
  buildToolResponse,
  buildErrorResponse,
  formatMoney,
  formatDisplayDate,
  formatListMarkdown,
  buildPaginationMeta
} from "../services/formatters.js";
import { periodToDateRange, getPeriodDescription } from "../services/dateHelpers.js";
import {
  type FortnoxVoucher,
  type FortnoxVoucherListItem,
  mapVoucherRow,
  countedRows,
  summarizeVoucherRows,
  unbalancedWarning,
  fetchVoucherDetails,
  failureWarning
} from "../services/vouchers.js";
import { fetchSie4, resolveFinancialYears } from "../services/sie.js";
import {
  ListVouchersSchema,
  GetVoucherSchema,
  CreateVoucherSchema,
  ListVoucherSeriesSchema,
  AccountActivitySchema,
  SearchVouchersSchema,
  type ListVouchersInput,
  type GetVoucherInput,
  type CreateVoucherInput,
  type ListVoucherSeriesInput,
  type AccountActivityInput,
  type SearchVouchersInput
} from "../schemas/vouchers.js";

// Each financial year is one full SIE download and parse, so bound how many a call reads
const MAX_SIE_YEARS_PER_CALL = 3;
const MAX_UNBALANCED_LISTED = 20;

// API response types
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

IMPORTANT: The financial_year parameter uses Fortnox sequential IDs (1, 2, 3...), NOT calendar years.
Use fortnox_list_financial_years first to find the correct ID for your target year.

Args:
  - limit (number): Max results per page, 1-100 (default: 20)
  - page (number): Page number for pagination (default: 1)
  - voucher_series (string): Filter by voucher series (e.g., 'A', 'B')
  - financial_year (number): Fortnox financial year ID (use fortnox_list_financial_years to find)
  - from_date (string): Filter vouchers from this date (YYYY-MM-DD)
  - to_date (string): Filter vouchers to this date (YYYY-MM-DD)
  - response_format ('markdown' | 'json'): Output format

Returns:
  List of vouchers with series, number, description, and date.

Examples:
  - First call fortnox_list_financial_years to find that ID 4 = 2025
  - List vouchers for 2025: financial_year=4
  - List manual vouchers: voucher_series="A", financial_year=4`,
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

IMPORTANT: The financial_year parameter uses Fortnox sequential IDs (1, 2, 3...), NOT calendar years.
Use fortnox_list_financial_years first to find the correct ID for your target year.

Args:
  - voucher_series (string): Voucher series (e.g., 'A') (required)
  - voucher_number (number): Voucher number within the series (required)
  - financial_year (number): Fortnox financial year ID (use fortnox_list_financial_years to find)
  - include_removed_rows (boolean): Count removed rows in the totals (default: false)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Complete voucher details including all debit/credit rows. Rows that were struck out
  when the voucher was corrected have removed=true and are left out of the totals.`,
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
        const voucherRows = voucher.VoucherRows || [];
        const totals = summarizeVoucherRows(voucherRows, params.include_removed_rows);
        const warning = unbalancedWarning(voucher, totals);

        const output = {
          voucher_series: voucher.VoucherSeries,
          voucher_number: voucher.VoucherNumber,
          year: voucher.Year,
          description: voucher.Description,
          transaction_date: voucher.TransactionDate,
          rows: voucherRows.map(mapVoucherRow),
          totals,
          ...(warning ? { warning } : {})
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

          for (const row of voucherRows) {
            const cells = [
              `${row.Account}`,
              row.Description || "-",
              formatMoney(row.Debit || 0),
              formatMoney(row.Credit || 0)
            ];
            if (row.Removed) {
              cells[0] = `~~${cells[0]}~~`;
              cells[1] = `~~${cells[1]}~~ (removed)`;
            }
            lines.push(`| ${cells.join(" | ")} |`);
          }

          lines.push(`| **Total** | | **${formatMoney(totals.total_debit)}** | **${formatMoney(totals.total_credit)}** |`);
          if (totals.removed_row_count > 0) {
            lines.push("");
            lines.push(totals.includes_removed_rows
              ? `*Totals include ${totals.removed_row_count} removed row(s).*`
              : `*${totals.removed_row_count} removed row(s) are struck out and left out of the totals.*`);
          }
          if (warning) {
            lines.push("");
            lines.push(`⚠️ ${warning}`);
          }

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

  // Account Activity Tool - Filter vouchers by account number
  server.registerTool(
    "fortnox_account_activity",
    {
      title: "Account Activity Report",
      description: `Show all voucher transactions affecting specific account(s).

IMPORTANT: The financial_year parameter uses Fortnox sequential IDs (1, 2, 3...), NOT calendar years.
Use fortnox_list_financial_years first to find the correct ID for your target year.

Common use cases:
- Rent expenses: account_number=5010 (or 5010-5099 range)
- Salary costs: account_range={ from: 7000, to: 7999 }
- Bank transactions: account_number=1930
- Revenue analysis: account_range={ from: 3000, to: 3999 }

Note: The Fortnox voucher API can't filter by account, so this tool reads the SIE 4 export
(all vouchers and rows of the financial year, in one request) and filters it. Without
financial_year it reads the years overlapping the date range (at most 3), or the current year.

Args:
  - account_number (number): Single account number to filter by (1000-9999)
  - account_numbers (array): Multiple account numbers to filter by (max 20)
  - account_range (object): Account range { from: 3000, to: 3999 }
  - financial_year (number): Fortnox financial year ID (use fortnox_list_financial_years to find)
  - period ('today' | ... | 'last_year'): Convenience date period filter
  - from_date (string): Filter vouchers from this date (YYYY-MM-DD)
  - to_date (string): Filter vouchers to this date (YYYY-MM-DD)
  - voucher_series (string): Filter by voucher series (e.g., 'A')
  - include_summary (boolean): Include totals per account (default: true)
  - include_removed_rows (boolean): Include removed (struck-out correction) rows (default: false)
  - max_transactions (number): Max transactions to return, newest first (default: 100)
  - response_format ('markdown' | 'json'): Output format

At least one of account_number, account_numbers or account_range is required.

Returns:
  Transactions matching the account criteria with optional summary. Removed rows are
  left out by default so corrected vouchers are not double-counted.

Examples:
  - First call fortnox_list_financial_years to find that ID 4 = 2025
  - Bank transactions this month: account_number=1930, financial_year=4, period="this_month"
  - Salary costs: account_range={ from: 7000, to: 7999 }, financial_year=4
  - Rent expenses: account_number=5010, financial_year=4`,
      inputSchema: AccountActivitySchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: AccountActivityInput) => {
      try {
        if (params.account_number === undefined && params.account_numbers === undefined && params.account_range === undefined) {
          throw new Error("Must specify at least one of: account_number, account_numbers, or account_range");
        }

        // Build account filter set
        const accountFilter = new Set<number>();
        if (params.account_number !== undefined) {
          accountFilter.add(params.account_number);
        }
        if (params.account_numbers) {
          params.account_numbers.forEach(n => accountFilter.add(n));
        }
        let accountRangeFrom: number | undefined;
        let accountRangeTo: number | undefined;
        if (params.account_range) {
          accountRangeFrom = params.account_range.from;
          accountRangeTo = params.account_range.to;
        }

        // Resolve the date range
        let fromDate: string | undefined;
        let toDate: string | undefined;
        let dateRangeDescription: string | undefined;
        if (params.period) {
          const dateRange = periodToDateRange(params.period);
          fromDate = dateRange.from_date;
          toDate = dateRange.to_date;
          dateRangeDescription = getPeriodDescription(params.period);
        } else {
          fromDate = params.from_date;
          toDate = params.to_date;
          if (fromDate || toDate) {
            dateRangeDescription = `${fromDate || "start"} to ${toDate || "end"}`;
          }
        }

        // Helper to check if account matches filter
        const accountMatches = (account: number): boolean => {
          if (accountFilter.has(account)) return true;
          if (accountRangeFrom !== undefined && accountRangeTo !== undefined) {
            return account >= accountRangeFrom && account <= accountRangeTo;
          }
          return false;
        };

        const matchingTransactions: Array<{
          voucher_series: string;
          voucher_number: number;
          transaction_date: string;
          voucher_description: string;
          account: number;
          description: string | null;
          debit: number;
          credit: number;
          cost_center: string | null;
          project: string | null;
          removed: boolean;
        }> = [];

        const accountSummary = new Map<number, { debit: number; credit: number; count: number }>();
        const unbalancedVouchers: string[] = [];
        let unbalancedCount = 0;
        let matchingCount = 0;
        let totalVouchers = 0;
        let vouchersScanned = 0;

        const newestFirst = (a: { transaction_date: string; voucher_number: number }, b: { transaction_date: string; voucher_number: number }) =>
          b.transaction_date.localeCompare(a.transaction_date) || b.voucher_number - a.voucher_number;

        // Read the SIE 4 export: every voucher and row of the year in one request
        const financialYears = await resolveFinancialYears(params.financial_year, fromDate, toDate);
        if (financialYears.length > MAX_SIE_YEARS_PER_CALL) {
          throw new Error(
            `The date range covers ${financialYears.length} financial years; this tool reads at most ` +
            `${MAX_SIE_YEARS_PER_CALL} per call. Narrow from_date/to_date or call once per financial_year.`
          );
        }
        for (const year of financialYears) {
          const sie = await fetchSie4(year);
          totalVouchers += sie.vouchers.length;

          for (const voucher of sie.vouchers) {
            if (params.voucher_series && voucher.series !== params.voucher_series) continue;
            if (fromDate && voucher.date < fromDate) continue;
            if (toDate && voucher.date > toDate) continue;
            vouchersScanned++;

            const activeSum = voucher.rows
              .filter((row) => !row.removed)
              .reduce((sum, row) => sum + row.amount, 0);
            if (Math.abs(activeSum) >= 0.005) {
              unbalancedCount++;
              if (unbalancedVouchers.length < MAX_UNBALANCED_LISTED) {
                unbalancedVouchers.push(`${voucher.series}${voucher.number}`);
              }
            }

            for (const row of voucher.rows) {
              if (row.removed && !params.include_removed_rows) continue;
              if (!accountMatches(row.account)) continue;

              const debit = row.amount > 0 ? row.amount : 0;
              const credit = row.amount < 0 ? -row.amount : 0;
              matchingCount++;
              matchingTransactions.push({
                voucher_series: voucher.series,
                voucher_number: voucher.number,
                transaction_date: voucher.date,
                voucher_description: voucher.text,
                account: row.account,
                description: row.text || sie.accountNames.get(row.account) || null,
                debit,
                credit,
                cost_center: row.cost_center,
                project: row.project,
                removed: row.removed
              });

              if (params.include_summary) {
                const existing = accountSummary.get(row.account) || { debit: 0, credit: 0, count: 0 };
                existing.debit += debit;
                existing.credit += credit;
                existing.count += 1;
                accountSummary.set(row.account, existing);
              }
            }
          }

          // Keep only the newest rows that can be returned; the summary already counts every match
          matchingTransactions.sort(newestFirst);
          matchingTransactions.length = Math.min(matchingTransactions.length, params.max_transactions);
        }

        const unbalancedMore = unbalancedCount - unbalancedVouchers.length;
        const warnings = unbalancedCount > 0
          ? [`Active rows do not balance on: ${unbalancedVouchers.join(", ")}${unbalancedMore > 0 ? ` and ${unbalancedMore} more` : ""}. Check these vouchers in Fortnox.`]
          : [];

        // Build output
        const summaryArray = params.include_summary
          ? Array.from(accountSummary.entries())
              .map(([account, data]) => ({
                account,
                total_debit: Math.round(data.debit * 100) / 100,
                total_credit: Math.round(data.credit * 100) / 100,
                net_change: Math.round((data.credit - data.debit) * 100) / 100,
                transaction_count: data.count
              }))
              .sort((a, b) => a.account - b.account)
          : undefined;

        const output: Record<string, unknown> = {
          filter: {
            accounts: Array.from(accountFilter),
            account_range: params.account_range || null,
            financial_year: params.financial_year,
            date_range: dateRangeDescription || null,
            voucher_series: params.voucher_series || null
          },
          source: "sie4",
          financial_years_read: financialYears.map((y) => y ?? "current"),
          vouchers_scanned: vouchersScanned,
          total_vouchers_available: totalVouchers,
          truncated: false,
          include_removed_rows: params.include_removed_rows,
          warnings,
          matching_transactions: matchingCount,
          transactions_returned: matchingTransactions.length,
          summary: summaryArray,
          transactions: matchingTransactions
        };

        // Format output
        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          const accountDesc = params.account_number
            ? `Account ${params.account_number}`
            : params.account_range
              ? `Accounts ${params.account_range.from}-${params.account_range.to}`
              : `Accounts ${Array.from(accountFilter).join(", ")}`;

          const lines: string[] = [
            `# Account Activity: ${accountDesc}`,
            ""
          ];

          if (dateRangeDescription) {
            lines.push(`**Period**: ${dateRangeDescription}`);
          }
          lines.push(`**Financial Year**: ${financialYears.map((y) => y ?? "current").join(", ")}`);
          lines.push(`**Vouchers Scanned**: ${vouchersScanned} | **Matching Transactions**: ${matchingCount}`);

          for (const warning of warnings) {
            lines.push("");
            lines.push(`⚠️ ${warning}`);
          }

          if (summaryArray && summaryArray.length > 0) {
            lines.push("");
            lines.push("## Summary");
            lines.push("");
            lines.push("| Account | Total Debit | Total Credit | Net Change | Transactions |");
            lines.push("|---------|-------------|--------------|------------|--------------|");

            for (const s of summaryArray) {
              lines.push(
                `| ${s.account} | ${formatMoney(s.total_debit)} | ${formatMoney(s.total_credit)} | ${formatMoney(s.net_change)} | ${s.transaction_count} |`
              );
            }
          }

          if (matchingTransactions.length > 0) {
            lines.push("");
            lines.push("## Transactions");
            lines.push("");
            lines.push("| Date | Voucher | Account | Description | Debit | Credit |");
            lines.push("|------|---------|---------|-------------|-------|--------|");

            for (const t of matchingTransactions) {
              const description = `${t.description || t.voucher_description}${t.removed ? " (removed)" : ""}`;
              lines.push(
                `| ${formatDisplayDate(t.transaction_date)} | ${t.voucher_series}${t.voucher_number} | ${t.account} | ${description} | ${formatMoney(t.debit)} | ${formatMoney(t.credit)} |`
              );
            }

            if (matchingCount > matchingTransactions.length) {
              lines.push(`| ... | ... | ... | *${matchingCount - matchingTransactions.length} more transactions* | ... | ... |`);
            }
          } else {
            lines.push("");
            lines.push("*No transactions found matching the account criteria.*");
          }

          textContent = lines.join("\n");
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );

  // Search Vouchers Tool - Text search in voucher descriptions
  server.registerTool(
    "fortnox_search_vouchers",
    {
      title: "Search Vouchers",
      description: `Search vouchers by description text.

IMPORTANT: The financial_year parameter uses Fortnox sequential IDs (1, 2, 3...), NOT calendar years.
Use fortnox_list_financial_years first to find the correct ID for your target year.

Performs client-side text search across voucher descriptions.

Args:
  - search_text (string): Text to search for in voucher descriptions (min 2 chars)
  - financial_year (number): Fortnox financial year ID (use fortnox_list_financial_years to find)
  - period ('today' | ... | 'last_year'): Convenience date period filter
  - from_date (string): Filter vouchers from this date (YYYY-MM-DD)
  - to_date (string): Filter vouchers to this date (YYYY-MM-DD)
  - voucher_series (string): Filter by voucher series (e.g., 'A')
  - case_sensitive (boolean): Case-sensitive search (default: false)
  - include_rows (boolean): Include voucher row details and search row descriptions (default: false)
  - include_removed_rows (boolean): With include_rows, also return removed rows (default: false)
  - max_vouchers (number): Max vouchers to scan, 10-500 (default: 500)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Vouchers with descriptions matching the search text.

Examples:
  - First call fortnox_list_financial_years to find that ID 4 = 2025
  - Find salary vouchers: search_text="salary", financial_year=4, period="this_year"
  - Find rent payments: search_text="rent", financial_year=4, voucher_series="B"`,
      inputSchema: SearchVouchersSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: SearchVouchersInput) => {
      try {
        // Build query params
        const queryParams: Record<string, string | number | boolean | undefined> = {
          financialyear: params.financial_year
        };

        // Handle period convenience filter
        let dateRangeDescription: string | undefined;
        if (params.period) {
          const dateRange = periodToDateRange(params.period);
          queryParams.fromdate = dateRange.from_date;
          queryParams.todate = dateRange.to_date;
          dateRangeDescription = getPeriodDescription(params.period);
        } else {
          if (params.from_date) queryParams.fromdate = params.from_date;
          if (params.to_date) queryParams.todate = params.to_date;
          if (params.from_date || params.to_date) {
            dateRangeDescription = `${params.from_date || "start"} to ${params.to_date || "end"}`;
          }
        }

        // Determine endpoint based on series filter
        let endpoint = "/3/vouchers";
        if (params.voucher_series) {
          endpoint = `/3/vouchers/sublist/${encodeURIComponent(params.voucher_series)}`;
        }

        // Fetch voucher list
        const result = await fetchAllPages<FortnoxVoucherListItem, VoucherListResponse>(
          endpoint,
          queryParams,
          (r) => r.Vouchers || [],
          (r) => r.MetaInformation?.["@TotalResources"] || 0,
          { maxResults: params.max_vouchers, maxPages: Math.ceil(params.max_vouchers / 100) }
        );

        const voucherList = result.items;
        const totalVouchers = result.total;

        // Prepare search
        const searchText = params.case_sensitive
          ? params.search_text
          : params.search_text.toLowerCase();

        const textMatches = (text: string | undefined): boolean => {
          if (!text) return false;
          const compareText = params.case_sensitive ? text : text.toLowerCase();
          return compareText.includes(searchText);
        };

        // First pass: filter by description in list
        const candidateVouchers = voucherList.filter(v => textMatches(v.Description));

        // If include_rows is true, we need to fetch details and also check row descriptions
        interface MatchingVoucher {
          voucher_series: string;
          voucher_number: number;
          transaction_date: string;
          description: string;
          matched_in: "description" | "row";
          rows?: Array<{
            account: number;
            description: string | null;
            debit: number;
            credit: number;
            removed: boolean;
          }> | null;
        }

        const matchingVouchers: MatchingVoucher[] = [];
        let fetchFailures: Awaited<ReturnType<typeof fetchVoucherDetails>>["failures"] = [];

        if (params.include_rows) {
          // Fetch details for all vouchers (to check row descriptions too)
          const details = await fetchVoucherDetails(voucherList, params.financial_year);
          fetchFailures = details.failures;
          const detailByKey = new Map(details.vouchers.map((v) => [`${v.VoucherSeries}${v.VoucherNumber}`, v]));

          for (const item of voucherList) {
            const voucher = detailByKey.get(`${item.VoucherSeries}${item.VoucherNumber}`);

            if (!voucher) {
              // Details could not be fetched; still report a match on the list description
              if (textMatches(item.Description)) {
                matchingVouchers.push({
                  voucher_series: item.VoucherSeries,
                  voucher_number: item.VoucherNumber,
                  transaction_date: item.TransactionDate,
                  description: item.Description,
                  matched_in: "description",
                  rows: null
                });
              }
              continue;
            }

            const rows = countedRows(voucher.VoucherRows || [], params.include_removed_rows);
            const descriptionMatch = textMatches(voucher.Description);
            const rowMatch = rows.some(row => textMatches(row.Description));

            if (descriptionMatch || rowMatch) {
              matchingVouchers.push({
                voucher_series: voucher.VoucherSeries,
                voucher_number: voucher.VoucherNumber,
                transaction_date: voucher.TransactionDate,
                description: voucher.Description,
                matched_in: descriptionMatch ? "description" : "row",
                rows: rows.map(row => ({
                  account: row.Account,
                  description: row.Description || null,
                  debit: row.Debit || 0,
                  credit: row.Credit || 0,
                  removed: row.Removed === true
                }))
              });
            }
          }
        } else {
          // Just use the list descriptions
          for (const v of candidateVouchers) {
            matchingVouchers.push({
              voucher_series: v.VoucherSeries,
              voucher_number: v.VoucherNumber,
              transaction_date: v.TransactionDate,
              description: v.Description,
              matched_in: "description"
            });
          }
        }
        const fetchWarning = failureWarning(fetchFailures);

        // Sort by date descending
        matchingVouchers.sort((a, b) =>
          b.transaction_date.localeCompare(a.transaction_date) ||
          b.voucher_number - a.voucher_number
        );

        // Build output
        const output: Record<string, unknown> = {
          search_text: params.search_text,
          case_sensitive: params.case_sensitive,
          financial_year: params.financial_year,
          date_range: dateRangeDescription || null,
          voucher_series: params.voucher_series || null,
          vouchers_scanned: voucherList.length,
          total_vouchers_available: totalVouchers,
          truncated: result.truncated,
          truncation_reason: result.truncationReason,
          voucher_fetch_failures: fetchFailures,
          warnings: fetchWarning ? [fetchWarning] : [],
          matching_count: matchingVouchers.length,
          vouchers: matchingVouchers
        };

        // Format output
        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          const lines: string[] = [
            `# Voucher Search: "${params.search_text}"`,
            ""
          ];

          if (dateRangeDescription) {
            lines.push(`**Period**: ${dateRangeDescription}`);
          }
          lines.push(`**Financial Year**: ${params.financial_year}`);
          lines.push(`**Vouchers Scanned**: ${voucherList.length} | **Matches**: ${matchingVouchers.length}`);

          if (result.truncated) {
            lines.push("");
            lines.push(`⚠️ **Note**: ${result.truncationReason}`);
          }
          if (fetchWarning) {
            lines.push("");
            lines.push(`⚠️ ${fetchWarning}`);
          }

          if (matchingVouchers.length > 0) {
            lines.push("");
            lines.push("## Results");
            lines.push("");

            const displayLimit = 50;
            const displayVouchers = matchingVouchers.slice(0, displayLimit);

            for (const v of displayVouchers) {
              lines.push(`### ${v.voucher_series}${v.voucher_number} (${formatDisplayDate(v.transaction_date)})`);
              lines.push(`**Description**: ${v.description}`);

              if (v.rows && v.rows.length > 0) {
                lines.push("");
                lines.push("| Account | Description | Debit | Credit |");
                lines.push("|---------|-------------|-------|--------|");
                for (const row of v.rows) {
                  const rowDesc = `${row.description || "-"}${row.removed ? " (removed)" : ""}`;
                  const highlight = textMatches(row.description || "") ? " **" : "";
                  lines.push(`| ${row.account} | ${highlight}${rowDesc}${highlight} | ${formatMoney(row.debit)} | ${formatMoney(row.credit)} |`);
                }
              }
              lines.push("");
            }

            if (matchingVouchers.length > displayLimit) {
              lines.push(`*... and ${matchingVouchers.length - displayLimit} more matches*`);
            }
          } else {
            lines.push("");
            lines.push(`*No vouchers found matching "${params.search_text}"*`);
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
