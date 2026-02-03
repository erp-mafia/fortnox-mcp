import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fortnoxRequest } from "../services/api.js";
import { ResponseFormat } from "../constants.js";
import {
  buildToolResponse,
  buildErrorResponse,
  formatDetailMarkdown
} from "../services/formatters.js";
import { ListFinancialYearsSchema, type ListFinancialYearsInput } from "../schemas/projects.js";

// Response format schema
const CompanyInfoSchema = z.object({
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

type CompanyInfoInput = z.infer<typeof CompanyInfoSchema>;

// API response types
interface FortnoxCompanyInfo {
  Address: string;
  City: string;
  CompanyName: string;
  Country: string;
  CountryCode: string;
  DatabaseNumber: string;
  Email: string;
  Fax: string;
  OrganizationNumber: string;
  Phone1: string;
  Phone2: string;
  VisitAddress: string;
  VisitCity: string;
  VisitCountry: string;
  VisitCountryCode: string;
  VisitZipCode: string;
  WWW: string;
  ZipCode: string;
}

interface CompanyInfoResponse {
  CompanyInformation: FortnoxCompanyInfo;
}

// Financial year response types
interface FortnoxFinancialYear {
  Id: number;
  FromDate: string;
  ToDate: string;
  AccountingMethod?: string;
  "@url"?: string;
}

interface FinancialYearsResponse {
  FinancialYears: FortnoxFinancialYear[];
}

/**
 * Register company information tools
 */
export function registerCompanyTools(server: McpServer): void {
  // Get company information
  server.registerTool(
    "fortnox_get_company_info",
    {
      title: "Get Fortnox Company Information",
      description: `Retrieve information about the company connected to this Fortnox account.

Returns company name, organisation number, addresses, contact details, and other company information.

Args:
  - response_format ('markdown' | 'json'): Output format

Returns:
  Company details including name, organisation number, address, and contact information.`,
      inputSchema: CompanyInfoSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: CompanyInfoInput) => {
      try {
        const response = await fortnoxRequest<CompanyInfoResponse>("/3/companyinformation");
        const company = response.CompanyInformation;

        const output = {
          company_name: company.CompanyName,
          organisation_number: company.OrganizationNumber,
          database_number: company.DatabaseNumber,
          address: company.Address || null,
          zip_code: company.ZipCode || null,
          city: company.City || null,
          country: company.Country || null,
          country_code: company.CountryCode || null,
          visit_address: company.VisitAddress || null,
          visit_zip_code: company.VisitZipCode || null,
          visit_city: company.VisitCity || null,
          visit_country: company.VisitCountry || null,
          email: company.Email || null,
          phone: company.Phone1 || null,
          phone2: company.Phone2 || null,
          fax: company.Fax || null,
          website: company.WWW || null
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          textContent = formatDetailMarkdown(`Company: ${company.CompanyName}`, [
            { label: "Company Name", value: company.CompanyName },
            { label: "Organisation Number", value: company.OrganizationNumber },
            { label: "Database Number", value: company.DatabaseNumber },
            { label: "Postal Address", value: [company.Address, company.ZipCode, company.City].filter(Boolean).join(", ") },
            { label: "Country", value: company.Country },
            { label: "Visit Address", value: [company.VisitAddress, company.VisitZipCode, company.VisitCity].filter(Boolean).join(", ") },
            { label: "Email", value: company.Email },
            { label: "Phone", value: company.Phone1 },
            { label: "Phone 2", value: company.Phone2 },
            { label: "Fax", value: company.Fax },
            { label: "Website", value: company.WWW }
          ]);
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );

  // List financial years
  server.registerTool(
    "fortnox_list_financial_years",
    {
      title: "List Financial Years",
      description: `List all financial years configured in Fortnox.

IMPORTANT: Voucher tools (fortnox_list_vouchers, fortnox_account_activity, etc.)
use Fortnox sequential IDs (1, 2, 3...) NOT calendar years. Use this tool first
to find the correct ID.

Example: If ID 4 maps to 2025-01-01 to 2025-12-31, use financial_year=4 in voucher tools.

Args:
  - response_format ('markdown' | 'json'): Output format

Returns:
  List of financial years with ID, date range, and accounting method.`,
      inputSchema: ListFinancialYearsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: ListFinancialYearsInput) => {
      try {
        const response = await fortnoxRequest<FinancialYearsResponse>("/3/financialyears");
        const financialYears = response.FinancialYears || [];

        const output = {
          count: financialYears.length,
          financial_years: financialYears.map((fy) => ({
            id: fy.Id,
            from_date: fy.FromDate,
            to_date: fy.ToDate,
            accounting_method: fy.AccountingMethod || null
          }))
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          const lines = [
            "# Financial Years",
            "",
            "Use the **ID** column when calling voucher tools (fortnox_list_vouchers, fortnox_account_activity, etc.).",
            "",
            "| ID | From Date | To Date | Accounting Method |",
            "|----|-----------|---------|-------------------|"
          ];

          for (const fy of financialYears) {
            lines.push(`| ${fy.Id} | ${fy.FromDate} | ${fy.ToDate} | ${fy.AccountingMethod || "-"} |`);
          }

          textContent = lines.join("\n");
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );
}
