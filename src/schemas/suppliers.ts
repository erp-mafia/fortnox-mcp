import { z } from "zod";
import { ResponseFormat, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants.js";

/**
 * Schema for listing suppliers
 */
export const ListSuppliersSchema = z.object({
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
  filter: z.enum(["active", "inactive"])
    .optional()
    .describe("Filter by supplier status"),
  search_name: z.string()
    .max(100)
    .optional()
    .describe("Search suppliers by name (partial match)"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type ListSuppliersInput = z.infer<typeof ListSuppliersSchema>;

/**
 * Schema for getting a single supplier
 */
export const GetSupplierSchema = z.object({
  supplier_number: z.string()
    .min(1)
    .describe("The supplier number to retrieve"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type GetSupplierInput = z.infer<typeof GetSupplierSchema>;

/**
 * Schema for creating a supplier
 */
export const CreateSupplierSchema = z.object({
  name: z.string()
    .min(1)
    .max(1024)
    .describe("Supplier name (required)"),
  supplier_number: z.string()
    .max(50)
    .optional()
    .describe("Supplier number (auto-generated if not provided)"),
  organisation_number: z.string()
    .max(30)
    .optional()
    .describe("Organisation/company number"),
  email: z.string()
    .email()
    .optional()
    .describe("Primary email address"),
  phone: z.string()
    .max(50)
    .optional()
    .describe("Primary phone number"),
  address1: z.string()
    .max(1024)
    .optional()
    .describe("Street address line 1"),
  address2: z.string()
    .max(1024)
    .optional()
    .describe("Street address line 2"),
  zip_code: z.string()
    .max(10)
    .optional()
    .describe("Postal/ZIP code"),
  city: z.string()
    .max(1024)
    .optional()
    .describe("City"),
  country: z.string()
    .max(50)
    .optional()
    .describe("Country name"),
  country_code: z.string()
    .length(2)
    .optional()
    .describe("Two-letter country code (e.g., 'SE' for Sweden)"),
  currency: z.string()
    .length(3)
    .optional()
    .describe("Currency code (e.g., 'SEK', 'EUR')"),
  vat_number: z.string()
    .max(50)
    .optional()
    .describe("VAT registration number"),
  bank_account: z.string()
    .max(50)
    .optional()
    .describe("Bank account number"),
  bg_number: z.string()
    .max(20)
    .optional()
    .describe("Bankgiro number"),
  pg_number: z.string()
    .max(20)
    .optional()
    .describe("Plusgiro number"),
  terms_of_payment: z.string()
    .max(50)
    .optional()
    .describe("Payment terms code"),
  comments: z.string()
    .max(1024)
    .optional()
    .describe("Internal comments about the supplier"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type CreateSupplierInput = z.infer<typeof CreateSupplierSchema>;

/**
 * Schema for updating a supplier
 */
export const UpdateSupplierSchema = z.object({
  supplier_number: z.string()
    .min(1)
    .describe("Supplier number to update (required)"),
  name: z.string()
    .min(1)
    .max(1024)
    .optional()
    .describe("Supplier name"),
  organisation_number: z.string()
    .max(30)
    .optional()
    .describe("Organisation/company number"),
  email: z.string()
    .email()
    .optional()
    .describe("Primary email address"),
  phone: z.string()
    .max(50)
    .optional()
    .describe("Primary phone number"),
  address1: z.string()
    .max(1024)
    .optional()
    .describe("Street address line 1"),
  address2: z.string()
    .max(1024)
    .optional()
    .describe("Street address line 2"),
  zip_code: z.string()
    .max(10)
    .optional()
    .describe("Postal/ZIP code"),
  city: z.string()
    .max(1024)
    .optional()
    .describe("City"),
  country: z.string()
    .max(50)
    .optional()
    .describe("Country name"),
  active: z.boolean()
    .optional()
    .describe("Whether the supplier is active"),
  bank_account: z.string()
    .max(50)
    .optional()
    .describe("Bank account number"),
  bg_number: z.string()
    .max(20)
    .optional()
    .describe("Bankgiro number"),
  pg_number: z.string()
    .max(20)
    .optional()
    .describe("Plusgiro number"),
  terms_of_payment: z.string()
    .max(50)
    .optional()
    .describe("Payment terms code"),
  comments: z.string()
    .max(1024)
    .optional()
    .describe("Internal comments"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type UpdateSupplierInput = z.infer<typeof UpdateSupplierSchema>;

/**
 * Schema for deleting a supplier
 */
export const DeleteSupplierSchema = z.object({
  supplier_number: z.string()
    .min(1)
    .describe("Supplier number to delete")
}).strict();

export type DeleteSupplierInput = z.infer<typeof DeleteSupplierSchema>;
