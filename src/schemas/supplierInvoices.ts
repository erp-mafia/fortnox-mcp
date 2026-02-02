import { z } from "zod";
import { ResponseFormat, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants.js";
import { DatePeriodEnum } from "./invoices.js";

/**
 * Schema for listing supplier invoices
 */
export const ListSupplierInvoicesSchema = z.object({
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
    "unbooked",
    "pendingpayment"
  ])
    .optional()
    .describe("Filter supplier invoices by status"),
  supplier_number: z.string()
    .max(50)
    .optional()
    .describe("Filter by supplier number"),
  from_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("Filter invoices from this date (YYYY-MM-DD)"),
  to_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("Filter invoices to this date (YYYY-MM-DD)"),
  period: DatePeriodEnum
    .optional()
    .describe("Convenience date period filter (e.g., 'last_month', 'this_quarter'). Overrides from_date/to_date if provided."),
  from_final_pay_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("Filter by due date from (YYYY-MM-DD)"),
  to_final_pay_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("Filter by due date to (YYYY-MM-DD)"),
  sortby: z.enum(["suppliername", "suppliernumber", "invoicenumber", "invoicedate", "total"])
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
    .describe("Filter invoices with total >= this amount (client-side filter)"),
  max_amount: z.number()
    .min(0)
    .optional()
    .describe("Filter invoices with total <= this amount (client-side filter)"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type ListSupplierInvoicesInput = z.infer<typeof ListSupplierInvoicesSchema>;

/**
 * Schema for getting a single supplier invoice
 */
export const GetSupplierInvoiceSchema = z.object({
  given_number: z.string()
    .min(1)
    .describe("The supplier invoice given number to retrieve"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type GetSupplierInvoiceInput = z.infer<typeof GetSupplierInvoiceSchema>;

/**
 * Schema for approving a supplier invoice
 */
export const ApproveSupplierInvoiceSchema = z.object({
  given_number: z.string()
    .min(1)
    .describe("The supplier invoice given number to approve"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type ApproveSupplierInvoiceInput = z.infer<typeof ApproveSupplierInvoiceSchema>;

/**
 * Schema for payables aging report
 */
export const PayablesReportSchema = z.object({
  min_amount: z.number()
    .min(0)
    .optional()
    .describe("Only include invoices with balance >= this amount"),
  supplier_number: z.string()
    .max(50)
    .optional()
    .describe("Filter by specific supplier number"),
  group_by: z.enum(["supplier", "age_bucket", "both"])
    .default("both")
    .describe("How to group unpaid supplier invoices in the report"),
  include_details: z.boolean()
    .default(true)
    .describe("Include list of individual unpaid invoices"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type PayablesReportInput = z.infer<typeof PayablesReportSchema>;
