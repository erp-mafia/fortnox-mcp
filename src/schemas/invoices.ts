import { z } from "zod";
import { ResponseFormat, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants.js";

/**
 * Date period enum for convenience date filtering
 */
export const DatePeriodEnum = z.enum([
  "today",
  "yesterday",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "this_quarter",
  "last_quarter",
  "this_year",
  "last_year"
]);

export type DatePeriod = z.infer<typeof DatePeriodEnum>;

/**
 * Invoice row schema for creating/updating invoices
 */
export const InvoiceRowSchema = z.object({
  article_number: z.string()
    .max(50)
    .optional()
    .describe("Article number from article register"),
  description: z.string()
    .max(200)
    .describe("Description of the invoice row"),
  quantity: z.number()
    .optional()
    .describe("Quantity (default: 1)"),
  unit: z.string()
    .max(8)
    .optional()
    .describe("Unit code (e.g., 'st', 'h', 'kg')"),
  price: z.number()
    .optional()
    .describe("Unit price excluding VAT"),
  discount: z.number()
    .min(0)
    .max(100)
    .optional()
    .describe("Discount percentage (0-100)"),
  account_number: z.number()
    .int()
    .optional()
    .describe("Account number for bookkeeping"),
  vat: z.number()
    .optional()
    .describe("VAT percentage (e.g., 25, 12, 6, 0)")
}).strict();

export type InvoiceRowInput = z.infer<typeof InvoiceRowSchema>;

/**
 * Schema for listing invoices
 */
export const ListInvoicesSchema = z.object({
  limit: z.number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE)
    .describe("Maximum number of results to return (1-100)"),
  page: z.number()
    .int()
    .min(1)
    .default(1)
    .describe("Page number for pagination"),
  filter: z.enum([
    "cancelled",
    "fullypaid",
    "unpaid",
    "unpaidoverdue",
    "unbooked"
  ])
    .optional()
    .describe("Filter invoices by status"),
  customer_number: z.string()
    .max(50)
    .optional()
    .describe("Filter by customer number"),
  from_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("Filter invoices from this date (YYYY-MM-DD)"),
  to_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("Filter invoices to this date (YYYY-MM-DD)"),
  from_final_pay_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("Filter by due date from (YYYY-MM-DD)"),
  to_final_pay_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("Filter by due date to (YYYY-MM-DD)"),
  period: DatePeriodEnum
    .optional()
    .describe("Convenience date period filter (e.g., 'last_month', 'this_quarter'). Overrides from_date/to_date if provided."),
  sortby: z.enum(["customername", "customernumber", "documentnumber", "invoicedate", "total"])
    .optional()
    .describe("Field to sort results by"),
  sortorder: z.enum(["ascending", "descending"])
    .default("ascending")
    .describe("Sort order for results"),
  fetch_all: z.boolean()
    .default(false)
    .describe("Fetch all results by auto-paginating through all pages. WARNING: May take time for large datasets (max 10,000 results)."),
  min_amount: z.number()
    .min(0)
    .optional()
    .describe("Filter invoices with total >= this amount (client-side filter, applied after fetching)"),
  max_amount: z.number()
    .min(0)
    .optional()
    .describe("Filter invoices with total <= this amount (client-side filter, applied after fetching)"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type ListInvoicesInput = z.infer<typeof ListInvoicesSchema>;

/**
 * Schema for getting a single invoice
 */
export const GetInvoiceSchema = z.object({
  document_number: z.string()
    .min(1)
    .describe("The invoice document number to retrieve"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type GetInvoiceInput = z.infer<typeof GetInvoiceSchema>;

/**
 * Schema for creating an invoice
 */
export const CreateInvoiceSchema = z.object({
  customer_number: z.string()
    .min(1)
    .describe("Customer number (required)"),
  rows: z.array(InvoiceRowSchema)
    .min(1)
    .describe("Invoice rows/lines (at least one required)"),
  invoice_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("Invoice date (YYYY-MM-DD, defaults to today)"),
  due_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("Due date (YYYY-MM-DD)"),
  our_reference: z.string()
    .max(50)
    .optional()
    .describe("Our reference person"),
  your_reference: z.string()
    .max(50)
    .optional()
    .describe("Customer's reference person"),
  invoice_type: z.enum(["INVOICE", "CASH", "CARD", "UNDEFINED"])
    .optional()
    .describe("Type of invoice"),
  currency: z.string()
    .length(3)
    .optional()
    .describe("Currency code (e.g., 'SEK')"),
  terms_of_payment: z.string()
    .max(50)
    .optional()
    .describe("Payment terms code"),
  comments: z.string()
    .max(1024)
    .optional()
    .describe("Comments on the invoice"),
  remarks: z.string()
    .max(1024)
    .optional()
    .describe("Remarks printed on the invoice"),
  freight: z.number()
    .min(0)
    .optional()
    .describe("Freight/shipping cost"),
  administration_fee: z.number()
    .min(0)
    .optional()
    .describe("Administration fee"),
  send_type: z.enum(["EMAIL", "PRINT", "EINVOICE"])
    .optional()
    .describe("How to send the invoice"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type CreateInvoiceInput = z.infer<typeof CreateInvoiceSchema>;

/**
 * Schema for updating an invoice
 */
export const UpdateInvoiceSchema = z.object({
  document_number: z.string()
    .min(1)
    .describe("Invoice document number to update (required)"),
  rows: z.array(InvoiceRowSchema)
    .min(1)
    .optional()
    .describe("Updated invoice rows (replaces all existing rows)"),
  invoice_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("Invoice date (YYYY-MM-DD)"),
  due_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("Due date (YYYY-MM-DD)"),
  our_reference: z.string()
    .max(50)
    .optional()
    .describe("Our reference person"),
  your_reference: z.string()
    .max(50)
    .optional()
    .describe("Customer's reference person"),
  comments: z.string()
    .max(1024)
    .optional()
    .describe("Comments on the invoice"),
  remarks: z.string()
    .max(1024)
    .optional()
    .describe("Remarks printed on the invoice"),
  freight: z.number()
    .min(0)
    .optional()
    .describe("Freight/shipping cost"),
  administration_fee: z.number()
    .min(0)
    .optional()
    .describe("Administration fee"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type UpdateInvoiceInput = z.infer<typeof UpdateInvoiceSchema>;

/**
 * Schema for invoice actions (bookkeep, cancel, credit, email, etc.)
 */
export const InvoiceActionSchema = z.object({
  document_number: z.string()
    .min(1)
    .describe("Invoice document number"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type InvoiceActionInput = z.infer<typeof InvoiceActionSchema>;

/**
 * Schema for sending invoice by email
 */
export const SendInvoiceEmailSchema = z.object({
  document_number: z.string()
    .min(1)
    .describe("Invoice document number"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type SendInvoiceEmailInput = z.infer<typeof SendInvoiceEmailSchema>;
