import { z } from "zod";
import { ResponseFormat, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants.js";

/**
 * Schema for listing customers
 */
export const ListCustomersSchema = z.object({
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
    .describe("Filter by customer status"),
  search_name: z.string()
    .max(100)
    .optional()
    .describe("Search customers by name (partial match)"),
  customer_number: z.string()
    .max(50)
    .optional()
    .describe("Filter by specific customer number"),
  organisation_number: z.string()
    .max(50)
    .optional()
    .describe("Filter by organisation number"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type ListCustomersInput = z.infer<typeof ListCustomersSchema>;

/**
 * Schema for getting a single customer
 */
export const GetCustomerSchema = z.object({
  customer_number: z.string()
    .min(1)
    .describe("The customer number to retrieve"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type GetCustomerInput = z.infer<typeof GetCustomerSchema>;

/**
 * Schema for creating a customer
 */
export const CreateCustomerSchema = z.object({
  name: z.string()
    .min(1)
    .max(1024)
    .describe("Customer name (required)"),
  customer_number: z.string()
    .max(50)
    .optional()
    .describe("Customer number (auto-generated if not provided)"),
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
  vat_type: z.enum(["SEVAT", "EUVAT", "EUREVERSEDVAT", "EXPORT"])
    .optional()
    .describe("VAT type for the customer"),
  terms_of_payment: z.string()
    .max(50)
    .optional()
    .describe("Payment terms code"),
  price_list: z.string()
    .max(50)
    .optional()
    .describe("Price list code"),
  comments: z.string()
    .max(1024)
    .optional()
    .describe("Internal comments about the customer"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type CreateCustomerInput = z.infer<typeof CreateCustomerSchema>;

/**
 * Schema for updating a customer
 */
export const UpdateCustomerSchema = z.object({
  customer_number: z.string()
    .min(1)
    .describe("Customer number to update (required)"),
  name: z.string()
    .min(1)
    .max(1024)
    .optional()
    .describe("Customer name"),
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
    .describe("Two-letter country code"),
  currency: z.string()
    .length(3)
    .optional()
    .describe("Currency code"),
  vat_number: z.string()
    .max(50)
    .optional()
    .describe("VAT registration number"),
  active: z.boolean()
    .optional()
    .describe("Whether the customer is active"),
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

export type UpdateCustomerInput = z.infer<typeof UpdateCustomerSchema>;

/**
 * Schema for deleting a customer
 */
export const DeleteCustomerSchema = z.object({
  customer_number: z.string()
    .min(1)
    .describe("Customer number to delete")
}).strict();

export type DeleteCustomerInput = z.infer<typeof DeleteCustomerSchema>;
