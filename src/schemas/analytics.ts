import { z } from "zod";
import { ResponseFormat } from "../constants.js";
import { DatePeriodEnum } from "./invoices.js";

/**
 * Schema for invoice summary analytics tool
 */
export const InvoiceSummarySchema = z.object({
  period: DatePeriodEnum
    .optional()
    .describe("Date period to analyze (e.g., 'this_month', 'last_quarter'). If not specified, analyzes all invoices."),
  from_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("Start date for analysis (YYYY-MM-DD). Ignored if period is specified."),
  to_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("End date for analysis (YYYY-MM-DD). Ignored if period is specified."),
  filter: z.enum([
    "cancelled",
    "fullypaid",
    "unpaid",
    "unpaidoverdue",
    "unbooked"
  ])
    .optional()
    .describe("Filter invoices by status before calculating summary"),
  customer_number: z.string()
    .max(50)
    .optional()
    .describe("Filter by specific customer number"),
  group_by: z.enum(["customer", "month", "status"])
    .optional()
    .describe("Group summary statistics by this dimension"),
  include_details: z.boolean()
    .default(false)
    .describe("Include list of individual invoices in the response"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type InvoiceSummaryInput = z.infer<typeof InvoiceSummarySchema>;

/**
 * Schema for top customers analytics tool
 */
export const TopCustomersSchema = z.object({
  metric: z.enum(["total_amount", "invoice_count", "unpaid_amount", "average_invoice"])
    .default("total_amount")
    .describe("Metric to rank customers by"),
  period: DatePeriodEnum
    .optional()
    .describe("Date period to analyze (e.g., 'this_year', 'last_month')"),
  from_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("Start date for analysis (YYYY-MM-DD). Ignored if period is specified."),
  to_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("End date for analysis (YYYY-MM-DD). Ignored if period is specified."),
  top_n: z.number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("Number of top customers to return (1-50)"),
  include_details: z.boolean()
    .default(false)
    .describe("Include invoice breakdown for each customer"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type TopCustomersInput = z.infer<typeof TopCustomersSchema>;

/**
 * Schema for unpaid invoices report tool
 */
export const UnpaidReportSchema = z.object({
  min_amount: z.number()
    .min(0)
    .optional()
    .describe("Only include invoices with balance >= this amount"),
  customer_number: z.string()
    .max(50)
    .optional()
    .describe("Filter by specific customer number"),
  group_by: z.enum(["customer", "age_bucket", "both"])
    .default("both")
    .describe("How to group unpaid invoices in the report"),
  include_details: z.boolean()
    .default(true)
    .describe("Include list of individual unpaid invoices"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type UnpaidReportInput = z.infer<typeof UnpaidReportSchema>;
