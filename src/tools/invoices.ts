import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fortnoxRequest } from "../services/api.js";
import { ResponseFormat } from "../constants.js";
import {
  buildToolResponse,
  buildErrorResponse,
  formatMoney,
  formatDisplayDate,
  formatBoolean,
  formatListMarkdown,
  formatDetailMarkdown,
  buildPaginationMeta
} from "../services/formatters.js";
import {
  ListInvoicesSchema,
  GetInvoiceSchema,
  CreateInvoiceSchema,
  UpdateInvoiceSchema,
  InvoiceActionSchema,
  SendInvoiceEmailSchema,
  type ListInvoicesInput,
  type GetInvoiceInput,
  type CreateInvoiceInput,
  type UpdateInvoiceInput,
  type InvoiceActionInput,
  type SendInvoiceEmailInput
} from "../schemas/invoices.js";

// API response types
interface FortnoxInvoiceRow {
  ArticleNumber?: string;
  Description?: string;
  DeliveredQuantity?: number;
  Unit?: string;
  Price?: number;
  Discount?: number;
  Total?: number;
  VAT?: number;
  AccountNumber?: number;
}

interface FortnoxInvoice {
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
  Sent?: boolean;
  OCR?: string;
  OurReference?: string;
  YourReference?: string;
  Comments?: string;
  Remarks?: string;
  InvoiceRows?: FortnoxInvoiceRow[];
  "@url"?: string;
}

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
  "@url"?: string;
}

interface InvoiceListResponse {
  Invoices: FortnoxInvoiceListItem[];
  MetaInformation?: {
    "@TotalResources": number;
    "@TotalPages": number;
    "@CurrentPage": number;
  };
}

interface InvoiceResponse {
  Invoice: FortnoxInvoice;
}

/**
 * Register all invoice-related tools
 */
export function registerInvoiceTools(server: McpServer): void {
  // List invoices
  server.registerTool(
    "fortnox_list_invoices",
    {
      title: "List Fortnox Invoices",
      description: `List invoices from Fortnox accounting system.

Retrieves a paginated list of invoices with optional filtering by status, customer, or date range.

Args:
  - limit (number): Max results per page, 1-100 (default: 20)
  - page (number): Page number for pagination (default: 1)
  - filter ('cancelled' | 'fullypaid' | 'unpaid' | 'unpaidoverdue' | 'unbooked'): Filter by invoice status
  - customer_number (string): Filter by customer number
  - from_date (string): Filter invoices from this date (YYYY-MM-DD)
  - to_date (string): Filter invoices to this date (YYYY-MM-DD)
  - from_final_pay_date (string): Filter by due date from (YYYY-MM-DD)
  - to_final_pay_date (string): Filter by due date to (YYYY-MM-DD)
  - response_format ('markdown' | 'json'): Output format

Returns:
  List of invoices with document number, customer, dates, amounts, and status.

Examples:
  - List unpaid invoices: filter="unpaid"
  - List overdue invoices: filter="unpaidoverdue"
  - Invoices for a customer: customer_number="1001"
  - Invoices this month: from_date="2025-01-01", to_date="2025-01-31"`,
      inputSchema: ListInvoicesSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: ListInvoicesInput) => {
      try {
        const queryParams: Record<string, string | number | boolean | undefined> = {
          limit: params.limit,
          page: params.page
        };

        if (params.filter) queryParams.filter = params.filter;
        if (params.customer_number) queryParams.customernumber = params.customer_number;
        if (params.from_date) queryParams.fromdate = params.from_date;
        if (params.to_date) queryParams.todate = params.to_date;
        if (params.from_final_pay_date) queryParams.fromfinalpaydate = params.from_final_pay_date;
        if (params.to_final_pay_date) queryParams.tofinalpaydate = params.to_final_pay_date;

        const response = await fortnoxRequest<InvoiceListResponse>("/3/invoices", "GET", undefined, queryParams);
        const invoices = response.Invoices || [];
        const total = response.MetaInformation?.["@TotalResources"] || invoices.length;

        const output = {
          ...buildPaginationMeta(total, params.page, params.limit, invoices.length),
          invoices: invoices.map((inv) => ({
            document_number: inv.DocumentNumber,
            customer_number: inv.CustomerNumber,
            customer_name: inv.CustomerName || null,
            invoice_date: inv.InvoiceDate || null,
            due_date: inv.DueDate || null,
            total: inv.Total || 0,
            balance: inv.Balance || 0,
            currency: inv.Currency || "SEK",
            booked: inv.Booked ?? false,
            cancelled: inv.Cancelled ?? false
          }))
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          textContent = formatListMarkdown(
            "Invoices",
            invoices,
            total,
            params.page,
            params.limit,
            (inv) => {
              const status = inv.Cancelled ? "CANCELLED" :
                (inv.Balance === 0 ? "PAID" :
                  (inv.Booked ? "BOOKED" : "DRAFT"));
              return `## Invoice #${inv.DocumentNumber}\n` +
                `- **Customer**: ${inv.CustomerName || inv.CustomerNumber}\n` +
                `- **Date**: ${formatDisplayDate(inv.InvoiceDate)} | **Due**: ${formatDisplayDate(inv.DueDate)}\n` +
                `- **Total**: ${formatMoney(inv.Total, inv.Currency)} | **Balance**: ${formatMoney(inv.Balance, inv.Currency)}\n` +
                `- **Status**: ${status}`;
            }
          );
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );

  // Get single invoice
  server.registerTool(
    "fortnox_get_invoice",
    {
      title: "Get Fortnox Invoice",
      description: `Retrieve detailed information about a specific invoice including all line items.

Args:
  - document_number (string): The invoice document number to retrieve (required)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Complete invoice details including customer info, dates, amounts, line items, and payment status.`,
      inputSchema: GetInvoiceSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: GetInvoiceInput) => {
      try {
        const response = await fortnoxRequest<InvoiceResponse>(
          `/3/invoices/${encodeURIComponent(params.document_number)}`
        );
        const invoice = response.Invoice;

        const output = {
          document_number: invoice.DocumentNumber,
          customer_number: invoice.CustomerNumber,
          customer_name: invoice.CustomerName || null,
          invoice_date: invoice.InvoiceDate || null,
          due_date: invoice.DueDate || null,
          total: invoice.Total || 0,
          balance: invoice.Balance || 0,
          currency: invoice.Currency || "SEK",
          ocr: invoice.OCR || null,
          our_reference: invoice.OurReference || null,
          your_reference: invoice.YourReference || null,
          booked: invoice.Booked ?? false,
          cancelled: invoice.Cancelled ?? false,
          sent: invoice.Sent ?? false,
          comments: invoice.Comments || null,
          remarks: invoice.Remarks || null,
          rows: (invoice.InvoiceRows || []).map((row) => ({
            article_number: row.ArticleNumber || null,
            description: row.Description || null,
            quantity: row.DeliveredQuantity || 0,
            unit: row.Unit || null,
            price: row.Price || 0,
            discount: row.Discount || 0,
            total: row.Total || 0,
            vat: row.VAT || 0,
            account_number: row.AccountNumber || null
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
            `# Invoice #${invoice.DocumentNumber}`,
            "",
            `**Status**: ${status}`,
            "",
            "## Customer",
            `- **Number**: ${invoice.CustomerNumber}`,
            `- **Name**: ${invoice.CustomerName || "-"}`,
            "",
            "## Dates & Payment",
            `- **Invoice Date**: ${formatDisplayDate(invoice.InvoiceDate)}`,
            `- **Due Date**: ${formatDisplayDate(invoice.DueDate)}`,
            `- **OCR**: ${invoice.OCR || "-"}`,
            "",
            "## Amounts",
            `- **Total**: ${formatMoney(invoice.Total, invoice.Currency)}`,
            `- **Balance**: ${formatMoney(invoice.Balance, invoice.Currency)}`,
            ""
          ];

          if (invoice.InvoiceRows && invoice.InvoiceRows.length > 0) {
            lines.push("## Line Items", "");
            lines.push("| Description | Qty | Price | Total |");
            lines.push("|-------------|-----|-------|-------|");
            for (const row of invoice.InvoiceRows) {
              lines.push(
                `| ${row.Description || row.ArticleNumber || "-"} | ${row.DeliveredQuantity || 1} | ${formatMoney(row.Price)} | ${formatMoney(row.Total)} |`
              );
            }
          }

          if (invoice.Remarks) {
            lines.push("", "## Remarks", invoice.Remarks);
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

  // Create invoice
  server.registerTool(
    "fortnox_create_invoice",
    {
      title: "Create Fortnox Invoice",
      description: `Create a new invoice in Fortnox.

Args:
  - customer_number (string): Customer number (required)
  - rows (array): Invoice line items (at least one required)
    - Each row: { description, quantity?, price?, article_number?, unit?, discount?, vat?, account_number? }
  - invoice_date (string): Invoice date YYYY-MM-DD (defaults to today)
  - due_date (string): Due date YYYY-MM-DD
  - our_reference (string): Our reference person
  - your_reference (string): Customer's reference
  - invoice_type ('INVOICE' | 'CASH' | 'CARD' | 'UNDEFINED'): Invoice type
  - currency (string): 3-letter currency code
  - terms_of_payment (string): Payment terms code
  - comments (string): Internal comments
  - remarks (string): Remarks printed on invoice
  - freight (number): Shipping cost
  - administration_fee (number): Admin fee
  - send_type ('EMAIL' | 'PRINT' | 'EINVOICE'): How to send

Returns:
  The created invoice with assigned document number.

Example rows:
  [{ "description": "Consulting services", "quantity": 10, "price": 1000 }]`,
      inputSchema: CreateInvoiceSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: CreateInvoiceInput) => {
      try {
        const invoiceData: Record<string, unknown> = {
          CustomerNumber: params.customer_number,
          InvoiceRows: params.rows.map((row) => {
            const invoiceRow: Record<string, unknown> = {};
            if (row.article_number) invoiceRow.ArticleNumber = row.article_number;
            if (row.description) invoiceRow.Description = row.description;
            if (row.quantity !== undefined) invoiceRow.DeliveredQuantity = row.quantity;
            if (row.unit) invoiceRow.Unit = row.unit;
            if (row.price !== undefined) invoiceRow.Price = row.price;
            if (row.discount !== undefined) invoiceRow.Discount = row.discount;
            if (row.account_number !== undefined) invoiceRow.AccountNumber = row.account_number;
            if (row.vat !== undefined) invoiceRow.VAT = row.vat;
            return invoiceRow;
          })
        };

        if (params.invoice_date) invoiceData.InvoiceDate = params.invoice_date;
        if (params.due_date) invoiceData.DueDate = params.due_date;
        if (params.our_reference) invoiceData.OurReference = params.our_reference;
        if (params.your_reference) invoiceData.YourReference = params.your_reference;
        if (params.invoice_type) invoiceData.InvoiceType = params.invoice_type;
        if (params.currency) invoiceData.Currency = params.currency;
        if (params.terms_of_payment) invoiceData.TermsOfPayment = params.terms_of_payment;
        if (params.comments) invoiceData.Comments = params.comments;
        if (params.remarks) invoiceData.Remarks = params.remarks;
        if (params.freight !== undefined) invoiceData.Freight = params.freight;
        if (params.administration_fee !== undefined) invoiceData.AdministrationFee = params.administration_fee;

        const response = await fortnoxRequest<InvoiceResponse>(
          "/3/invoices",
          "POST",
          { Invoice: invoiceData }
        );
        const invoice = response.Invoice;

        const output = {
          success: true,
          message: `Invoice #${invoice.DocumentNumber} created successfully`,
          document_number: invoice.DocumentNumber,
          customer_number: invoice.CustomerNumber,
          customer_name: invoice.CustomerName || null,
          total: invoice.Total || 0,
          currency: invoice.Currency || "SEK"
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          textContent = `# Invoice Created\n\n` +
            `**Document Number**: ${invoice.DocumentNumber}\n` +
            `**Customer**: ${invoice.CustomerName || invoice.CustomerNumber}\n` +
            `**Total**: ${formatMoney(invoice.Total, invoice.Currency)}\n\n` +
            `Invoice has been created as a draft. Use \`fortnox_bookkeep_invoice\` to bookkeep it.`;
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );

  // Update invoice
  server.registerTool(
    "fortnox_update_invoice",
    {
      title: "Update Fortnox Invoice",
      description: `Update an existing invoice in Fortnox. Only unbooked invoices can be updated.

Args:
  - document_number (string): Invoice document number to update (required)
  - rows (array): Updated line items (replaces all existing rows)
  - Other fields: Same as create_invoice

Returns:
  The updated invoice details.`,
      inputSchema: UpdateInvoiceSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: UpdateInvoiceInput) => {
      try {
        const invoiceData: Record<string, unknown> = {};

        if (params.rows) {
          invoiceData.InvoiceRows = params.rows.map((row) => {
            const invoiceRow: Record<string, unknown> = {};
            if (row.article_number) invoiceRow.ArticleNumber = row.article_number;
            if (row.description) invoiceRow.Description = row.description;
            if (row.quantity !== undefined) invoiceRow.DeliveredQuantity = row.quantity;
            if (row.unit) invoiceRow.Unit = row.unit;
            if (row.price !== undefined) invoiceRow.Price = row.price;
            if (row.discount !== undefined) invoiceRow.Discount = row.discount;
            if (row.account_number !== undefined) invoiceRow.AccountNumber = row.account_number;
            if (row.vat !== undefined) invoiceRow.VAT = row.vat;
            return invoiceRow;
          });
        }

        if (params.invoice_date) invoiceData.InvoiceDate = params.invoice_date;
        if (params.due_date) invoiceData.DueDate = params.due_date;
        if (params.our_reference) invoiceData.OurReference = params.our_reference;
        if (params.your_reference) invoiceData.YourReference = params.your_reference;
        if (params.comments) invoiceData.Comments = params.comments;
        if (params.remarks) invoiceData.Remarks = params.remarks;
        if (params.freight !== undefined) invoiceData.Freight = params.freight;
        if (params.administration_fee !== undefined) invoiceData.AdministrationFee = params.administration_fee;

        const response = await fortnoxRequest<InvoiceResponse>(
          `/3/invoices/${encodeURIComponent(params.document_number)}`,
          "PUT",
          { Invoice: invoiceData }
        );
        const invoice = response.Invoice;

        const output = {
          success: true,
          message: `Invoice #${invoice.DocumentNumber} updated successfully`,
          document_number: invoice.DocumentNumber,
          total: invoice.Total || 0
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          textContent = `# Invoice Updated\n\n` +
            `**Document Number**: ${invoice.DocumentNumber}\n` +
            `**Total**: ${formatMoney(invoice.Total, invoice.Currency)}\n\n` +
            `Invoice has been updated.`;
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );

  // Bookkeep invoice
  server.registerTool(
    "fortnox_bookkeep_invoice",
    {
      title: "Bookkeep Fortnox Invoice",
      description: `Bookkeep an invoice, creating the accounting entries. Once booked, the invoice cannot be edited.

Args:
  - document_number (string): Invoice document number to bookkeep (required)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Confirmation of bookkeeping with the created voucher reference.`,
      inputSchema: InvoiceActionSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: InvoiceActionInput) => {
      try {
        const response = await fortnoxRequest<InvoiceResponse>(
          `/3/invoices/${encodeURIComponent(params.document_number)}/bookkeep`,
          "PUT"
        );
        const invoice = response.Invoice;

        const output = {
          success: true,
          message: `Invoice #${invoice.DocumentNumber} has been booked`,
          document_number: invoice.DocumentNumber,
          booked: true
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          textContent = `# Invoice Booked\n\n` +
            `Invoice **#${invoice.DocumentNumber}** has been successfully booked.\n\n` +
            `Accounting entries have been created.`;
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );

  // Cancel invoice
  server.registerTool(
    "fortnox_cancel_invoice",
    {
      title: "Cancel Fortnox Invoice",
      description: `Cancel an invoice. Booked invoices will have reversal entries created.

Args:
  - document_number (string): Invoice document number to cancel (required)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Confirmation of cancellation.`,
      inputSchema: InvoiceActionSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: InvoiceActionInput) => {
      try {
        const response = await fortnoxRequest<InvoiceResponse>(
          `/3/invoices/${encodeURIComponent(params.document_number)}/cancel`,
          "PUT"
        );
        const invoice = response.Invoice;

        const output = {
          success: true,
          message: `Invoice #${invoice.DocumentNumber} has been cancelled`,
          document_number: invoice.DocumentNumber,
          cancelled: true
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          textContent = `# Invoice Cancelled\n\n` +
            `Invoice **#${invoice.DocumentNumber}** has been cancelled.`;
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );

  // Credit invoice
  server.registerTool(
    "fortnox_credit_invoice",
    {
      title: "Credit Fortnox Invoice",
      description: `Create a credit note for an invoice. This creates a new credit invoice referencing the original.

Args:
  - document_number (string): Invoice document number to credit (required)
  - response_format ('markdown' | 'json'): Output format

Returns:
  The created credit invoice details.`,
      inputSchema: InvoiceActionSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: InvoiceActionInput) => {
      try {
        const response = await fortnoxRequest<InvoiceResponse>(
          `/3/invoices/${encodeURIComponent(params.document_number)}/credit`,
          "PUT"
        );
        const creditInvoice = response.Invoice;

        const output = {
          success: true,
          message: `Credit invoice #${creditInvoice.DocumentNumber} created for invoice #${params.document_number}`,
          original_document_number: params.document_number,
          credit_document_number: creditInvoice.DocumentNumber,
          total: creditInvoice.Total || 0
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          textContent = `# Credit Invoice Created\n\n` +
            `**Credit Invoice**: #${creditInvoice.DocumentNumber}\n` +
            `**Original Invoice**: #${params.document_number}\n` +
            `**Total**: ${formatMoney(creditInvoice.Total, creditInvoice.Currency)}`;
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );

  // Send invoice by email
  server.registerTool(
    "fortnox_send_invoice_email",
    {
      title: "Send Fortnox Invoice by Email",
      description: `Send an invoice to the customer via email.

The invoice will be sent to the email address configured for the customer.

Args:
  - document_number (string): Invoice document number to send (required)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Confirmation that the email was sent.`,
      inputSchema: SendInvoiceEmailSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: SendInvoiceEmailInput) => {
      try {
        const response = await fortnoxRequest<InvoiceResponse>(
          `/3/invoices/${encodeURIComponent(params.document_number)}/email`,
          "PUT"
        );
        const invoice = response.Invoice;

        const output = {
          success: true,
          message: `Invoice #${invoice.DocumentNumber} sent by email`,
          document_number: invoice.DocumentNumber,
          sent: true
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          textContent = `# Invoice Sent\n\n` +
            `Invoice **#${invoice.DocumentNumber}** has been sent by email to the customer.`;
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );
}
