import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCustomerTools } from "./customers.js";
import { registerInvoiceTools } from "./invoices.js";
import { registerSupplierTools } from "./suppliers.js";
import { registerSupplierInvoiceTools } from "./supplierInvoices.js";
import { registerAccountTools } from "./accounts.js";
import { registerVoucherTools } from "./vouchers.js";
import { registerCompanyTools } from "./company.js";
import { registerAnalyticsTools } from "./analytics.js";
import { registerOrderTools } from "./orders.js";
import { registerBIAnalyticsTools } from "./biAnalytics.js";

/**
 * Register every Fortnox tool on a server (shared by local, remote and test servers)
 */
export function registerAllTools(server: McpServer): void {
  registerCustomerTools(server);
  registerInvoiceTools(server);
  registerSupplierTools(server);
  registerSupplierInvoiceTools(server);
  registerAccountTools(server);
  registerVoucherTools(server);
  registerCompanyTools(server);
  registerAnalyticsTools(server);
  registerOrderTools(server);
  registerBIAnalyticsTools(server);
}
