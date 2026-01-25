import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fortnoxRequest } from "../services/api.js";
import { ResponseFormat } from "../constants.js";
import {
  buildToolResponse,
  buildErrorResponse,
  formatMoney,
  formatBoolean,
  formatListMarkdown,
  formatDetailMarkdown,
  buildPaginationMeta
} from "../services/formatters.js";
import {
  ListCustomersSchema,
  GetCustomerSchema,
  CreateCustomerSchema,
  UpdateCustomerSchema,
  DeleteCustomerSchema,
  type ListCustomersInput,
  type GetCustomerInput,
  type CreateCustomerInput,
  type UpdateCustomerInput,
  type DeleteCustomerInput
} from "../schemas/customers.js";

// API response types
interface FortnoxCustomer {
  CustomerNumber: string;
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
  TermsOfPayment?: string;
  Comments?: string;
  "@url"?: string;
}

interface FortnoxCustomerListItem {
  CustomerNumber: string;
  Name: string;
  Email?: string;
  City?: string;
  OrganisationNumber?: string;
  "@url"?: string;
}

interface CustomerListResponse {
  Customers: FortnoxCustomerListItem[];
  MetaInformation?: {
    "@TotalResources": number;
    "@TotalPages": number;
    "@CurrentPage": number;
  };
}

interface CustomerResponse {
  Customer: FortnoxCustomer;
}

/**
 * Register all customer-related tools
 */
export function registerCustomerTools(server: McpServer): void {
  // List customers
  server.registerTool(
    "fortnox_list_customers",
    {
      title: "List Fortnox Customers",
      description: `List customers from Fortnox accounting system.

Retrieves a paginated list of customers with optional filtering by status, name, or customer number.

Args:
  - limit (number): Max results per page, 1-100 (default: 20)
  - page (number): Page number for pagination (default: 1)
  - filter ('active' | 'inactive'): Filter by customer status
  - search_name (string): Search customers by name (partial match)
  - customer_number (string): Filter by specific customer number
  - organisation_number (string): Filter by organisation number
  - response_format ('markdown' | 'json'): Output format

Returns:
  List of customers with customer number, name, email, city, and organisation number.

Examples:
  - List all active customers: filter="active"
  - Search by name: search_name="Acme"
  - Get specific customer: customer_number="1001"`,
      inputSchema: ListCustomersSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: ListCustomersInput) => {
      try {
        const queryParams: Record<string, string | number | boolean | undefined> = {
          limit: params.limit,
          page: params.page
        };

        if (params.filter) {
          queryParams.filter = params.filter;
        }
        if (params.search_name) {
          queryParams.name = params.search_name;
        }
        if (params.customer_number) {
          queryParams.customernumber = params.customer_number;
        }
        if (params.organisation_number) {
          queryParams.organisationnumber = params.organisation_number;
        }

        const response = await fortnoxRequest<CustomerListResponse>("/3/customers", "GET", undefined, queryParams);
        const customers = response.Customers || [];
        const total = response.MetaInformation?.["@TotalResources"] || customers.length;

        const output = {
          ...buildPaginationMeta(total, params.page, params.limit, customers.length),
          customers: customers.map((c) => ({
            customer_number: c.CustomerNumber,
            name: c.Name,
            email: c.Email || null,
            city: c.City || null,
            organisation_number: c.OrganisationNumber || null
          }))
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          textContent = formatListMarkdown(
            "Customers",
            customers,
            total,
            params.page,
            params.limit,
            (c) => `## ${c.Name} (${c.CustomerNumber})\n` +
              (c.Email ? `- **Email**: ${c.Email}\n` : "") +
              (c.City ? `- **City**: ${c.City}\n` : "") +
              (c.OrganisationNumber ? `- **Org.nr**: ${c.OrganisationNumber}` : "")
          );
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );

  // Get single customer
  server.registerTool(
    "fortnox_get_customer",
    {
      title: "Get Fortnox Customer",
      description: `Retrieve detailed information about a specific customer.

Args:
  - customer_number (string): The customer number to retrieve (required)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Complete customer details including contact info, addresses, payment terms, and VAT settings.`,
      inputSchema: GetCustomerSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: GetCustomerInput) => {
      try {
        const response = await fortnoxRequest<CustomerResponse>(
          `/3/customers/${encodeURIComponent(params.customer_number)}`
        );
        const customer = response.Customer;

        const output = {
          customer_number: customer.CustomerNumber,
          name: customer.Name,
          email: customer.Email || null,
          phone: customer.Phone1 || null,
          address1: customer.Address1 || null,
          address2: customer.Address2 || null,
          zip_code: customer.ZipCode || null,
          city: customer.City || null,
          country: customer.Country || null,
          organisation_number: customer.OrganisationNumber || null,
          vat_number: customer.VATNumber || null,
          currency: customer.Currency || null,
          active: customer.Active ?? true,
          terms_of_payment: customer.TermsOfPayment || null,
          comments: customer.Comments || null
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          textContent = formatDetailMarkdown(`Customer: ${customer.Name}`, [
            { label: "Customer Number", value: customer.CustomerNumber },
            { label: "Name", value: customer.Name },
            { label: "Email", value: customer.Email },
            { label: "Phone", value: customer.Phone1 },
            { label: "Address", value: [customer.Address1, customer.Address2].filter(Boolean).join(", ") },
            { label: "ZIP/City", value: [customer.ZipCode, customer.City].filter(Boolean).join(" ") },
            { label: "Country", value: customer.Country },
            { label: "Organisation Number", value: customer.OrganisationNumber },
            { label: "VAT Number", value: customer.VATNumber },
            { label: "Currency", value: customer.Currency },
            { label: "Active", value: customer.Active },
            { label: "Payment Terms", value: customer.TermsOfPayment },
            { label: "Comments", value: customer.Comments }
          ]);
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );

  // Create customer
  server.registerTool(
    "fortnox_create_customer",
    {
      title: "Create Fortnox Customer",
      description: `Create a new customer in Fortnox.

Args:
  - name (string): Customer name (required)
  - customer_number (string): Customer number (auto-generated if not provided)
  - organisation_number (string): Company registration number
  - email (string): Primary email address
  - phone (string): Primary phone number
  - address1, address2, zip_code, city, country, country_code: Address fields
  - currency (string): 3-letter currency code (e.g., 'SEK')
  - vat_number (string): VAT registration number
  - vat_type ('SEVAT' | 'EUVAT' | 'EUREVERSEDVAT' | 'EXPORT'): VAT type
  - terms_of_payment (string): Payment terms code
  - price_list (string): Price list code
  - comments (string): Internal comments

Returns:
  The created customer with assigned customer number.`,
      inputSchema: CreateCustomerSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: CreateCustomerInput) => {
      try {
        const customerData: Record<string, unknown> = {
          Name: params.name
        };

        if (params.customer_number) customerData.CustomerNumber = params.customer_number;
        if (params.organisation_number) customerData.OrganisationNumber = params.organisation_number;
        if (params.email) customerData.Email = params.email;
        if (params.phone) customerData.Phone1 = params.phone;
        if (params.address1) customerData.Address1 = params.address1;
        if (params.address2) customerData.Address2 = params.address2;
        if (params.zip_code) customerData.ZipCode = params.zip_code;
        if (params.city) customerData.City = params.city;
        if (params.country) customerData.Country = params.country;
        if (params.country_code) customerData.CountryCode = params.country_code;
        if (params.currency) customerData.Currency = params.currency;
        if (params.vat_number) customerData.VATNumber = params.vat_number;
        if (params.vat_type) customerData.VATType = params.vat_type;
        if (params.terms_of_payment) customerData.TermsOfPayment = params.terms_of_payment;
        if (params.price_list) customerData.PriceList = params.price_list;
        if (params.comments) customerData.Comments = params.comments;

        const response = await fortnoxRequest<CustomerResponse>(
          "/3/customers",
          "POST",
          { Customer: customerData }
        );
        const customer = response.Customer;

        const output = {
          success: true,
          message: `Customer "${customer.Name}" created successfully`,
          customer_number: customer.CustomerNumber,
          name: customer.Name
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          textContent = `# Customer Created\n\n` +
            `**Customer Number**: ${customer.CustomerNumber}\n` +
            `**Name**: ${customer.Name}\n\n` +
            `Customer has been successfully created in Fortnox.`;
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );

  // Update customer
  server.registerTool(
    "fortnox_update_customer",
    {
      title: "Update Fortnox Customer",
      description: `Update an existing customer in Fortnox.

Args:
  - customer_number (string): Customer number to update (required)
  - name, email, phone, address fields, etc.: Fields to update (only provided fields are changed)

Returns:
  The updated customer details.`,
      inputSchema: UpdateCustomerSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: UpdateCustomerInput) => {
      try {
        const customerData: Record<string, unknown> = {};

        if (params.name) customerData.Name = params.name;
        if (params.organisation_number) customerData.OrganisationNumber = params.organisation_number;
        if (params.email) customerData.Email = params.email;
        if (params.phone) customerData.Phone1 = params.phone;
        if (params.address1) customerData.Address1 = params.address1;
        if (params.address2) customerData.Address2 = params.address2;
        if (params.zip_code) customerData.ZipCode = params.zip_code;
        if (params.city) customerData.City = params.city;
        if (params.country) customerData.Country = params.country;
        if (params.country_code) customerData.CountryCode = params.country_code;
        if (params.currency) customerData.Currency = params.currency;
        if (params.vat_number) customerData.VATNumber = params.vat_number;
        if (params.active !== undefined) customerData.Active = params.active;
        if (params.terms_of_payment) customerData.TermsOfPayment = params.terms_of_payment;
        if (params.comments) customerData.Comments = params.comments;

        const response = await fortnoxRequest<CustomerResponse>(
          `/3/customers/${encodeURIComponent(params.customer_number)}`,
          "PUT",
          { Customer: customerData }
        );
        const customer = response.Customer;

        const output = {
          success: true,
          message: `Customer "${customer.Name}" updated successfully`,
          customer_number: customer.CustomerNumber,
          name: customer.Name
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          textContent = `# Customer Updated\n\n` +
            `**Customer Number**: ${customer.CustomerNumber}\n` +
            `**Name**: ${customer.Name}\n\n` +
            `Customer has been successfully updated.`;
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );

  // Delete customer
  server.registerTool(
    "fortnox_delete_customer",
    {
      title: "Delete Fortnox Customer",
      description: `Delete a customer from Fortnox.

WARNING: This action cannot be undone. The customer must not have any invoices or orders.

Args:
  - customer_number (string): Customer number to delete (required)

Returns:
  Confirmation of deletion.`,
      inputSchema: DeleteCustomerSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: DeleteCustomerInput) => {
      try {
        await fortnoxRequest(
          `/3/customers/${encodeURIComponent(params.customer_number)}`,
          "DELETE"
        );

        const output = {
          success: true,
          message: `Customer ${params.customer_number} deleted successfully`
        };

        return buildToolResponse(
          `# Customer Deleted\n\nCustomer **${params.customer_number}** has been successfully deleted.`,
          output
        );
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );
}
