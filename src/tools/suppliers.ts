import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fortnoxRequest } from "../services/api.js";
import { ResponseFormat } from "../constants.js";
import {
  buildToolResponse,
  buildErrorResponse,
  formatListMarkdown,
  formatDetailMarkdown,
  buildPaginationMeta
} from "../services/formatters.js";
import {
  ListSuppliersSchema,
  GetSupplierSchema,
  CreateSupplierSchema,
  UpdateSupplierSchema,
  DeleteSupplierSchema,
  type ListSuppliersInput,
  type GetSupplierInput,
  type CreateSupplierInput,
  type UpdateSupplierInput,
  type DeleteSupplierInput
} from "../schemas/suppliers.js";

// API response types
interface FortnoxSupplier {
  SupplierNumber: string;
  Name: string;
  Email?: string;
  Phone1?: string;
  Address1?: string;
  Address2?: string;
  ZipCode?: string;
  City?: string;
  Country?: string;
  OrganisationNumber?: string;
  VATNumber?: string;
  Currency?: string;
  Active?: boolean;
  BankAccount?: string;
  BG?: string;
  PG?: string;
  TermsOfPayment?: string;
  Comments?: string;
  "@url"?: string;
}

interface FortnoxSupplierListItem {
  SupplierNumber: string;
  Name: string;
  Email?: string;
  City?: string;
  OrganisationNumber?: string;
  "@url"?: string;
}

interface SupplierListResponse {
  Suppliers: FortnoxSupplierListItem[];
  MetaInformation?: {
    "@TotalResources": number;
    "@TotalPages": number;
    "@CurrentPage": number;
  };
}

interface SupplierResponse {
  Supplier: FortnoxSupplier;
}

/**
 * Register all supplier-related tools
 */
export function registerSupplierTools(server: McpServer): void {
  // List suppliers
  server.registerTool(
    "fortnox_list_suppliers",
    {
      title: "List Fortnox Suppliers",
      description: `List suppliers from Fortnox accounting system.

Retrieves a paginated list of suppliers with optional filtering.

Args:
  - limit (number): Max results per page, 1-100 (default: 20)
  - page (number): Page number for pagination (default: 1)
  - filter ('active' | 'inactive'): Filter by supplier status
  - search_name (string): Search suppliers by name (partial match)
  - response_format ('markdown' | 'json'): Output format

Returns:
  List of suppliers with supplier number, name, email, city, and organisation number.`,
      inputSchema: ListSuppliersSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: ListSuppliersInput) => {
      try {
        const queryParams: Record<string, string | number | boolean | undefined> = {
          limit: params.limit,
          page: params.page
        };

        if (params.filter) queryParams.filter = params.filter;
        if (params.search_name) queryParams.name = params.search_name;

        const response = await fortnoxRequest<SupplierListResponse>("/3/suppliers", "GET", undefined, queryParams);
        const suppliers = response.Suppliers || [];
        const total = response.MetaInformation?.["@TotalResources"] || suppliers.length;

        const output = {
          ...buildPaginationMeta(total, params.page, params.limit, suppliers.length),
          suppliers: suppliers.map((s) => ({
            supplier_number: s.SupplierNumber,
            name: s.Name,
            email: s.Email || null,
            city: s.City || null,
            organisation_number: s.OrganisationNumber || null
          }))
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          textContent = formatListMarkdown(
            "Suppliers",
            suppliers,
            total,
            params.page,
            params.limit,
            (s) => `## ${s.Name} (${s.SupplierNumber})\n` +
              (s.Email ? `- **Email**: ${s.Email}\n` : "") +
              (s.City ? `- **City**: ${s.City}\n` : "") +
              (s.OrganisationNumber ? `- **Org.nr**: ${s.OrganisationNumber}` : "")
          );
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );

  // Get single supplier
  server.registerTool(
    "fortnox_get_supplier",
    {
      title: "Get Fortnox Supplier",
      description: `Retrieve detailed information about a specific supplier.

Args:
  - supplier_number (string): The supplier number to retrieve (required)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Complete supplier details including contact info, addresses, bank details, and payment terms.`,
      inputSchema: GetSupplierSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: GetSupplierInput) => {
      try {
        const response = await fortnoxRequest<SupplierResponse>(
          `/3/suppliers/${encodeURIComponent(params.supplier_number)}`
        );
        const supplier = response.Supplier;

        const output = {
          supplier_number: supplier.SupplierNumber,
          name: supplier.Name,
          email: supplier.Email || null,
          phone: supplier.Phone1 || null,
          address1: supplier.Address1 || null,
          address2: supplier.Address2 || null,
          zip_code: supplier.ZipCode || null,
          city: supplier.City || null,
          country: supplier.Country || null,
          organisation_number: supplier.OrganisationNumber || null,
          vat_number: supplier.VATNumber || null,
          currency: supplier.Currency || null,
          active: supplier.Active ?? true,
          bank_account: supplier.BankAccount || null,
          bg_number: supplier.BG || null,
          pg_number: supplier.PG || null,
          terms_of_payment: supplier.TermsOfPayment || null,
          comments: supplier.Comments || null
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          textContent = formatDetailMarkdown(`Supplier: ${supplier.Name}`, [
            { label: "Supplier Number", value: supplier.SupplierNumber },
            { label: "Name", value: supplier.Name },
            { label: "Email", value: supplier.Email },
            { label: "Phone", value: supplier.Phone1 },
            { label: "Address", value: [supplier.Address1, supplier.Address2].filter(Boolean).join(", ") },
            { label: "ZIP/City", value: [supplier.ZipCode, supplier.City].filter(Boolean).join(" ") },
            { label: "Country", value: supplier.Country },
            { label: "Organisation Number", value: supplier.OrganisationNumber },
            { label: "VAT Number", value: supplier.VATNumber },
            { label: "Currency", value: supplier.Currency },
            { label: "Active", value: supplier.Active },
            { label: "Bank Account", value: supplier.BankAccount },
            { label: "Bankgiro", value: supplier.BG },
            { label: "Plusgiro", value: supplier.PG },
            { label: "Payment Terms", value: supplier.TermsOfPayment },
            { label: "Comments", value: supplier.Comments }
          ]);
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );

  // Create supplier
  server.registerTool(
    "fortnox_create_supplier",
    {
      title: "Create Fortnox Supplier",
      description: `Create a new supplier in Fortnox.

Args:
  - name (string): Supplier name (required)
  - supplier_number (string): Supplier number (auto-generated if not provided)
  - organisation_number (string): Company registration number
  - email (string): Email address
  - phone (string): Phone number
  - address1, address2, zip_code, city, country, country_code: Address fields
  - currency (string): 3-letter currency code
  - vat_number (string): VAT registration number
  - bank_account (string): Bank account number
  - bg_number (string): Bankgiro number
  - pg_number (string): Plusgiro number
  - terms_of_payment (string): Payment terms code
  - comments (string): Internal comments

Returns:
  The created supplier with assigned supplier number.`,
      inputSchema: CreateSupplierSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: CreateSupplierInput) => {
      try {
        const supplierData: Record<string, unknown> = {
          Name: params.name
        };

        if (params.supplier_number) supplierData.SupplierNumber = params.supplier_number;
        if (params.organisation_number) supplierData.OrganisationNumber = params.organisation_number;
        if (params.email) supplierData.Email = params.email;
        if (params.phone) supplierData.Phone1 = params.phone;
        if (params.address1) supplierData.Address1 = params.address1;
        if (params.address2) supplierData.Address2 = params.address2;
        if (params.zip_code) supplierData.ZipCode = params.zip_code;
        if (params.city) supplierData.City = params.city;
        if (params.country) supplierData.Country = params.country;
        if (params.country_code) supplierData.CountryCode = params.country_code;
        if (params.currency) supplierData.Currency = params.currency;
        if (params.vat_number) supplierData.VATNumber = params.vat_number;
        if (params.bank_account) supplierData.BankAccount = params.bank_account;
        if (params.bg_number) supplierData.BG = params.bg_number;
        if (params.pg_number) supplierData.PG = params.pg_number;
        if (params.terms_of_payment) supplierData.TermsOfPayment = params.terms_of_payment;
        if (params.comments) supplierData.Comments = params.comments;

        const response = await fortnoxRequest<SupplierResponse>(
          "/3/suppliers",
          "POST",
          { Supplier: supplierData }
        );
        const supplier = response.Supplier;

        const output = {
          success: true,
          message: `Supplier "${supplier.Name}" created successfully`,
          supplier_number: supplier.SupplierNumber,
          name: supplier.Name
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          textContent = `# Supplier Created\n\n` +
            `**Supplier Number**: ${supplier.SupplierNumber}\n` +
            `**Name**: ${supplier.Name}\n\n` +
            `Supplier has been successfully created in Fortnox.`;
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );

  // Update supplier
  server.registerTool(
    "fortnox_update_supplier",
    {
      title: "Update Fortnox Supplier",
      description: `Update an existing supplier in Fortnox.

Args:
  - supplier_number (string): Supplier number to update (required)
  - All other fields from create_supplier (only provided fields are updated)

Returns:
  The updated supplier details.`,
      inputSchema: UpdateSupplierSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: UpdateSupplierInput) => {
      try {
        const supplierData: Record<string, unknown> = {};

        if (params.name) supplierData.Name = params.name;
        if (params.organisation_number) supplierData.OrganisationNumber = params.organisation_number;
        if (params.email) supplierData.Email = params.email;
        if (params.phone) supplierData.Phone1 = params.phone;
        if (params.address1) supplierData.Address1 = params.address1;
        if (params.address2) supplierData.Address2 = params.address2;
        if (params.zip_code) supplierData.ZipCode = params.zip_code;
        if (params.city) supplierData.City = params.city;
        if (params.country) supplierData.Country = params.country;
        if (params.active !== undefined) supplierData.Active = params.active;
        if (params.bank_account) supplierData.BankAccount = params.bank_account;
        if (params.bg_number) supplierData.BG = params.bg_number;
        if (params.pg_number) supplierData.PG = params.pg_number;
        if (params.terms_of_payment) supplierData.TermsOfPayment = params.terms_of_payment;
        if (params.comments) supplierData.Comments = params.comments;

        const response = await fortnoxRequest<SupplierResponse>(
          `/3/suppliers/${encodeURIComponent(params.supplier_number)}`,
          "PUT",
          { Supplier: supplierData }
        );
        const supplier = response.Supplier;

        const output = {
          success: true,
          message: `Supplier "${supplier.Name}" updated successfully`,
          supplier_number: supplier.SupplierNumber,
          name: supplier.Name
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          textContent = `# Supplier Updated\n\n` +
            `**Supplier Number**: ${supplier.SupplierNumber}\n` +
            `**Name**: ${supplier.Name}\n\n` +
            `Supplier has been successfully updated.`;
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );

  // Delete supplier
  server.registerTool(
    "fortnox_delete_supplier",
    {
      title: "Delete Fortnox Supplier",
      description: `Delete a supplier from Fortnox.

WARNING: This action cannot be undone. The supplier must not have any invoices.

Args:
  - supplier_number (string): Supplier number to delete (required)

Returns:
  Confirmation of deletion.`,
      inputSchema: DeleteSupplierSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: DeleteSupplierInput) => {
      try {
        await fortnoxRequest(
          `/3/suppliers/${encodeURIComponent(params.supplier_number)}`,
          "DELETE"
        );

        const output = {
          success: true,
          message: `Supplier ${params.supplier_number} deleted successfully`
        };

        return buildToolResponse(
          `# Supplier Deleted\n\nSupplier **${params.supplier_number}** has been successfully deleted.`,
          output
        );
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );
}
