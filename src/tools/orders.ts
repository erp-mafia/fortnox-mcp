import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fortnoxRequest, fetchAllPages } from "../services/api.js";
import { ResponseFormat } from "../constants.js";
import {
  buildToolResponse,
  buildErrorResponse,
  formatMoney,
  formatDisplayDate,
  formatListMarkdown,
  buildPaginationMeta
} from "../services/formatters.js";
import {
  periodToDateRange,
  getPeriodDescription
} from "../services/dateHelpers.js";
import {
  ListOrdersSchema,
  ListOffersSchema,
  type ListOrdersInput,
  type ListOffersInput
} from "../schemas/orders.js";

// API response types for Orders
interface FortnoxOrderListItem {
  DocumentNumber: string;
  CustomerNumber: string;
  CustomerName?: string;
  OrderDate?: string;
  DeliveryDate?: string;
  Total?: number;
  Currency?: string;
  Cancelled?: boolean;
  Sent?: boolean;
  InvoiceReference?: string;
  "@url"?: string;
}

interface OrderListResponse {
  Orders: FortnoxOrderListItem[];
  MetaInformation?: {
    "@TotalResources": number;
    "@TotalPages": number;
    "@CurrentPage": number;
  };
}

// API response types for Offers
interface FortnoxOfferListItem {
  DocumentNumber: string;
  CustomerNumber: string;
  CustomerName?: string;
  OfferDate?: string;
  ExpireDate?: string;
  Total?: number;
  Currency?: string;
  Cancelled?: boolean;
  Sent?: boolean;
  OrderReference?: string;
  "@url"?: string;
}

interface OfferListResponse {
  Offers: FortnoxOfferListItem[];
  MetaInformation?: {
    "@TotalResources": number;
    "@TotalPages": number;
    "@CurrentPage": number;
  };
}

/**
 * Get order status based on properties
 */
function getOrderStatus(order: FortnoxOrderListItem): string {
  if (order.Cancelled) return "cancelled";
  if (order.InvoiceReference) return "invoiced";
  if (order.Sent) return "sent";
  return "draft";
}

/**
 * Get offer status based on properties
 */
function getOfferStatus(offer: FortnoxOfferListItem): string {
  if (offer.Cancelled) return "cancelled";
  if (offer.OrderReference) return "converted";
  if (offer.Sent) return "sent";
  return "draft";
}

/**
 * Check if offer is expired
 */
function isOfferExpired(offer: FortnoxOfferListItem): boolean {
  if (!offer.ExpireDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expireDate = new Date(offer.ExpireDate);
  return expireDate < today;
}

/**
 * Register order and offer related tools
 */
export function registerOrderTools(server: McpServer): void {
  // List Orders Tool
  server.registerTool(
    "fortnox_list_orders",
    {
      title: "List Fortnox Orders",
      description: `List orders from Fortnox with optional filtering and pagination.

Retrieves a paginated list of sales orders with optional filtering by status, customer, or date range.
Orders represent confirmed customer purchases that may or may not have been invoiced yet.

Args:
  - limit (number): Max results per page, 1-100 (default: 20)
  - page (number): Page number for pagination (default: 1)
  - filter ('cancelled' | 'expired' | 'invoicecreated' | 'invoicenotcreated'): Filter by order status
  - customer_number (string): Filter by customer number
  - from_date (string): Filter orders from this date (YYYY-MM-DD)
  - to_date (string): Filter orders to this date (YYYY-MM-DD)
  - period ('today' | ... | 'last_year'): Convenience date period, overrides from_date/to_date
  - sortby ('customername' | 'customernumber' | 'documentnumber' | 'orderdate' | 'total'): Sort field
  - sortorder ('ascending' | 'descending'): Sort direction (default: ascending)
  - fetch_all (boolean): Fetch all pages (max 10,000 results)
  - response_format ('markdown' | 'json'): Output format

Returns:
  List of orders with customer info, dates, totals, and status.

Examples:
  - All open orders: filter="invoicenotcreated"
  - Orders this month: period="this_month"
  - Customer's order history: customer_number="1001", period="this_year"

Error Handling:
  - Returns truncation warning if >10,000 orders
  - Returns "Error: ..." if API call fails`,
      inputSchema: ListOrdersSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: ListOrdersInput) => {
      try {
        // Build query params
        const queryParams: Record<string, string | number | boolean | undefined> = {};

        if (params.filter) queryParams.filter = params.filter;
        if (params.customer_number) queryParams.customernumber = params.customer_number;

        // Handle period convenience filter
        if (params.period) {
          const dateRange = periodToDateRange(params.period);
          queryParams.fromdate = dateRange.from_date;
          queryParams.todate = dateRange.to_date;
        } else {
          if (params.from_date) queryParams.fromdate = params.from_date;
          if (params.to_date) queryParams.todate = params.to_date;
        }

        if (params.sortby) queryParams.sortby = params.sortby;
        if (params.sortorder) queryParams.sortorder = params.sortorder;

        let orders: FortnoxOrderListItem[];
        let total: number;
        let pagesFetched = 1;
        let truncated = false;
        let truncationReason: string | undefined;

        if (params.fetch_all) {
          const result = await fetchAllPages<FortnoxOrderListItem, OrderListResponse>(
            "/3/orders",
            queryParams,
            (r) => r.Orders || [],
            (r) => r.MetaInformation?.["@TotalResources"] || 0
          );
          orders = result.items;
          total = result.total;
          pagesFetched = result.pagesFetched;
          truncated = result.truncated;
          truncationReason = result.truncationReason;
        } else {
          queryParams.limit = params.limit;
          queryParams.page = params.page;

          const response = await fortnoxRequest<OrderListResponse>("/3/orders", "GET", undefined, queryParams);
          orders = response.Orders || [];
          total = response.MetaInformation?.["@TotalResources"] || orders.length;
        }

        const paginationMeta = params.fetch_all
          ? {
              total,
              count: orders.length,
              fetched_all: true,
              pages_fetched: pagesFetched,
              truncated,
              truncation_reason: truncationReason
            }
          : {
              ...buildPaginationMeta(total, params.page, params.limit, orders.length),
              next_offset: params.page * params.limit < total ? params.page * params.limit : undefined
            };

        const output = {
          ...paginationMeta,
          period_description: params.period ? getPeriodDescription(params.period) : undefined,
          orders: orders.map((order) => ({
            document_number: order.DocumentNumber,
            customer_number: order.CustomerNumber,
            customer_name: order.CustomerName || null,
            order_date: order.OrderDate || null,
            delivery_date: order.DeliveryDate || null,
            total: order.Total || 0,
            currency: order.Currency || "SEK",
            status: getOrderStatus(order),
            invoice_reference: order.InvoiceReference || null
          }))
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          const title = params.period
            ? `Orders - ${getPeriodDescription(params.period)}`
            : "Orders";

          if (params.fetch_all) {
            const lines: string[] = [
              `# ${title}`,
              "",
              `Showing ${orders.length} of ${total} total orders`,
              `(${pagesFetched} pages fetched)`
            ];

            if (truncated) {
              lines.push("");
              lines.push(`**Results truncated**: ${truncationReason}`);
            }

            lines.push("");

            for (const order of orders) {
              const status = getOrderStatus(order);
              lines.push(`## Order #${order.DocumentNumber}`);
              lines.push(`- **Customer**: ${order.CustomerName || order.CustomerNumber}`);
              lines.push(`- **Date**: ${formatDisplayDate(order.OrderDate)} | **Delivery**: ${formatDisplayDate(order.DeliveryDate)}`);
              lines.push(`- **Total**: ${formatMoney(order.Total, order.Currency)}`);
              lines.push(`- **Status**: ${status.toUpperCase()}${order.InvoiceReference ? ` (Invoice: ${order.InvoiceReference})` : ""}`);
              lines.push("");
            }

            textContent = lines.join("\n");
          } else {
            textContent = formatListMarkdown(
              title,
              orders,
              total,
              params.page,
              params.limit,
              (order) => {
                const status = getOrderStatus(order);
                return `## Order #${order.DocumentNumber}\n` +
                  `- **Customer**: ${order.CustomerName || order.CustomerNumber}\n` +
                  `- **Date**: ${formatDisplayDate(order.OrderDate)} | **Delivery**: ${formatDisplayDate(order.DeliveryDate)}\n` +
                  `- **Total**: ${formatMoney(order.Total, order.Currency)}\n` +
                  `- **Status**: ${status.toUpperCase()}${order.InvoiceReference ? ` (Invoice: ${order.InvoiceReference})` : ""}`;
              }
            );
          }
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );

  // List Offers Tool
  server.registerTool(
    "fortnox_list_offers",
    {
      title: "List Fortnox Offers",
      description: `List offers/quotes from Fortnox with optional filtering and pagination.

Retrieves a paginated list of sales offers (quotes/proposals) with optional filtering by status, customer, or date range.
Offers represent potential sales that may be converted to orders.

Args:
  - limit (number): Max results per page, 1-100 (default: 20)
  - page (number): Page number for pagination (default: 1)
  - filter ('cancelled' | 'expired' | 'ordercreated' | 'ordernotcreated'): Filter by offer status
  - customer_number (string): Filter by customer number
  - from_date (string): Filter offers from this date (YYYY-MM-DD)
  - to_date (string): Filter offers to this date (YYYY-MM-DD)
  - period ('today' | ... | 'last_year'): Convenience date period, overrides from_date/to_date
  - sortby ('customername' | 'customernumber' | 'documentnumber' | 'offerdate' | 'total'): Sort field
  - sortorder ('ascending' | 'descending'): Sort direction (default: ascending)
  - fetch_all (boolean): Fetch all pages (max 10,000 results)
  - response_format ('markdown' | 'json'): Output format

Returns:
  List of offers with customer info, dates, totals, and status.

Examples:
  - All open offers: filter="ordernotcreated"
  - Offers this quarter: period="this_quarter"
  - Show expired offers: filter="expired"

Error Handling:
  - Returns truncation warning if >10,000 offers
  - Returns "Error: ..." if API call fails`,
      inputSchema: ListOffersSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: ListOffersInput) => {
      try {
        // Build query params
        const queryParams: Record<string, string | number | boolean | undefined> = {};

        if (params.filter) queryParams.filter = params.filter;
        if (params.customer_number) queryParams.customernumber = params.customer_number;

        // Handle period convenience filter
        if (params.period) {
          const dateRange = periodToDateRange(params.period);
          queryParams.fromdate = dateRange.from_date;
          queryParams.todate = dateRange.to_date;
        } else {
          if (params.from_date) queryParams.fromdate = params.from_date;
          if (params.to_date) queryParams.todate = params.to_date;
        }

        if (params.sortby) queryParams.sortby = params.sortby;
        if (params.sortorder) queryParams.sortorder = params.sortorder;

        let offers: FortnoxOfferListItem[];
        let total: number;
        let pagesFetched = 1;
        let truncated = false;
        let truncationReason: string | undefined;

        if (params.fetch_all) {
          const result = await fetchAllPages<FortnoxOfferListItem, OfferListResponse>(
            "/3/offers",
            queryParams,
            (r) => r.Offers || [],
            (r) => r.MetaInformation?.["@TotalResources"] || 0
          );
          offers = result.items;
          total = result.total;
          pagesFetched = result.pagesFetched;
          truncated = result.truncated;
          truncationReason = result.truncationReason;
        } else {
          queryParams.limit = params.limit;
          queryParams.page = params.page;

          const response = await fortnoxRequest<OfferListResponse>("/3/offers", "GET", undefined, queryParams);
          offers = response.Offers || [];
          total = response.MetaInformation?.["@TotalResources"] || offers.length;
        }

        const paginationMeta = params.fetch_all
          ? {
              total,
              count: offers.length,
              fetched_all: true,
              pages_fetched: pagesFetched,
              truncated,
              truncation_reason: truncationReason
            }
          : {
              ...buildPaginationMeta(total, params.page, params.limit, offers.length),
              next_offset: params.page * params.limit < total ? params.page * params.limit : undefined
            };

        const output = {
          ...paginationMeta,
          period_description: params.period ? getPeriodDescription(params.period) : undefined,
          offers: offers.map((offer) => ({
            document_number: offer.DocumentNumber,
            customer_number: offer.CustomerNumber,
            customer_name: offer.CustomerName || null,
            offer_date: offer.OfferDate || null,
            expire_date: offer.ExpireDate || null,
            total: offer.Total || 0,
            currency: offer.Currency || "SEK",
            status: getOfferStatus(offer),
            expired: isOfferExpired(offer),
            order_reference: offer.OrderReference || null
          }))
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          const title = params.period
            ? `Offers - ${getPeriodDescription(params.period)}`
            : "Offers";

          if (params.fetch_all) {
            const lines: string[] = [
              `# ${title}`,
              "",
              `Showing ${offers.length} of ${total} total offers`,
              `(${pagesFetched} pages fetched)`
            ];

            if (truncated) {
              lines.push("");
              lines.push(`**Results truncated**: ${truncationReason}`);
            }

            lines.push("");

            for (const offer of offers) {
              const status = getOfferStatus(offer);
              const expired = isOfferExpired(offer);
              lines.push(`## Offer #${offer.DocumentNumber}`);
              lines.push(`- **Customer**: ${offer.CustomerName || offer.CustomerNumber}`);
              lines.push(`- **Date**: ${formatDisplayDate(offer.OfferDate)} | **Expires**: ${formatDisplayDate(offer.ExpireDate)}${expired ? " (EXPIRED)" : ""}`);
              lines.push(`- **Total**: ${formatMoney(offer.Total, offer.Currency)}`);
              lines.push(`- **Status**: ${status.toUpperCase()}${offer.OrderReference ? ` (Order: ${offer.OrderReference})` : ""}`);
              lines.push("");
            }

            textContent = lines.join("\n");
          } else {
            textContent = formatListMarkdown(
              title,
              offers,
              total,
              params.page,
              params.limit,
              (offer) => {
                const status = getOfferStatus(offer);
                const expired = isOfferExpired(offer);
                return `## Offer #${offer.DocumentNumber}\n` +
                  `- **Customer**: ${offer.CustomerName || offer.CustomerNumber}\n` +
                  `- **Date**: ${formatDisplayDate(offer.OfferDate)} | **Expires**: ${formatDisplayDate(offer.ExpireDate)}${expired ? " (EXPIRED)" : ""}\n` +
                  `- **Total**: ${formatMoney(offer.Total, offer.Currency)}\n` +
                  `- **Status**: ${status.toUpperCase()}${offer.OrderReference ? ` (Order: ${offer.OrderReference})` : ""}`;
              }
            );
          }
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );
}
