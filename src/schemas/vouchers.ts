import { z } from "zod";
import { ResponseFormat, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants.js";
import { DatePeriodEnum } from "./invoices.js";

/**
 * Voucher row schema for creating vouchers
 */
export const VoucherRowSchema = z.object({
  account_number: z.number()
    .int()
    .min(1000)
    .max(9999)
    .describe("Account number (1000-9999, required)"),
  debit: z.number()
    .min(0)
    .optional()
    .describe("Debit amount (use either debit or credit, not both)"),
  credit: z.number()
    .min(0)
    .optional()
    .describe("Credit amount (use either debit or credit, not both)"),
  description: z.string()
    .max(200)
    .optional()
    .describe("Description for this row"),
  cost_center: z.string()
    .max(20)
    .optional()
    .describe("Cost center code"),
  project: z.string()
    .max(20)
    .optional()
    .describe("Project code")
}).strict().refine(
  (data) => (data.debit !== undefined && data.debit > 0) || (data.credit !== undefined && data.credit > 0),
  { message: "Each row must have either a debit or credit amount greater than 0" }
);

export type VoucherRowInput = z.infer<typeof VoucherRowSchema>;

/**
 * Schema for listing vouchers
 */
export const ListVouchersSchema = z.object({
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
  voucher_series: z.string()
    .max(2)
    .optional()
    .describe("Filter by voucher series (e.g., 'A', 'B')"),
  financial_year: z.number()
    .int()
    .default(new Date().getFullYear())
    .describe("Financial year (e.g., 2025). Defaults to current year."),
  from_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("Filter vouchers from this date (YYYY-MM-DD)"),
  to_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("Filter vouchers to this date (YYYY-MM-DD)"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type ListVouchersInput = z.infer<typeof ListVouchersSchema>;

/**
 * Schema for getting a single voucher
 */
export const GetVoucherSchema = z.object({
  voucher_series: z.string()
    .min(1)
    .max(2)
    .describe("Voucher series (e.g., 'A')"),
  voucher_number: z.number()
    .int()
    .min(1)
    .describe("Voucher number within the series"),
  financial_year: z.number()
    .int()
    .optional()
    .describe("Financial year ID (defaults to current year)"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type GetVoucherInput = z.infer<typeof GetVoucherSchema>;

/**
 * Schema for creating a voucher
 */
export const CreateVoucherSchema = z.object({
  voucher_series: z.string()
    .min(1)
    .max(2)
    .describe("Voucher series (e.g., 'A', 'B') (required)"),
  description: z.string()
    .min(1)
    .max(200)
    .describe("Voucher description (required)"),
  transaction_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .describe("Transaction date (YYYY-MM-DD, required)"),
  rows: z.array(VoucherRowSchema)
    .min(2)
    .describe("Voucher rows (minimum 2 rows required, debit must equal credit)"),
  cost_center: z.string()
    .max(20)
    .optional()
    .describe("Default cost center for all rows"),
  project: z.string()
    .max(20)
    .optional()
    .describe("Default project for all rows"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type CreateVoucherInput = z.infer<typeof CreateVoucherSchema>;

/**
 * Schema for listing voucher series
 */
export const ListVoucherSeriesSchema = z.object({
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type ListVoucherSeriesInput = z.infer<typeof ListVoucherSeriesSchema>;

/**
 * Schema for account activity tool - filter vouchers by account number
 */
export const AccountActivitySchema = z.object({
  account_number: z.number()
    .int()
    .min(1000)
    .max(9999)
    .optional()
    .describe("Single account number to filter by (1000-9999)"),
  account_numbers: z.array(z.number().int().min(1000).max(9999))
    .max(20)
    .optional()
    .describe("Multiple account numbers to filter by (max 20)"),
  account_range: z.object({
    from: z.number().int().min(1000).max(9999),
    to: z.number().int().min(1000).max(9999)
  })
    .optional()
    .describe("Account number range (e.g., 3000-3999 for revenue accounts)"),
  financial_year: z.number()
    .int()
    .default(new Date().getFullYear())
    .describe("Financial year (e.g., 2025). Defaults to current year."),
  period: DatePeriodEnum
    .optional()
    .describe("Convenience date period filter (e.g., 'this_month', 'last_quarter'). Overrides from_date/to_date."),
  from_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("Filter vouchers from this date (YYYY-MM-DD)"),
  to_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("Filter vouchers to this date (YYYY-MM-DD)"),
  voucher_series: z.string()
    .max(2)
    .optional()
    .describe("Filter by voucher series (e.g., 'A', 'B')"),
  include_summary: z.boolean()
    .default(true)
    .describe("Include totals and summary per account"),
  max_vouchers: z.number()
    .int()
    .min(10)
    .max(500)
    .default(500)
    .describe("Maximum vouchers to scan (10-500). Use date filtering for larger datasets."),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict().refine(
  (data) => data.account_number !== undefined || data.account_numbers !== undefined || data.account_range !== undefined,
  { message: "Must specify at least one of: account_number, account_numbers, or account_range" }
);

export type AccountActivityInput = z.infer<typeof AccountActivitySchema>;

/**
 * Schema for voucher text search tool
 */
export const SearchVouchersSchema = z.object({
  search_text: z.string()
    .min(2)
    .max(100)
    .describe("Text to search for in voucher descriptions (min 2 chars)"),
  financial_year: z.number()
    .int()
    .default(new Date().getFullYear())
    .describe("Financial year (e.g., 2025). Defaults to current year."),
  period: DatePeriodEnum
    .optional()
    .describe("Convenience date period filter (e.g., 'this_month', 'last_quarter'). Overrides from_date/to_date."),
  from_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("Filter vouchers from this date (YYYY-MM-DD)"),
  to_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("Filter vouchers to this date (YYYY-MM-DD)"),
  voucher_series: z.string()
    .max(2)
    .optional()
    .describe("Filter by voucher series (e.g., 'A', 'B')"),
  case_sensitive: z.boolean()
    .default(false)
    .describe("Whether search should be case-sensitive"),
  include_rows: z.boolean()
    .default(false)
    .describe("Include full voucher row details in results"),
  max_vouchers: z.number()
    .int()
    .min(10)
    .max(500)
    .default(500)
    .describe("Maximum vouchers to scan (10-500). Use date filtering for larger datasets."),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type SearchVouchersInput = z.infer<typeof SearchVouchersSchema>;
