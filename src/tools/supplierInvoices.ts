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
import {
  periodToDateRange,
  getPeriodDescription,
  getAgeBucket,
  type AgeBucket
} from "../services/dateHelpers.js";
import {
  ListSupplierInvoicesSchema,
  GetSupplierInvoiceSchema,
  ApproveSupplierInvoiceSchema,
  PayablesReportSchema,
  type ListSupplierInvoicesInput,
  type GetSupplierInvoiceInput,
  type ApproveSupplierInvoiceInput,
  type PayablesReportInput
} from "../schemas/supplierInvoices.js";

// API response types
interface FortnoxSupplierInvoiceRow {
  ArticleNumber?: string;
  Account?: number;
  Code?: string;
  AccountDescription?: string;
  Debit?: number;
  Credit?: number;
  Total?: number;
  Project?: string;
  CostCenter?: string;
}

interface FortnoxSupplierInvoice {
  GivenNumber: string;
  SupplierNumber: string;
  SupplierName?: string;
  InvoiceNumber?: string;
  InvoiceDate?: string;
  DueDate?: string;
  Total?: number;
  Balance?: number;
  Currency?: string;
  Booked?: boolean;
  Cancelled?: boolean;
  Credit?: boolean;
  PaymentPending?: boolean;
  OCR?: string;
  Comments?: string;
  SupplierInvoiceRows?: FortnoxSupplierInvoiceRow[];
  "@url"?: string;
}

interface FortnoxSupplierInvoiceListItem {
  GivenNumber: string;
  SupplierNumber: string;
  SupplierName?: string;
  InvoiceNumber?: string;
  InvoiceDate?: string;
  DueDate?: string;
  Total?: number;
  Balance?: number;
  Currency?: string;
  Booked?: boolean;
  Cancelled?: boolean;
  "@url"?: string;
}

interface SupplierInvoiceListResponse {
  SupplierInvoices: FortnoxSupplierInvoiceListItem[];
  MetaInformation?: {
    "@TotalResources": number;
    "@TotalPages": number;
    "@CurrentPage": number;
  };
}

interface SupplierInvoiceResponse {
  SupplierInvoice: FortnoxSupplierInvoice;
}

/**
 * Get supplier invoice status
 */
function getSupplierInvoiceStatus(inv: FortnoxSupplierInvoiceListItem): string {
  if (inv.Cancelled) return "cancelled";
  if ((inv.Balance || 0) === 0) return "paid";
  if (!inv.Booked) return "draft";
  return "unpaid";
}

/**
 * Register all supplier invoice-related tools
 */
export function registerSupplierInvoiceTools(server: McpServer): void {
  // List supplier invoices
  server.registerTool(
    "fortnox_list_supplier_invoices",
    {
      title: "List Fortnox Supplier Invoices",
      description: `List supplier invoices (accounts payable) from Fortnox.

Retrieves a paginated list of supplier invoices with optional filtering by status, supplier, date range, or amount.

Args:
  - limit (number): Max results per page, 1-100 (default: 20)
  - page (number): Page number for pagination (default: 1)
  - filter ('cancelled' | 'fullypaid' | 'unpaid' | 'unpaidoverdue' | 'unbooked' | 'pendingpayment'): Filter by invoice status
  - supplier_number (string): Filter by supplier number
  - from_date (string): Filter invoices from this date (YYYY-MM-DD)
  - to_date (string): Filter invoices to this date (YYYY-MM-DD)
  - period ('today' | 'yesterday' | ... | 'last_year'): Convenience date period, overrides from_date/to_date
  - from_final_pay_date (string): Filter by due date from (YYYY-MM-DD)
  - to_final_pay_date (string): Filter by due date to (YYYY-MM-DD)
  - sortby ('suppliername' | 'suppliernumber' | 'invoicenumber' | 'invoicedate' | 'total'): Field to sort by
  - sortorder ('ascending' | 'descending'): Sort order (default: ascending)
  - fetch_all (boolean): Fetch all results by auto-paginating (max 10,000 results)
  - min_amount (number): Filter invoices >= this amount (client-side)
  - max_amount (number): Filter invoices <= this amount (client-side)
  - response_format ('markdown' | 'json'): Output format

Returns:
  List of supplier invoices with supplier, dates, amounts, and status.

Examples:
  - List unpaid supplier invoices: filter="unpaid"
  - Last month's supplier invoices: period="last_month"
  - Supplier invoices this year: supplier_number="1", period="this_year"`,
      inputSchema: ListSupplierInvoicesSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: ListSupplierInvoicesInput) => {
      try {
        // Build query params
        const queryParams: Record<string, string | number | boolean | undefined> = {};

        if (params.filter) queryParams.filter = params.filter;
        if (params.supplier_number) queryParams.suppliernumber = params.supplier_number;

        // Handle period convenience filter (overrides explicit dates)
        if (params.period) {
          const dateRange = periodToDateRange(params.period);
          queryParams.fromdate = dateRange.from_date;
          queryParams.todate = dateRange.to_date;
        } else {
          if (params.from_date) queryParams.fromdate = params.from_date;
          if (params.to_date) queryParams.todate = params.to_date;
        }

        if (params.from_final_pay_date) queryParams.fromfinalpaydate = params.from_final_pay_date;
        if (params.to_final_pay_date) queryParams.tofinalpaydate = params.to_final_pay_date;

        // Handle sorting
        if (params.sortby) queryParams.sortby = params.sortby;
        if (params.sortorder) queryParams.sortorder = params.sortorder;

        let invoices: FortnoxSupplierInvoiceListItem[];
        let total: number;
        let pagesFetched = 1;
        let truncated = false;
        let truncationReason: string | undefined;

        if (params.fetch_all) {
          // Use fetchAllPages for complete dataset
          const result = await fetchAllPages<FortnoxSupplierInvoiceListItem, SupplierInvoiceListResponse>(
            "/3/supplierinvoices",
            queryParams,
            (r) => r.SupplierInvoices || [],
            (r) => r.MetaInformation?.["@TotalResources"] || 0
          );
          invoices = result.items;
          total = result.total;
          pagesFetched = result.pagesFetched;
          truncated = result.truncated;
          truncationReason = result.truncationReason;
        } else {
          // Single page request
          queryParams.limit = params.limit;
          queryParams.page = params.page;

          const response = await fortnoxRequest<SupplierInvoiceListResponse>("/3/supplierinvoices", "GET", undefined, queryParams);
          invoices = response.SupplierInvoices || [];
          total = response.MetaInformation?.["@TotalResources"] || invoices.length;
        }

        // Apply client-side amount filters
        if (params.min_amount !== undefined) {
          invoices = invoices.filter(inv => (inv.Total || 0) >= params.min_amount!);
        }
        if (params.max_amount !== undefined) {
          invoices = invoices.filter(inv => (inv.Total || 0) <= params.max_amount!);
        }

        // Build pagination metadata
        const paginationMeta = params.fetch_all
          ? {
              total,
              count: invoices.length,
              fetched_all: true,
              pages_fetched: pagesFetched,
              truncated,
              truncation_reason: truncationReason
            }
          : {
              ...buildPaginationMeta(total, params.page, params.limit, invoices.length),
              next_offset: params.page * params.limit < total ? params.page * params.limit : undefined
            };

        const output = {
          ...paginationMeta,
          period_description: params.period ? getPeriodDescription(params.period) : undefined,
          invoices: invoices.map((inv) => ({
            given_number: inv.GivenNumber,
            supplier_number: inv.SupplierNumber,
            supplier_name: inv.SupplierName || null,
            invoice_number: inv.InvoiceNumber || null,
            invoice_date: inv.InvoiceDate || null,
            due_date: inv.DueDate || null,
            total: inv.Total || 0,
            balance: inv.Balance || 0,
            currency: inv.Currency || "SEK",
            booked: inv.Booked ?? false,
            cancelled: inv.Cancelled ?? false,
            status: getSupplierInvoiceStatus(inv)
          }))
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          const title = params.period
            ? `Supplier Invoices - ${getPeriodDescription(params.period)}`
            : "Supplier Invoices";

          if (params.fetch_all) {
            const lines: string[] = [
              `# ${title}`,
              "",
              `Showing ${invoices.length} of ${total} total supplier invoices`,
              `(${pagesFetched} pages fetched)`
            ];

            if (truncated) {
              lines.push("");
              lines.push(`**Results truncated**: ${truncationReason}`);
            }

            lines.push("");

            for (const inv of invoices) {
              const status = getSupplierInvoiceStatus(inv);
              lines.push(`## Supplier Invoice #${inv.GivenNumber}`);
              lines.push(`- **Supplier**: ${inv.SupplierName || inv.SupplierNumber}`);
              lines.push(`- **Invoice Number**: ${inv.InvoiceNumber || "-"}`);
              lines.push(`- **Date**: ${formatDisplayDate(inv.InvoiceDate)} | **Due**: ${formatDisplayDate(inv.DueDate)}`);
              lines.push(`- **Total**: ${formatMoney(inv.Total, inv.Currency)} | **Balance**: ${formatMoney(inv.Balance, inv.Currency)}`);
              lines.push(`- **Status**: ${status.toUpperCase()}`);
              lines.push("");
            }

            textContent = lines.join("\n");
          } else {
            textContent = formatListMarkdown(
              title,
              invoices,
              total,
              params.page,
              params.limit,
              (inv) => {
                const status = getSupplierInvoiceStatus(inv);
                return `## Supplier Invoice #${inv.GivenNumber}\n` +
                  `- **Supplier**: ${inv.SupplierName || inv.SupplierNumber}\n` +
                  `- **Invoice Number**: ${inv.InvoiceNumber || "-"}\n` +
                  `- **Date**: ${formatDisplayDate(inv.InvoiceDate)} | **Due**: ${formatDisplayDate(inv.DueDate)}\n` +
                  `- **Total**: ${formatMoney(inv.Total, inv.Currency)} | **Balance**: ${formatMoney(inv.Balance, inv.Currency)}\n` +
                  `- **Status**: ${status.toUpperCase()}`;
              }
            );
          }
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );

  // Get single supplier invoice
  server.registerTool(
    "fortnox_get_supplier_invoice",
    {
      title: "Get Fortnox Supplier Invoice",
      description: `Retrieve detailed information about a specific supplier invoice including all line items.

Args:
  - given_number (string): The supplier invoice given number to retrieve (required)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Complete supplier invoice details including supplier info, dates, amounts, line items, and payment status.`,
      inputSchema: GetSupplierInvoiceSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: GetSupplierInvoiceInput) => {
      try {
        const response = await fortnoxRequest<SupplierInvoiceResponse>(
          `/3/supplierinvoices/${encodeURIComponent(params.given_number)}`
        );
        const invoice = response.SupplierInvoice;

        const output = {
          given_number: invoice.GivenNumber,
          supplier_number: invoice.SupplierNumber,
          supplier_name: invoice.SupplierName || null,
          invoice_number: invoice.InvoiceNumber || null,
          invoice_date: invoice.InvoiceDate || null,
          due_date: invoice.DueDate || null,
          total: invoice.Total || 0,
          balance: invoice.Balance || 0,
          currency: invoice.Currency || "SEK",
          ocr: invoice.OCR || null,
          booked: invoice.Booked ?? false,
          cancelled: invoice.Cancelled ?? false,
          credit: invoice.Credit ?? false,
          payment_pending: invoice.PaymentPending ?? false,
          comments: invoice.Comments || null,
          rows: (invoice.SupplierInvoiceRows || []).map((row) => ({
            article_number: row.ArticleNumber || null,
            account: row.Account || null,
            account_description: row.AccountDescription || null,
            debit: row.Debit || 0,
            credit: row.Credit || 0,
            total: row.Total || 0,
            project: row.Project || null,
            cost_center: row.CostCenter || null
          }))
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          const status = invoice.Cancelled ? "CANCELLED" :
            (invoice.Balance === 0 ? "PAID" :
              (invoice.Booked ? "BOOKED" : "DRAFT"));

          const lines = [
            `# Supplier Invoice #${invoice.GivenNumber}`,
            "",
            `**Status**: ${status}${invoice.PaymentPending ? " (Payment Pending)" : ""}`,
            "",
            "## Supplier",
            `- **Number**: ${invoice.SupplierNumber}`,
            `- **Name**: ${invoice.SupplierName || "-"}`,
            "",
            "## Invoice Details",
            `- **Invoice Number**: ${invoice.InvoiceNumber || "-"}`,
            `- **Invoice Date**: ${formatDisplayDate(invoice.InvoiceDate)}`,
            `- **Due Date**: ${formatDisplayDate(invoice.DueDate)}`,
            `- **OCR**: ${invoice.OCR || "-"}`,
            "",
            "## Amounts",
            `- **Total**: ${formatMoney(invoice.Total, invoice.Currency)}`,
            `- **Balance**: ${formatMoney(invoice.Balance, invoice.Currency)}`,
            ""
          ];

          if (invoice.SupplierInvoiceRows && invoice.SupplierInvoiceRows.length > 0) {
            lines.push("## Line Items", "");
            lines.push("| Account | Description | Debit | Credit |");
            lines.push("|---------|-------------|-------|--------|");
            for (const row of invoice.SupplierInvoiceRows) {
              lines.push(
                `| ${row.Account || "-"} | ${row.AccountDescription || "-"} | ${formatMoney(row.Debit)} | ${formatMoney(row.Credit)} |`
              );
            }
          }

          if (invoice.Comments) {
            lines.push("", "## Comments", invoice.Comments);
          }

          textContent = lines.join("\n");
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );

  // Approve supplier invoice for payment
  server.registerTool(
    "fortnox_approve_supplier_invoice",
    {
      title: "Approve Supplier Invoice for Payment",
      description: `Approve a supplier invoice for payment.

This approves the invoice and marks it ready for payment processing.

Args:
  - given_number (string): The supplier invoice given number to approve (required)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Confirmation that the invoice has been approved for payment.`,
      inputSchema: ApproveSupplierInvoiceSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: ApproveSupplierInvoiceInput) => {
      try {
        const response = await fortnoxRequest<SupplierInvoiceResponse>(
          `/3/supplierinvoices/${encodeURIComponent(params.given_number)}/approvalpayment`,
          "PUT"
        );
        const invoice = response.SupplierInvoice;

        const output = {
          success: true,
          message: `Supplier invoice #${invoice.GivenNumber} has been approved for payment`,
          given_number: invoice.GivenNumber,
          supplier_name: invoice.SupplierName || null,
          total: invoice.Total || 0,
          payment_pending: true
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          textContent = `# Supplier Invoice Approved\n\n` +
            `Supplier invoice **#${invoice.GivenNumber}** has been approved for payment.\n\n` +
            `**Supplier**: ${invoice.SupplierName || invoice.SupplierNumber}\n` +
            `**Total**: ${formatMoney(invoice.Total, invoice.Currency)}\n\n` +
            `The invoice is now marked as pending payment.`;
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );

  // Payables aging report
  server.registerTool(
    "fortnox_payables_report",
    {
      title: "Accounts Payable Aging Report",
      description: `Generate an accounts payable aging report for unpaid supplier invoices.

Answers questions like:
- "What supplier invoices are overdue?"
- "How much do we owe each supplier?"
- "Show me aging breakdown of payables"
- "Which supplier invoices over 10,000 SEK are unpaid?"

Args:
  - min_amount (number): Only include invoices >= this amount
  - supplier_number (string): Filter by specific supplier
  - group_by ('supplier' | 'age_bucket' | 'both'): How to group report (default: both)
  - include_details (boolean): Include individual invoice list (default: true)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Aging report with summary, breakdowns by supplier and age bucket.

Age Buckets:
  - not_due: Due date is in the future
  - 1-30 days: Overdue 1-30 days
  - 31-60 days: Overdue 31-60 days
  - 61-90 days: Overdue 61-90 days
  - 90+ days: Overdue more than 90 days

Examples:
  - Full payables report: (use defaults)
  - Large unpaid invoices: min_amount=50000
  - Specific supplier: supplier_number="1"`,
      inputSchema: PayablesReportSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: PayablesReportInput) => {
      try {
        // Build query params - fetch unpaid invoices
        const queryParams: Record<string, string | number | boolean | undefined> = {
          filter: "unpaid"
        };

        if (params.supplier_number) queryParams.suppliernumber = params.supplier_number;

        const result = await fetchAllPages<FortnoxSupplierInvoiceListItem, SupplierInvoiceListResponse>(
          "/3/supplierinvoices",
          queryParams,
          (r) => r.SupplierInvoices || [],
          (r) => r.MetaInformation?.["@TotalResources"] || 0
        );

        let invoices = result.items;

        // Apply min_amount filter
        if (params.min_amount !== undefined) {
          invoices = invoices.filter(inv => (inv.Balance || 0) >= params.min_amount!);
        }

        // Calculate overall summary
        const totalPayable = invoices.reduce((sum, inv) => sum + (inv.Balance || 0), 0);
        const totalInvoiceAmount = invoices.reduce((sum, inv) => sum + (inv.Total || 0), 0);

        // Group by age bucket
        const byAgeBucket = new Map<AgeBucket, FortnoxSupplierInvoiceListItem[]>();
        const ageBucketOrder: AgeBucket[] = ["not_due", "1-30 days", "31-60 days", "61-90 days", "90+ days"];

        for (const bucket of ageBucketOrder) {
          byAgeBucket.set(bucket, []);
        }

        for (const inv of invoices) {
          const bucket = getAgeBucket(inv.DueDate);
          byAgeBucket.get(bucket)!.push(inv);
        }

        // Group by supplier
        const bySupplier = new Map<string, FortnoxSupplierInvoiceListItem[]>();

        for (const inv of invoices) {
          const key = inv.SupplierName || inv.SupplierNumber || "unknown";
          if (!bySupplier.has(key)) {
            bySupplier.set(key, []);
          }
          bySupplier.get(key)!.push(inv);
        }

        // Build output
        const output: Record<string, unknown> = {
          summary: {
            total_invoices: invoices.length,
            total_invoice_amount: totalInvoiceAmount,
            total_payable_balance: totalPayable,
            unique_suppliers: bySupplier.size
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

        if (params.group_by === "supplier" || params.group_by === "both") {
          output.by_supplier = Array.from(bySupplier.entries())
            .map(([supplier, items]) => ({
              supplier,
              count: items.length,
              total_balance: items.reduce((sum, inv) => sum + (inv.Balance || 0), 0)
            }))
            .sort((a, b) => b.total_balance - a.total_balance);
        }

        if (params.include_details) {
          output.invoices = invoices
            .sort((a, b) => (b.Balance || 0) - (a.Balance || 0))
            .map(inv => ({
              given_number: inv.GivenNumber,
              supplier_number: inv.SupplierNumber,
              supplier_name: inv.SupplierName || null,
              invoice_number: inv.InvoiceNumber || null,
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
            "# Payables Aging Report (Accounts Payable)",
            ""
          ];

          if (result.truncated) {
            lines.push(`**Note**: ${result.truncationReason}`);
            lines.push("");
          }

          lines.push("## Summary");
          lines.push("");
          lines.push(`| Metric | Value |`);
          lines.push(`|--------|-------|`);
          lines.push(`| Unpaid Invoices | ${invoices.length} |`);
          lines.push(`| Total Invoice Amount | ${formatMoney(totalInvoiceAmount)} |`);
          lines.push(`| **Total Payable** | **${formatMoney(totalPayable)}** |`);
          lines.push(`| Unique Suppliers | ${bySupplier.size} |`);

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

          if (params.group_by === "supplier" || params.group_by === "both") {
            lines.push("");
            lines.push("## By Supplier");
            lines.push("");
            lines.push("| Supplier | Invoices | Balance |");
            lines.push("|----------|----------|---------|");

            const supplierEntries = Array.from(bySupplier.entries())
              .map(([supplier, items]) => ({
                supplier,
                count: items.length,
                balance: items.reduce((sum, inv) => sum + (inv.Balance || 0), 0)
              }))
              .sort((a, b) => b.balance - a.balance)
              .slice(0, 20); // Limit to top 20 in markdown

            for (const entry of supplierEntries) {
              lines.push(`| ${entry.supplier} | ${entry.count} | ${formatMoney(entry.balance)} |`);
            }

            if (bySupplier.size > 20) {
              lines.push(`| ... and ${bySupplier.size - 20} more | | |`);
            }
          }

          if (params.include_details && invoices.length > 0) {
            lines.push("");
            lines.push("## Invoice Details");
            lines.push("");
            lines.push("| Invoice | Supplier | Due Date | Balance | Age |");
            lines.push("|---------|----------|----------|---------|-----|");

            const displayInvoices = invoices
              .sort((a, b) => (b.Balance || 0) - (a.Balance || 0))
              .slice(0, 50); // Limit to top 50 in markdown

            for (const inv of displayInvoices) {
              const bucket = getAgeBucket(inv.DueDate);
              lines.push(
                `| #${inv.GivenNumber} ` +
                `| ${inv.SupplierName || inv.SupplierNumber} ` +
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
