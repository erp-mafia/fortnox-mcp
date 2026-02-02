import { z } from "zod";
import { ResponseFormat, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants.js";
import { DatePeriodEnum } from "./invoices.js";

/**
 * Project status enum for filtering
 */
export const ProjectStatusEnum = z.enum([
  "NOTSTARTED",
  "ONGOING",
  "COMPLETED"
]);

export type ProjectStatus = z.infer<typeof ProjectStatusEnum>;

/**
 * Schema for listing projects
 */
export const ListProjectsSchema = z.object({
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
  fetch_all: z.boolean()
    .default(false)
    .describe("Fetch all results by auto-paginating (max 10,000 results)"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type ListProjectsInput = z.infer<typeof ListProjectsSchema>;

/**
 * Schema for getting a single project
 */
export const GetProjectSchema = z.object({
  project_number: z.string()
    .min(1)
    .describe("The project number to retrieve"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type GetProjectInput = z.infer<typeof GetProjectSchema>;

/**
 * Schema for listing cost centers
 */
export const ListCostCentersSchema = z.object({
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
  fetch_all: z.boolean()
    .default(false)
    .describe("Fetch all results by auto-paginating (max 10,000 results)"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type ListCostCentersInput = z.infer<typeof ListCostCentersSchema>;

/**
 * Schema for getting a single cost center
 */
export const GetCostCenterSchema = z.object({
  code: z.string()
    .min(1)
    .describe("The cost center code to retrieve"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type GetCostCenterInput = z.infer<typeof GetCostCenterSchema>;

/**
 * Schema for listing financial years
 */
export const ListFinancialYearsSchema = z.object({
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type ListFinancialYearsInput = z.infer<typeof ListFinancialYearsSchema>;

/**
 * Schema for listing articles/products
 */
export const ListArticlesSchema = z.object({
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
  fetch_all: z.boolean()
    .default(false)
    .describe("Fetch all results by auto-paginating (max 10,000 results)"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type ListArticlesInput = z.infer<typeof ListArticlesSchema>;
