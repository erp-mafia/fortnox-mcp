import { z } from "zod";
import { ResponseFormat } from "../constants.js";
import { DatePeriodEnum } from "./invoices.js";

/**
 * Group by enum for time-based grouping
 */
export const TimeGroupByEnum = z.enum(["week", "month", "quarter"]);
export type TimeGroupBy = z.infer<typeof TimeGroupByEnum>;

/**
 * Schema for Cash Flow Forecast tool
 */
export const CashFlowForecastSchema = z.object({
  horizon_days: z.number()
    .int()
    .min(1)
    .max(365)
    .default(90)
    .describe("Number of days to forecast ahead (1-365, default: 90)"),
  group_by: z.enum(["week", "month"])
    .default("week")
    .describe("How to group the forecast: 'week' or 'month'"),
  include_overdue: z.boolean()
    .default(true)
    .describe("Include overdue receivables and payables in the forecast"),
  starting_balance: z.number()
    .optional()
    .describe("Optional starting cash balance to use for projection"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type CashFlowForecastInput = z.infer<typeof CashFlowForecastSchema>;

/**
 * Schema for Order Pipeline tool
 */
export const OrderPipelineSchema = z.object({
  period: DatePeriodEnum
    .optional()
    .describe("Date period to analyze (e.g., 'this_month', 'this_year')"),
  from_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("Start date for analysis (YYYY-MM-DD). Ignored if period is specified."),
  to_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("End date for analysis (YYYY-MM-DD). Ignored if period is specified."),
  group_by: z.enum(["customer", "month", "status"])
    .default("status")
    .describe("How to group order pipeline statistics"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type OrderPipelineInput = z.infer<typeof OrderPipelineSchema>;

/**
 * Schema for Sales Funnel tool
 */
export const SalesFunnelSchema = z.object({
  period: DatePeriodEnum
    .optional()
    .describe("Date period to analyze (e.g., 'this_quarter', 'this_year')"),
  from_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("Start date for analysis (YYYY-MM-DD). Ignored if period is specified."),
  to_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("End date for analysis (YYYY-MM-DD). Ignored if period is specified."),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type SalesFunnelInput = z.infer<typeof SalesFunnelSchema>;

/**
 * Schema for Product Performance tool
 */
export const ProductPerformanceSchema = z.object({
  period: DatePeriodEnum
    .optional()
    .describe("Date period to analyze (e.g., 'this_year', 'last_quarter')"),
  from_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("Start date for analysis (YYYY-MM-DD). Ignored if period is specified."),
  to_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("End date for analysis (YYYY-MM-DD). Ignored if period is specified."),
  metric: z.enum(["revenue", "quantity", "invoice_count"])
    .default("revenue")
    .describe("Metric to rank products by: 'revenue', 'quantity', or 'invoice_count'"),
  top_n: z.number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Number of top products to return (1-100, default: 20)"),
  include_trends: z.boolean()
    .default(false)
    .describe("Compare to previous period to show trends"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type ProductPerformanceInput = z.infer<typeof ProductPerformanceSchema>;

/**
 * Schema for Period Comparison tool
 */
export const PeriodComparisonSchema = z.object({
  current_period: DatePeriodEnum
    .describe("Current period to analyze (e.g., 'this_month', 'this_quarter')"),
  compare_to: DatePeriodEnum
    .optional()
    .describe("Period to compare against. If not specified, compares to the previous equivalent period."),
  metrics: z.array(z.enum(["revenue", "invoice_count", "average_invoice", "new_customers"]))
    .default(["revenue", "invoice_count", "average_invoice"])
    .describe("Metrics to compare between periods"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type PeriodComparisonInput = z.infer<typeof PeriodComparisonSchema>;

/**
 * Schema for Customer Growth tool
 */
export const CustomerGrowthSchema = z.object({
  current_period: DatePeriodEnum
    .describe("Current period to analyze (e.g., 'this_quarter', 'this_year')"),
  compare_to: DatePeriodEnum
    .optional()
    .describe("Period to compare against. If not specified, compares to the previous equivalent period."),
  min_revenue: z.number()
    .min(0)
    .optional()
    .describe("Only include customers with at least this much revenue in either period"),
  top_n: z.number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Number of customers to return (1-100, default: 20)"),
  show: z.enum(["growing", "declining", "all"])
    .default("all")
    .describe("Filter to show only growing, declining, or all customers"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type CustomerGrowthInput = z.infer<typeof CustomerGrowthSchema>;

/**
 * Schema for Project Profitability tool
 */
export const ProjectProfitabilitySchema = z.object({
  project_number: z.string()
    .optional()
    .describe("Filter to a specific project number"),
  period: DatePeriodEnum
    .optional()
    .describe("Date period to analyze"),
  from_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("Start date for analysis (YYYY-MM-DD). Ignored if period is specified."),
  to_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("End date for analysis (YYYY-MM-DD). Ignored if period is specified."),
  include_details: z.boolean()
    .default(false)
    .describe("Include detailed breakdown of revenue and costs per project"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type ProjectProfitabilityInput = z.infer<typeof ProjectProfitabilitySchema>;

/**
 * Schema for Cost Center Analysis tool
 */
export const CostCenterAnalysisSchema = z.object({
  period: DatePeriodEnum
    .optional()
    .describe("Date period to analyze"),
  from_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("Start date for analysis (YYYY-MM-DD). Ignored if period is specified."),
  to_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("End date for analysis (YYYY-MM-DD). Ignored if period is specified."),
  cost_center: z.string()
    .optional()
    .describe("Filter to a specific cost center code"),
  account_range_from: z.number()
    .int()
    .optional()
    .describe("Start of account range to include (default: all accounts)"),
  account_range_to: z.number()
    .int()
    .optional()
    .describe("End of account range to include (default: all accounts)"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type CostCenterAnalysisInput = z.infer<typeof CostCenterAnalysisSchema>;

/**
 * Schema for Expense Analysis tool
 */
export const ExpenseAnalysisSchema = z.object({
  period: DatePeriodEnum
    .optional()
    .describe("Date period to analyze"),
  from_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("Start date for analysis (YYYY-MM-DD). Ignored if period is specified."),
  to_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("End date for analysis (YYYY-MM-DD). Ignored if period is specified."),
  account_range_from: z.number()
    .int()
    .default(4000)
    .describe("Start of expense account range (default: 4000)"),
  account_range_to: z.number()
    .int()
    .default(8999)
    .describe("End of expense account range (default: 8999)"),
  group_by: z.enum(["account", "account_class"])
    .default("account_class")
    .describe("Group expenses by individual account or account class (e.g., 4xxx, 5xxx)"),
  compare_to: DatePeriodEnum
    .optional()
    .describe("Optional period to compare against"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type ExpenseAnalysisInput = z.infer<typeof ExpenseAnalysisSchema>;

/**
 * Schema for Yearly Comparison tool
 */
export const YearlyComparisonSchema = z.object({
  years: z.number()
    .int()
    .min(2)
    .max(5)
    .default(3)
    .describe("Number of years to compare (2-5, default: 3)"),
  metrics: z.array(z.enum(["revenue", "invoice_count", "average_invoice", "customer_count"]))
    .default(["revenue", "invoice_count"])
    .describe("Metrics to compare across years"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type YearlyComparisonInput = z.infer<typeof YearlyComparisonSchema>;

/**
 * Schema for Gross Margin Trend tool
 */
export const GrossMarginTrendSchema = z.object({
  period: DatePeriodEnum
    .optional()
    .describe("Date period to analyze (e.g., 'this_year', 'last_year')"),
  from_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("Start date for analysis (YYYY-MM-DD). Ignored if period is specified."),
  to_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("End date for analysis (YYYY-MM-DD). Ignored if period is specified."),
  group_by: z.enum(["month", "quarter"])
    .default("month")
    .describe("How to group the margin trend: 'month' or 'quarter'"),
  revenue_accounts: z.string()
    .optional()
    .describe("Revenue account range (e.g., '3000-3999'). Default: 3000-3999"),
  cogs_accounts: z.string()
    .optional()
    .describe("Cost of goods sold account range (e.g., '4000-4999'). Default: 4000-4999"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type GrossMarginTrendInput = z.infer<typeof GrossMarginTrendSchema>;
