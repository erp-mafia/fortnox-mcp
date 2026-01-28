import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchAllPages } from "../services/api.js";
import { ResponseFormat } from "../constants.js";
import {
  buildToolResponse,
  buildErrorResponse,
  formatMoney
} from "../services/formatters.js";
import {
  periodToDateRange,
  getPeriodDescription,
  getAgeBucket,
  type AgeBucket
} from "../services/dateHelpers.js";
import {
  InvoiceSummarySchema,
  TopCustomersSchema,
  UnpaidReportSchema,
  type InvoiceSummaryInput,
  type TopCustomersInput,
  type UnpaidReportInput
} from "../schemas/analytics.js";

// Reuse invoice types from invoices.ts
interface FortnoxInvoiceListItem {
  DocumentNumber: string;
  CustomerNumber: string;
  CustomerName?: string;
  InvoiceDate?: string;
  DueDate?: string;
  Total?: number;
  Balance?: number;
  Currency?: string;
  Booked?: boolean;
  Cancelled?: boolean;
}

interface InvoiceListResponse {
  Invoices: FortnoxInvoiceListItem[];
  MetaInformation?: {
    "@TotalResources": number;
    "@TotalPages": number;
    "@CurrentPage": number;
  };
}

/**
 * Calculate summary statistics for a set of invoices
 */
function calculateStats(invoices: FortnoxInvoiceListItem[]): {
  count: number;
  total: number;
  average: number;
  min: number;
  max: number;
  paid_count: number;
  unpaid_count: number;
  total_balance: number;
} {
  if (invoices.length === 0) {
    return {
      count: 0,
      total: 0,
      average: 0,
      min: 0,
      max: 0,
      paid_count: 0,
      unpaid_count: 0,
      total_balance: 0
    };
  }

  const totals = invoices.map(inv => inv.Total || 0);
  const sum = totals.reduce((a, b) => a + b, 0);
  const balanceSum = invoices.reduce((a, inv) => a + (inv.Balance || 0), 0);
  const paidCount = invoices.filter(inv => (inv.Balance || 0) === 0 && !inv.Cancelled).length;
  const unpaidCount = invoices.filter(inv => (inv.Balance || 0) > 0).length;

  return {
    count: invoices.length,
    total: sum,
    average: sum / invoices.length,
    min: Math.min(...totals),
    max: Math.max(...totals),
    paid_count: paidCount,
    unpaid_count: unpaidCount,
    total_balance: balanceSum
  };
}

/**
 * Get month key from date string (YYYY-MM)
 */
function getMonthKey(dateStr: string | undefined): string {
  if (!dateStr) return "unknown";
  return dateStr.substring(0, 7); // YYYY-MM
}

/**
 * Get invoice status
 */
function getInvoiceStatus(inv: FortnoxInvoiceListItem): string {
  if (inv.Cancelled) return "cancelled";
  if ((inv.Balance || 0) === 0) return "paid";
  if (!inv.Booked) return "draft";
  return "unpaid";
}

/**
 * Register all analytics tools
 */
export function registerAnalyticsTools(server: McpServer): void {
  // Invoice Summary Tool
  server.registerTool(
    "fortnox_invoice_summary",
    {
      title: "Invoice Summary Analytics",
      description: `Calculate summary statistics for invoices over a period.

Answers questions like:
- "What was my total revenue this month?"
- "How many invoices did we send last quarter?"
- "What's the average invoice amount this year?"
- "Show me revenue breakdown by customer"

Args:
  - period ('today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter' | 'this_year' | 'last_year'): Date period to analyze
  - from_date (string): Start date YYYY-MM-DD (ignored if period specified)
  - to_date (string): End date YYYY-MM-DD (ignored if period specified)
  - filter ('cancelled' | 'fullypaid' | 'unpaid' | 'unpaidoverdue' | 'unbooked'): Filter by invoice status
  - customer_number (string): Filter by specific customer
  - group_by ('customer' | 'month' | 'status'): Group statistics by dimension
  - include_details (boolean): Include individual invoice list (default: false)
  - response_format ('markdown' | 'json'): Output format

Returns:
  For JSON: { period, date_range, summary: { count, total, average, min, max, ... }, groups?: [...], invoices?: [...] }
  For Markdown: Formatted summary with totals and optional breakdown

Examples:
  - Monthly revenue: period="this_month"
  - Revenue by customer this year: period="this_year", group_by="customer"
  - Unpaid invoice totals: filter="unpaid"

Error Handling:
  - Returns truncation warning if >10,000 invoices
  - Returns "Error: ..." if API call fails`,
      inputSchema: InvoiceSummarySchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: InvoiceSummaryInput) => {
      try {
        // Build query params
        const queryParams: Record<string, string | number | boolean | undefined> = {};

        if (params.filter) queryParams.filter = params.filter;
        if (params.customer_number) queryParams.customernumber = params.customer_number;

        // Handle period
        let dateRangeDescription: string | undefined;
        if (params.period) {
          const dateRange = periodToDateRange(params.period);
          queryParams.fromdate = dateRange.from_date;
          queryParams.todate = dateRange.to_date;
          dateRangeDescription = getPeriodDescription(params.period);
        } else if (params.from_date || params.to_date) {
          if (params.from_date) queryParams.fromdate = params.from_date;
          if (params.to_date) queryParams.todate = params.to_date;
          dateRangeDescription = `${params.from_date || "start"} to ${params.to_date || "end"}`;
        }

        // Fetch all invoices for the period
        const result = await fetchAllPages<FortnoxInvoiceListItem, InvoiceListResponse>(
          "/3/invoices",
          queryParams,
          (r) => r.Invoices || [],
          (r) => r.MetaInformation?.["@TotalResources"] || 0
        );

        const invoices = result.items;
        const overallStats = calculateStats(invoices);

        // Build grouped statistics if requested
        let groups: Array<{ key: string; stats: ReturnType<typeof calculateStats> }> | undefined;

        if (params.group_by) {
          const groupMap = new Map<string, FortnoxInvoiceListItem[]>();

          for (const inv of invoices) {
            let key: string;
            switch (params.group_by) {
              case "customer":
                key = inv.CustomerName || inv.CustomerNumber || "unknown";
                break;
              case "month":
                key = getMonthKey(inv.InvoiceDate);
                break;
              case "status":
                key = getInvoiceStatus(inv);
                break;
            }

            if (!groupMap.has(key)) {
              groupMap.set(key, []);
            }
            groupMap.get(key)!.push(inv);
          }

          groups = Array.from(groupMap.entries())
            .map(([key, items]) => ({
              key,
              stats: calculateStats(items)
            }))
            .sort((a, b) => b.stats.total - a.stats.total); // Sort by total descending
        }

        const output: Record<string, unknown> = {
          period: params.period || null,
          date_range: dateRangeDescription || null,
          api_total: result.total,
          fetched: invoices.length,
          truncated: result.truncated,
          truncation_reason: result.truncationReason,
          summary: overallStats
        };

        if (groups) {
          output.groups = groups;
        }

        if (params.include_details) {
          output.invoices = invoices.map(inv => ({
            document_number: inv.DocumentNumber,
            customer_number: inv.CustomerNumber,
            customer_name: inv.CustomerName || null,
            invoice_date: inv.InvoiceDate || null,
            total: inv.Total || 0,
            balance: inv.Balance || 0,
            status: getInvoiceStatus(inv)
          }));
        }

        // Format output
        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          const lines: string[] = [
            "# Invoice Summary",
            ""
          ];

          if (dateRangeDescription) {
            lines.push(`**Period**: ${dateRangeDescription}`);
            lines.push("");
          }

          if (result.truncated) {
            lines.push(`⚠️ **Note**: ${result.truncationReason}`);
            lines.push("");
          }

          lines.push("## Overall Statistics");
          lines.push("");
          lines.push(`| Metric | Value |`);
          lines.push(`|--------|-------|`);
          lines.push(`| Invoice Count | ${overallStats.count} |`);
          lines.push(`| Total Amount | ${formatMoney(overallStats.total)} |`);
          lines.push(`| Average Invoice | ${formatMoney(overallStats.average)} |`);
          lines.push(`| Minimum | ${formatMoney(overallStats.min)} |`);
          lines.push(`| Maximum | ${formatMoney(overallStats.max)} |`);
          lines.push(`| Paid Invoices | ${overallStats.paid_count} |`);
          lines.push(`| Unpaid Invoices | ${overallStats.unpaid_count} |`);
          lines.push(`| Outstanding Balance | ${formatMoney(overallStats.total_balance)} |`);

          if (groups && groups.length > 0) {
            lines.push("");
            lines.push(`## Breakdown by ${params.group_by}`);
            lines.push("");
            lines.push(`| ${params.group_by === "month" ? "Month" : params.group_by === "customer" ? "Customer" : "Status"} | Count | Total | Average |`);
            lines.push(`|--------|-------|-------|---------|`);

            for (const group of groups) {
              lines.push(`| ${group.key} | ${group.stats.count} | ${formatMoney(group.stats.total)} | ${formatMoney(group.stats.average)} |`);
            }
          }

          textContent = lines.join("\n");
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );

  // Top Customers Tool
  server.registerTool(
    "fortnox_top_customers",
    {
      title: "Top Customers Analytics",
      description: `Identify top customers by various metrics.

Answers questions like:
- "Who are my top 10 customers by revenue?"
- "Which customers have the most invoices?"
- "Who has the highest unpaid balance?"
- "What's the average invoice size per customer?"

Args:
  - metric ('total_amount' | 'invoice_count' | 'unpaid_amount' | 'average_invoice'): How to rank customers (default: total_amount)
  - period ('today' | ... | 'last_year'): Date period to analyze
  - from_date (string): Start date YYYY-MM-DD (ignored if period specified)
  - to_date (string): End date YYYY-MM-DD (ignored if period specified)
  - top_n (number): Number of customers to return, 1-50 (default: 10)
  - include_details (boolean): Include invoice breakdown per customer (default: false)
  - response_format ('markdown' | 'json'): Output format

Returns:
  For JSON: { metric, period, customers: [{ rank, customer_number, customer_name, value, invoice_count, ... }] }
  For Markdown: Ranked table of top customers

Examples:
  - Top 10 by revenue this year: period="this_year", top_n=10
  - Customers with most unpaid: metric="unpaid_amount"
  - Top 5 by invoice count last month: metric="invoice_count", period="last_month", top_n=5

Error Handling:
  - Returns truncation warning if >10,000 invoices analyzed
  - Returns "Error: ..." if API call fails`,
      inputSchema: TopCustomersSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: TopCustomersInput) => {
      try {
        // Build query params
        const queryParams: Record<string, string | number | boolean | undefined> = {};

        // Handle period
        let dateRangeDescription: string | undefined;
        if (params.period) {
          const dateRange = periodToDateRange(params.period);
          queryParams.fromdate = dateRange.from_date;
          queryParams.todate = dateRange.to_date;
          dateRangeDescription = getPeriodDescription(params.period);
        } else if (params.from_date || params.to_date) {
          if (params.from_date) queryParams.fromdate = params.from_date;
          if (params.to_date) queryParams.todate = params.to_date;
          dateRangeDescription = `${params.from_date || "start"} to ${params.to_date || "end"}`;
        }

        // Fetch all invoices
        const result = await fetchAllPages<FortnoxInvoiceListItem, InvoiceListResponse>(
          "/3/invoices",
          queryParams,
          (r) => r.Invoices || [],
          (r) => r.MetaInformation?.["@TotalResources"] || 0
        );

        const invoices = result.items;

        // Group by customer
        const customerMap = new Map<string, {
          customer_number: string;
          customer_name: string;
          invoices: FortnoxInvoiceListItem[];
        }>();

        for (const inv of invoices) {
          const key = inv.CustomerNumber || "unknown";
          if (!customerMap.has(key)) {
            customerMap.set(key, {
              customer_number: key,
              customer_name: inv.CustomerName || key,
              invoices: []
            });
          }
          customerMap.get(key)!.invoices.push(inv);
        }

        // Calculate metrics and sort
        const customerStats = Array.from(customerMap.values()).map(c => {
          const totalAmount = c.invoices.reduce((sum, inv) => sum + (inv.Total || 0), 0);
          const unpaidAmount = c.invoices.reduce((sum, inv) => sum + (inv.Balance || 0), 0);
          const invoiceCount = c.invoices.length;
          const averageInvoice = invoiceCount > 0 ? totalAmount / invoiceCount : 0;

          return {
            customer_number: c.customer_number,
            customer_name: c.customer_name,
            total_amount: totalAmount,
            invoice_count: invoiceCount,
            unpaid_amount: unpaidAmount,
            average_invoice: averageInvoice,
            invoices: c.invoices
          };
        });

        // Sort by selected metric
        const metricKey = params.metric as keyof typeof customerStats[0];
        customerStats.sort((a, b) => (b[metricKey] as number) - (a[metricKey] as number));

        // Take top N
        const topCustomers = customerStats.slice(0, params.top_n);

        // Build output
        const output: Record<string, unknown> = {
          metric: params.metric,
          period: params.period || null,
          date_range: dateRangeDescription || null,
          total_invoices_analyzed: invoices.length,
          unique_customers: customerMap.size,
          truncated: result.truncated,
          truncation_reason: result.truncationReason,
          customers: topCustomers.map((c, index) => {
            const customer: Record<string, unknown> = {
              rank: index + 1,
              customer_number: c.customer_number,
              customer_name: c.customer_name,
              total_amount: c.total_amount,
              invoice_count: c.invoice_count,
              unpaid_amount: c.unpaid_amount,
              average_invoice: c.average_invoice
            };

            if (params.include_details) {
              customer.invoices = c.invoices.map(inv => ({
                document_number: inv.DocumentNumber,
                invoice_date: inv.InvoiceDate,
                total: inv.Total || 0,
                balance: inv.Balance || 0
              }));
            }

            return customer;
          })
        };

        // Format output
        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          const metricLabels: Record<string, string> = {
            total_amount: "Total Revenue",
            invoice_count: "Invoice Count",
            unpaid_amount: "Unpaid Amount",
            average_invoice: "Avg Invoice"
          };

          const lines: string[] = [
            `# Top ${params.top_n} Customers by ${metricLabels[params.metric]}`,
            ""
          ];

          if (dateRangeDescription) {
            lines.push(`**Period**: ${dateRangeDescription}`);
          }
          lines.push(`**Invoices analyzed**: ${invoices.length} from ${customerMap.size} customers`);
          lines.push("");

          if (result.truncated) {
            lines.push(`⚠️ **Note**: ${result.truncationReason}`);
            lines.push("");
          }

          lines.push(`| Rank | Customer | ${metricLabels[params.metric]} | Invoices | Total | Unpaid |`);
          lines.push(`|------|----------|${"-".repeat(metricLabels[params.metric].length + 2)}|----------|-------|--------|`);

          for (const c of topCustomers) {
            const metricValue = params.metric === "invoice_count"
              ? c.invoice_count.toString()
              : formatMoney(c[params.metric]);

            lines.push(
              `| ${(output.customers as Array<{ rank: number }>).find(x => x.rank === topCustomers.indexOf(c) + 1)?.rank} ` +
              `| ${c.customer_name} ` +
              `| ${metricValue} ` +
              `| ${c.invoice_count} ` +
              `| ${formatMoney(c.total_amount)} ` +
              `| ${formatMoney(c.unpaid_amount)} |`
            );
          }

          textContent = lines.join("\n");
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );

  // Unpaid Report Tool
  server.registerTool(
    "fortnox_unpaid_report",
    {
      title: "Unpaid Invoices Report",
      description: `Generate an accounts receivable aging report for unpaid invoices.

Answers questions like:
- "What invoices are overdue?"
- "How much is owed by each customer?"
- "Show me aging breakdown of receivables"
- "Which invoices over 10,000 SEK are unpaid?"

Args:
  - min_amount (number): Only include invoices >= this amount
  - customer_number (string): Filter by specific customer
  - group_by ('customer' | 'age_bucket' | 'both'): How to group report (default: both)
  - include_details (boolean): Include individual invoice list (default: true)
  - response_format ('markdown' | 'json'): Output format

Returns:
  For JSON: { summary, by_customer?, by_age_bucket?, invoices? }
  For Markdown: Formatted aging report with totals

Age Buckets:
  - not_due: Due date is in the future
  - 1-30 days: Overdue 1-30 days
  - 31-60 days: Overdue 31-60 days
  - 61-90 days: Overdue 61-90 days
  - 90+ days: Overdue more than 90 days

Examples:
  - Full aging report: (use defaults)
  - Large unpaid invoices: min_amount=50000
  - Specific customer aging: customer_number="1001"

Error Handling:
  - Returns truncation warning if >10,000 invoices
  - Returns "Error: ..." if API call fails`,
      inputSchema: UnpaidReportSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: UnpaidReportInput) => {
      try {
        // Build query params - fetch both unpaid and unpaidoverdue
        const queryParams: Record<string, string | number | boolean | undefined> = {};

        if (params.customer_number) queryParams.customernumber = params.customer_number;

        // Fetch unpaid invoices (includes both unpaid and overdue)
        queryParams.filter = "unpaid";

        const result = await fetchAllPages<FortnoxInvoiceListItem, InvoiceListResponse>(
          "/3/invoices",
          queryParams,
          (r) => r.Invoices || [],
          (r) => r.MetaInformation?.["@TotalResources"] || 0
        );

        let invoices = result.items;

        // Apply min_amount filter
        if (params.min_amount !== undefined) {
          invoices = invoices.filter(inv => (inv.Balance || 0) >= params.min_amount!);
        }

        // Calculate overall summary
        const totalUnpaid = invoices.reduce((sum, inv) => sum + (inv.Balance || 0), 0);
        const totalInvoiceAmount = invoices.reduce((sum, inv) => sum + (inv.Total || 0), 0);

        // Group by age bucket
        const byAgeBucket = new Map<AgeBucket, FortnoxInvoiceListItem[]>();
        const ageBucketOrder: AgeBucket[] = ["not_due", "1-30 days", "31-60 days", "61-90 days", "90+ days"];

        for (const bucket of ageBucketOrder) {
          byAgeBucket.set(bucket, []);
        }

        for (const inv of invoices) {
          const bucket = getAgeBucket(inv.DueDate);
          byAgeBucket.get(bucket)!.push(inv);
        }

        // Group by customer
        const byCustomer = new Map<string, FortnoxInvoiceListItem[]>();

        for (const inv of invoices) {
          const key = inv.CustomerName || inv.CustomerNumber || "unknown";
          if (!byCustomer.has(key)) {
            byCustomer.set(key, []);
          }
          byCustomer.get(key)!.push(inv);
        }

        // Build output
        const output: Record<string, unknown> = {
          summary: {
            total_invoices: invoices.length,
            total_invoice_amount: totalInvoiceAmount,
            total_unpaid_balance: totalUnpaid,
            unique_customers: byCustomer.size
          },
          truncated: result.truncated,
          truncation_reason: result.truncationReason
        };

        // Add groupings based on params
        if (params.group_by === "age_bucket" || params.group_by === "both") {
          output.by_age_bucket = ageBucketOrder.map(bucket => {
            const items = byAgeBucket.get(bucket)!;
            return {
              bucket,
              count: items.length,
              total_balance: items.reduce((sum, inv) => sum + (inv.Balance || 0), 0)
            };
          });
        }

        if (params.group_by === "customer" || params.group_by === "both") {
          output.by_customer = Array.from(byCustomer.entries())
            .map(([customer, items]) => ({
              customer,
              count: items.length,
              total_balance: items.reduce((sum, inv) => sum + (inv.Balance || 0), 0)
            }))
            .sort((a, b) => b.total_balance - a.total_balance);
        }

        if (params.include_details) {
          output.invoices = invoices
            .sort((a, b) => (b.Balance || 0) - (a.Balance || 0))
            .map(inv => ({
              document_number: inv.DocumentNumber,
              customer_number: inv.CustomerNumber,
              customer_name: inv.CustomerName || null,
              invoice_date: inv.InvoiceDate || null,
              due_date: inv.DueDate || null,
              total: inv.Total || 0,
              balance: inv.Balance || 0,
              age_bucket: getAgeBucket(inv.DueDate)
            }));
        }

        // Format output
        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          const lines: string[] = [
            "# Unpaid Invoices Report",
            ""
          ];

          if (result.truncated) {
            lines.push(`⚠️ **Note**: ${result.truncationReason}`);
            lines.push("");
          }

          lines.push("## Summary");
          lines.push("");
          lines.push(`| Metric | Value |`);
          lines.push(`|--------|-------|`);
          lines.push(`| Unpaid Invoices | ${invoices.length} |`);
          lines.push(`| Total Invoice Amount | ${formatMoney(totalInvoiceAmount)} |`);
          lines.push(`| **Total Unpaid Balance** | **${formatMoney(totalUnpaid)}** |`);
          lines.push(`| Unique Customers | ${byCustomer.size} |`);

          if (params.group_by === "age_bucket" || params.group_by === "both") {
            lines.push("");
            lines.push("## Aging Breakdown");
            lines.push("");
            lines.push("| Age Bucket | Count | Balance |");
            lines.push("|------------|-------|---------|");

            for (const bucket of ageBucketOrder) {
              const items = byAgeBucket.get(bucket)!;
              const balance = items.reduce((sum, inv) => sum + (inv.Balance || 0), 0);
              if (items.length > 0) {
                lines.push(`| ${bucket} | ${items.length} | ${formatMoney(balance)} |`);
              }
            }
          }

          if (params.group_by === "customer" || params.group_by === "both") {
            lines.push("");
            lines.push("## By Customer");
            lines.push("");
            lines.push("| Customer | Invoices | Balance |");
            lines.push("|----------|----------|---------|");

            const customerEntries = Array.from(byCustomer.entries())
              .map(([customer, items]) => ({
                customer,
                count: items.length,
                balance: items.reduce((sum, inv) => sum + (inv.Balance || 0), 0)
              }))
              .sort((a, b) => b.balance - a.balance)
              .slice(0, 20); // Limit to top 20 in markdown

            for (const entry of customerEntries) {
              lines.push(`| ${entry.customer} | ${entry.count} | ${formatMoney(entry.balance)} |`);
            }

            if (byCustomer.size > 20) {
              lines.push(`| ... and ${byCustomer.size - 20} more | | |`);
            }
          }

          if (params.include_details && invoices.length > 0) {
            lines.push("");
            lines.push("## Invoice Details");
            lines.push("");
            lines.push("| Invoice | Customer | Due Date | Balance | Age |");
            lines.push("|---------|----------|----------|---------|-----|");

            const displayInvoices = invoices
              .sort((a, b) => (b.Balance || 0) - (a.Balance || 0))
              .slice(0, 50); // Limit to top 50 in markdown

            for (const inv of displayInvoices) {
              const bucket = getAgeBucket(inv.DueDate);
              lines.push(
                `| #${inv.DocumentNumber} ` +
                `| ${inv.CustomerName || inv.CustomerNumber} ` +
                `| ${inv.DueDate || "-"} ` +
                `| ${formatMoney(inv.Balance)} ` +
                `| ${bucket} |`
              );
            }

            if (invoices.length > 50) {
              lines.push(`| ... and ${invoices.length - 50} more | | | | |`);
            }
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
