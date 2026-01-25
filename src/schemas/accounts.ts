import { z } from "zod";
import { ResponseFormat, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants.js";

/**
 * Schema for listing accounts
 */
export const ListAccountsSchema = z.object({
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
  search_description: z.string()
    .max(100)
    .optional()
    .describe("Search accounts by description"),
  from_account: z.number()
    .int()
    .min(1000)
    .max(9999)
    .optional()
    .describe("Filter accounts from this account number"),
  to_account: z.number()
    .int()
    .min(1000)
    .max(9999)
    .optional()
    .describe("Filter accounts to this account number"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type ListAccountsInput = z.infer<typeof ListAccountsSchema>;

/**
 * Schema for getting a single account
 */
export const GetAccountSchema = z.object({
  account_number: z.number()
    .int()
    .min(1000)
    .max(9999)
    .describe("The account number to retrieve (1000-9999)"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type GetAccountInput = z.infer<typeof GetAccountSchema>;

/**
 * Schema for creating an account
 */
export const CreateAccountSchema = z.object({
  account_number: z.number()
    .int()
    .min(1000)
    .max(9999)
    .describe("Account number (1000-9999, required)"),
  description: z.string()
    .min(1)
    .max(200)
    .describe("Account description (required)"),
  vat_code: z.string()
    .max(10)
    .optional()
    .describe("VAT code for the account"),
  active: z.boolean()
    .default(true)
    .describe("Whether the account is active"),
  cost_center_settings: z.enum(["ALLOWED", "MANDATORY", "NOTALLOWED"])
    .optional()
    .describe("Cost center settings for the account"),
  project_settings: z.enum(["ALLOWED", "MANDATORY", "NOTALLOWED"])
    .optional()
    .describe("Project settings for the account"),
  sru_code: z.number()
    .int()
    .optional()
    .describe("SRU code for tax reporting"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type CreateAccountInput = z.infer<typeof CreateAccountSchema>;

/**
 * Schema for updating an account
 */
export const UpdateAccountSchema = z.object({
  account_number: z.number()
    .int()
    .min(1000)
    .max(9999)
    .describe("Account number to update (required)"),
  description: z.string()
    .min(1)
    .max(200)
    .optional()
    .describe("Account description"),
  vat_code: z.string()
    .max(10)
    .optional()
    .describe("VAT code for the account"),
  active: z.boolean()
    .optional()
    .describe("Whether the account is active"),
  cost_center_settings: z.enum(["ALLOWED", "MANDATORY", "NOTALLOWED"])
    .optional()
    .describe("Cost center settings"),
  project_settings: z.enum(["ALLOWED", "MANDATORY", "NOTALLOWED"])
    .optional()
    .describe("Project settings"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type UpdateAccountInput = z.infer<typeof UpdateAccountSchema>;

/**
 * Schema for deleting an account
 */
export const DeleteAccountSchema = z.object({
  account_number: z.number()
    .int()
    .min(1000)
    .max(9999)
    .describe("Account number to delete")
}).strict();

export type DeleteAccountInput = z.infer<typeof DeleteAccountSchema>;
