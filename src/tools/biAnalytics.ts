import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchAllPages } from "../services/api.js";
import { ResponseFormat } from "../constants.js";
import {
  buildToolResponse,
  buildErrorResponse,
  formatMoney,
  formatTrend,
  formatCashFlowTable,
  formatFunnelVisualization,
  formatComparisonTableHeader,
  formatComparisonRow,
  formatMargin
} from "../services/formatters.js";
import {
  periodToDateRange,
  getPeriodDescription,
  getPreviousPeriod,
  comparePeriods,
  getLastNYears,
  getFutureDate,
  getTodayString,
  isDueDateInRange,
  type DatePeriod
} from "../services/dateHelpers.js";
import {
  aggregateByDimension,
  groupByTimePeriod,
  calculateGrowth,
  sumBy,
  countUnique,
  generateTimeBucketKeys,
  getTimeBucketKey,
  type GrowthResult
} from "../services/aggregationHelpers.js";
import {
  CashFlowForecastSchema,
  OrderPipelineSchema,
  SalesFunnelSchema,
  ProductPerformanceSchema,
  PeriodComparisonSchema,
  CustomerGrowthSchema,
  ProjectProfitabilitySchema,
  CostCenterAnalysisSchema,
  ExpenseAnalysisSchema,
  YearlyComparisonSchema,
  GrossMarginTrendSchema,
  type CashFlowForecastInput,
  type OrderPipelineInput,
  type SalesFunnelInput,
  type ProductPerformanceInput,
  type PeriodComparisonInput,
  type CustomerGrowthInput,
  type ProjectProfitabilityInput,
  type CostCenterAnalysisInput,
  type ExpenseAnalysisInput,
  type YearlyComparisonInput,
  type GrossMarginTrendInput
} from "../schemas/biAnalytics.js";

// Shared type interfaces
interface FortnoxInvoiceListItem {
  DocumentNumber: string;
  CustomerNumber: string;
  CustomerName?: string;
  InvoiceDate?: string;
  DueDate?: string;
  Total?: number;
  Balance?: number;
  Currency?: string;
  Booked?: boolean;
  Cancelled?: boolean;
}

interface InvoiceListResponse {
  Invoices: FortnoxInvoiceListItem[];
  MetaInformation?: {
    "@TotalResources": number;
    "@TotalPages": number;
    "@CurrentPage": number;
  };
}

interface FortnoxSupplierInvoiceListItem {
  GivenNumber: string;
  SupplierNumber: string;
  SupplierName?: string;
  InvoiceDate?: string;
  DueDate?: string;
  Total?: number;
  Balance?: number;
  Currency?: string;
  Booked?: boolean;
  Cancelled?: boolean;
}

interface SupplierInvoiceListResponse {
  SupplierInvoices: FortnoxSupplierInvoiceListItem[];
  MetaInformation?: {
    "@TotalResources": number;
    "@TotalPages": number;
    "@CurrentPage": number;
  };
}

interface FortnoxOrderListItem {
  DocumentNumber: string;
  CustomerNumber: string;
  CustomerName?: string;
  OrderDate?: string;
  Total?: number;
  Currency?: string;
  Cancelled?: boolean;
  InvoiceReference?: string;
}

interface OrderListResponse {
  Orders: FortnoxOrderListItem[];
  MetaInformation?: {
    "@TotalResources": number;
    "@TotalPages": number;
    "@CurrentPage": number;
  };
}

interface FortnoxOfferListItem {
  DocumentNumber: string;
  CustomerNumber: string;
  CustomerName?: string;
  OfferDate?: string;
  Total?: number;
  Currency?: string;
  Cancelled?: boolean;
  OrderReference?: string;
}

interface OfferListResponse {
  Offers: FortnoxOfferListItem[];
  MetaInformation?: {
    "@TotalResources": number;
    "@TotalPages": number;
    "@CurrentPage": number;
  };
}

interface FortnoxInvoiceDetail {
  DocumentNumber: string;
  CustomerNumber: string;
  CustomerName?: string;
  InvoiceDate?: string;
  Total?: number;
  InvoiceRows?: Array<{
    ArticleNumber?: string;
    Description?: string;
    DeliveredQuantity?: number;
    Price?: number;
    Total?: number;
  }>;
}

interface InvoiceDetailResponse {
  Invoice: FortnoxInvoiceDetail;
}

interface FortnoxProject {
  ProjectNumber: string;
  Description?: string;
  Status?: string;
  StartDate?: string;
  EndDate?: string;
}

interface ProjectListResponse {
  Projects: FortnoxProject[];
  MetaInformation?: {
    "@TotalResources": number;
  };
}

interface FortnoxCostCenter {
  Code: string;
  Description?: string;
  Active?: boolean;
}

interface CostCenterListResponse {
  CostCenters: FortnoxCostCenter[];
  MetaInformation?: {
    "@TotalResources": number;
  };
}

interface FortnoxVoucherRow {
  Account: number;
  Debit?: number;
  Credit?: number;
  Description?: string;
  Project?: string;
  CostCenter?: string;
}

interface FortnoxVoucher {
  VoucherNumber: number;
  VoucherSeries: string;
  Year: number;
  Description?: string;
  TransactionDate?: string;
  VoucherRows?: FortnoxVoucherRow[];
}

interface VoucherListResponse {
  Vouchers: FortnoxVoucher[];
  MetaInformation?: {
    "@TotalResources": number;
  };
}

/**
 * Register all Business Intelligence analytics tools
 */
export function registerBIAnalyticsTools(server: McpServer): void {
  // ==========================================
  // PHASE 1: MVP Tools
  // ==========================================

  // 1. Cash Flow Forecast
  server.registerTool(
    "fortnox_cash_flow_forecast",
    {
      title: "Cash Flow Forecast",
      description: `Generate cash flow forecast from unpaid receivables and payables. Shows expected inflows, outflows, net flow, and running balance grouped by week or month.`,
      inputSchema: CashFlowForecastSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: CashFlowForecastInput) => {
      try {
        const today = getTodayString();
        const futureDate = getFutureDate(params.horizon_days);

        // Fetch unpaid customer invoices (receivables)
        const receivablesResult = await fetchAllPages<FortnoxInvoiceListItem, InvoiceListResponse>(
          "/3/invoices",
          { filter: "unpaid" },
          (r) => r.Invoices || [],
          (r) => r.MetaInformation?.["@TotalResources"] || 0
        );

        // Fetch unpaid supplier invoices (payables) with error handling for missing scope
        let payablesResult: { items: FortnoxSupplierInvoiceListItem[]; total: number; truncated: boolean; truncationReason?: string };
        let supplierInvoicesWarning: string | undefined;

        try {
          payablesResult = await fetchAllPages<FortnoxSupplierInvoiceListItem, SupplierInvoiceListResponse>(
            "/3/supplierinvoices",
            { filter: "unpaid" },
            (r) => r.SupplierInvoices || [],
            (r) => r.MetaInformation?.["@TotalResources"] || 0
          );
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          if (msg.includes("behörighet") || msg.includes("403") || msg.includes("Permission") || msg.includes("scope")) {
            supplierInvoicesWarning = "⚠️ Supplier invoices unavailable (missing scope). Outflows show as 0.";
            payablesResult = { items: [], total: 0, truncated: false };
          } else {
            throw error;
          }
        }

        // Filter by due date range
        const filterByDueDate = (dueDate: string | undefined): boolean => {
          if (!dueDate) return false;
          if (params.include_overdue && dueDate < today) return true;
          return isDueDateInRange(dueDate, today, futureDate);
        };

        const receivables = receivablesResult.items.filter(inv => filterByDueDate(inv.DueDate));
        const payables = payablesResult.items.filter(inv => filterByDueDate(inv.DueDate));

        // Generate time buckets
        const buckets = generateTimeBucketKeys(today, futureDate, params.group_by);

        // Group by time period
        const receivablesByPeriod = groupByTimePeriod(
          receivables,
          (inv) => inv.DueDate,
          params.group_by
        );
        const payablesByPeriod = groupByTimePeriod(
          payables,
          (inv) => inv.DueDate,
          params.group_by
        );

        // Handle overdue items - put them in the first bucket
        if (params.include_overdue && buckets.length > 0) {
          const firstBucket = buckets[0];

          // Move overdue receivables to first bucket
          const overdueReceivables = receivables.filter(inv => inv.DueDate && inv.DueDate < today);
          if (overdueReceivables.length > 0) {
            const existing = receivablesByPeriod.get(firstBucket) || [];
            receivablesByPeriod.set(firstBucket, [...existing, ...overdueReceivables]);
          }

          // Move overdue payables to first bucket
          const overduePayables = payables.filter(inv => inv.DueDate && inv.DueDate < today);
          if (overduePayables.length > 0) {
            const existing = payablesByPeriod.get(firstBucket) || [];
            payablesByPeriod.set(firstBucket, [...existing, ...overduePayables]);
          }
        }

        // Calculate cash flow per period
        let runningBalance = params.starting_balance || 0;
        const periods: Array<{
          period: string;
          inflows: number;
          outflows: number;
          netFlow: number;
          runningBalance: number;
          receivablesCount: number;
          payablesCount: number;
        }> = [];

        for (const bucket of buckets) {
          const periodReceivables = receivablesByPeriod.get(bucket) || [];
          const periodPayables = payablesByPeriod.get(bucket) || [];

          const inflows = sumBy(periodReceivables, inv => inv.Balance || 0);
          const outflows = sumBy(periodPayables, inv => inv.Balance || 0);
          const netFlow = inflows - outflows;
          runningBalance += netFlow;

          periods.push({
            period: bucket,
            inflows,
            outflows,
            netFlow,
            runningBalance,
            receivablesCount: periodReceivables.length,
            payablesCount: periodPayables.length
          });
        }

        // Calculate totals
        const totalInflows = sumBy(receivables, inv => inv.Balance || 0);
        const totalOutflows = sumBy(payables, inv => inv.Balance || 0);

        const output: Record<string, unknown> = {
          forecast: {
            horizon_days: params.horizon_days,
            group_by: params.group_by,
            from_date: today,
            to_date: futureDate,
            include_overdue: params.include_overdue,
            starting_balance: params.starting_balance || 0
          },
          summary: {
            total_receivables: totalInflows,
            total_payables: totalOutflows,
            net_position: totalInflows - totalOutflows,
            receivables_count: receivables.length,
            payables_count: payables.length,
            ending_balance: runningBalance
          },
          periods,
          truncated: receivablesResult.truncated || payablesResult.truncated,
          truncation_reason: receivablesResult.truncationReason || payablesResult.truncationReason
        };

        if (supplierInvoicesWarning) {
          output.warning = supplierInvoicesWarning;
        }

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          const lines: string[] = [
            "# Cash Flow Forecast",
            ""
          ];

          if (supplierInvoicesWarning) {
            lines.push(supplierInvoicesWarning);
            lines.push("");
          }

          lines.push(
            `**Period**: ${today} to ${futureDate} (${params.horizon_days} days)`,
            `**Grouped by**: ${params.group_by}`,
            params.starting_balance ? `**Starting Balance**: ${formatMoney(params.starting_balance)}` : "",
            "",
            "## Summary",
            "",
            `| Metric | Value |`,
            `|--------|-------|`,
            `| Expected Receivables | ${formatMoney(totalInflows)} (${receivables.length} invoices) |`,
            `| Expected Payables | ${formatMoney(totalOutflows)} (${payables.length} invoices) |`,
            `| **Net Position** | **${formatMoney(totalInflows - totalOutflows)}** |`,
            `| **Ending Balance** | **${formatMoney(runningBalance)}** |`,
            "",
            "## Forecast by Period",
            "",
            formatCashFlowTable(periods)
          );

          // Filter empty lines added by conditional starting_balance
          const filteredLines = lines.filter(line => line !== "");

          if (output.truncated) {
            filteredLines.push("");
            filteredLines.push(`**Note**: ${output.truncation_reason}`);
          }

          textContent = filteredLines.join("\n");
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );

  // 2. Order Pipeline
  server.registerTool(
    "fortnox_order_pipeline",
    {
      title: "Order Pipeline Analytics",
      description: `Analyze order pipeline and backlog. Shows pending vs invoiced orders grouped by status, customer, or month.`,
      inputSchema: OrderPipelineSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: OrderPipelineInput) => {
      try {
        const queryParams: Record<string, string | number | boolean | undefined> = {};

        let dateRangeDescription: string | undefined;
        if (params.period) {
          const dateRange = periodToDateRange(params.period);
          queryParams.fromdate = dateRange.from_date;
          queryParams.todate = dateRange.to_date;
          dateRangeDescription = getPeriodDescription(params.period);
        } else if (params.from_date || params.to_date) {
          if (params.from_date) queryParams.fromdate = params.from_date;
          if (params.to_date) queryParams.todate = params.to_date;
          dateRangeDescription = `${params.from_date || "start"} to ${params.to_date || "end"}`;
        }

        const result = await fetchAllPages<FortnoxOrderListItem, OrderListResponse>(
          "/3/orders",
          queryParams,
          (r) => r.Orders || [],
          (r) => r.MetaInformation?.["@TotalResources"] || 0
        );

        const orders = result.items;

        // Calculate status for each order
        const getStatus = (order: FortnoxOrderListItem): string => {
          if (order.Cancelled) return "cancelled";
          if (order.InvoiceReference) return "invoiced";
          return "pending";
        };

        // Group orders
        let groups: Map<string, FortnoxOrderListItem[]>;

        switch (params.group_by) {
          case "customer":
            groups = aggregateByDimension(orders, o => o.CustomerName || o.CustomerNumber || "unknown");
            break;
          case "month":
            groups = groupByTimePeriod(orders, o => o.OrderDate, "month");
            break;
          case "status":
          default:
            groups = aggregateByDimension(orders, o => getStatus(o));
            break;
        }

        // Calculate statistics per group
        const groupStats = Array.from(groups.entries())
          .map(([key, items]) => ({
            key,
            count: items.length,
            total_value: sumBy(items, o => o.Total || 0),
            average_value: items.length > 0 ? sumBy(items, o => o.Total || 0) / items.length : 0
          }))
          .sort((a, b) => b.total_value - a.total_value);

        // Calculate overall summary
        const pendingOrders = orders.filter(o => !o.Cancelled && !o.InvoiceReference);
        const invoicedOrders = orders.filter(o => o.InvoiceReference && !o.Cancelled);
        const cancelledOrders = orders.filter(o => o.Cancelled);

        const output = {
          period: params.period || null,
          date_range: dateRangeDescription || null,
          group_by: params.group_by,
          summary: {
            total_orders: orders.length,
            total_value: sumBy(orders, o => o.Total || 0),
            pending_orders: pendingOrders.length,
            pending_value: sumBy(pendingOrders, o => o.Total || 0),
            invoiced_orders: invoicedOrders.length,
            invoiced_value: sumBy(invoicedOrders, o => o.Total || 0),
            cancelled_orders: cancelledOrders.length,
            unique_customers: countUnique(orders, o => o.CustomerNumber || "unknown")
          },
          groups: groupStats,
          truncated: result.truncated,
          truncation_reason: result.truncationReason
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          const lines: string[] = [
            "# Order Pipeline",
            ""
          ];

          if (dateRangeDescription) {
            lines.push(`**Period**: ${dateRangeDescription}`);
            lines.push("");
          }

          lines.push("## Summary");
          lines.push("");
          lines.push("| Metric | Count | Value |");
          lines.push("|--------|-------|-------|");
          lines.push(`| Total Orders | ${orders.length} | ${formatMoney(output.summary.total_value)} |`);
          lines.push(`| **Pending (Backlog)** | **${pendingOrders.length}** | **${formatMoney(output.summary.pending_value)}** |`);
          lines.push(`| Invoiced | ${invoicedOrders.length} | ${formatMoney(output.summary.invoiced_value)} |`);
          lines.push(`| Cancelled | ${cancelledOrders.length} | - |`);
          lines.push(`| Unique Customers | ${output.summary.unique_customers} | - |`);

          lines.push("");
          lines.push(`## Breakdown by ${params.group_by}`);
          lines.push("");
          lines.push(`| ${params.group_by === "customer" ? "Customer" : params.group_by === "month" ? "Month" : "Status"} | Orders | Value | Avg Value |`);
          lines.push("|--------|--------|-------|-----------|");

          for (const group of groupStats.slice(0, 20)) {
            lines.push(`| ${group.key} | ${group.count} | ${formatMoney(group.total_value)} | ${formatMoney(group.average_value)} |`);
          }

          if (groupStats.length > 20) {
            lines.push(`| ... and ${groupStats.length - 20} more | | | |`);
          }

          textContent = lines.join("\n");
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );

  // 3. Sales Funnel
  server.registerTool(
    "fortnox_sales_funnel",
    {
      title: "Sales Funnel Analytics",
      description: `Analyze sales funnel from offers to orders to invoices. Shows counts, values, and conversion rates at each stage.`,
      inputSchema: SalesFunnelSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: SalesFunnelInput) => {
      try {
        const queryParams: Record<string, string | number | boolean | undefined> = {};

        let dateRangeDescription: string | undefined;
        if (params.period) {
          const dateRange = periodToDateRange(params.period);
          queryParams.fromdate = dateRange.from_date;
          queryParams.todate = dateRange.to_date;
          dateRangeDescription = getPeriodDescription(params.period);
        } else if (params.from_date || params.to_date) {
          if (params.from_date) queryParams.fromdate = params.from_date;
          if (params.to_date) queryParams.todate = params.to_date;
          dateRangeDescription = `${params.from_date || "start"} to ${params.to_date || "end"}`;
        }

        // Fetch all three stages in parallel
        const [offersResult, ordersResult, invoicesResult] = await Promise.all([
          fetchAllPages<FortnoxOfferListItem, OfferListResponse>(
            "/3/offers",
            queryParams,
            (r) => r.Offers || [],
            (r) => r.MetaInformation?.["@TotalResources"] || 0
          ),
          fetchAllPages<FortnoxOrderListItem, OrderListResponse>(
            "/3/orders",
            queryParams,
            (r) => r.Orders || [],
            (r) => r.MetaInformation?.["@TotalResources"] || 0
          ),
          fetchAllPages<FortnoxInvoiceListItem, InvoiceListResponse>(
            "/3/invoices",
            queryParams,
            (r) => r.Invoices || [],
            (r) => r.MetaInformation?.["@TotalResources"] || 0
          )
        ]);

        // Filter out cancelled items
        const offers = offersResult.items.filter(o => !o.Cancelled);
        const orders = ordersResult.items.filter(o => !o.Cancelled);
        const invoices = invoicesResult.items.filter(i => !i.Cancelled);

        // Count converted offers (those with OrderReference)
        const convertedOffers = offers.filter(o => o.OrderReference);

        // Count converted orders (those with InvoiceReference)
        const convertedOrders = orders.filter(o => o.InvoiceReference);

        // Calculate funnel metrics
        const offerCount = offers.length;
        const offerValue = sumBy(offers, o => o.Total || 0);

        const orderCount = orders.length;
        const orderValue = sumBy(orders, o => o.Total || 0);

        const invoiceCount = invoices.length;
        const invoiceValue = sumBy(invoices, i => i.Total || 0);

        // Conversion rates
        const offerToOrderRate = offerCount > 0 ? (convertedOffers.length / offerCount) * 100 : 0;
        const orderToInvoiceRate = orderCount > 0 ? (convertedOrders.length / orderCount) * 100 : 0;
        const overallConversionRate = offerCount > 0 ? (invoiceCount / offerCount) * 100 : 0;

        const funnelStages = [
          {
            name: "Offers",
            count: offerCount,
            value: offerValue,
            conversionFromPrevious: undefined
          },
          {
            name: "Orders",
            count: orderCount,
            value: orderValue,
            conversionFromPrevious: offerToOrderRate
          },
          {
            name: "Invoices",
            count: invoiceCount,
            value: invoiceValue,
            conversionFromPrevious: orderToInvoiceRate
          }
        ];

        const output = {
          period: params.period || null,
          date_range: dateRangeDescription || null,
          funnel: {
            offers: {
              count: offerCount,
              value: offerValue,
              converted: convertedOffers.length,
              open: offerCount - convertedOffers.length
            },
            orders: {
              count: orderCount,
              value: orderValue,
              converted: convertedOrders.length,
              open: orderCount - convertedOrders.length
            },
            invoices: {
              count: invoiceCount,
              value: invoiceValue
            }
          },
          conversion_rates: {
            offer_to_order: offerToOrderRate,
            order_to_invoice: orderToInvoiceRate,
            overall: overallConversionRate
          },
          truncated: offersResult.truncated || ordersResult.truncated || invoicesResult.truncated
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          const lines: string[] = [
            "# Sales Funnel Analysis",
            ""
          ];

          if (dateRangeDescription) {
            lines.push(`**Period**: ${dateRangeDescription}`);
            lines.push("");
          }

          lines.push(formatFunnelVisualization(funnelStages));

          lines.push("");
          lines.push("## Conversion Rates");
          lines.push("");
          lines.push(`- **Offer → Order**: ${offerToOrderRate.toFixed(1)}% (${convertedOffers.length} of ${offerCount})`);
          lines.push(`- **Order → Invoice**: ${orderToInvoiceRate.toFixed(1)}% (${convertedOrders.length} of ${orderCount})`);
          lines.push(`- **Overall (Offer → Invoice)**: ${overallConversionRate.toFixed(1)}%`);

          lines.push("");
          lines.push("## Pipeline Value");
          lines.push("");
          lines.push(`- **Open Offers**: ${formatMoney(sumBy(offers.filter(o => !o.OrderReference), o => o.Total || 0))} (${offerCount - convertedOffers.length} offers)`);
          lines.push(`- **Open Orders**: ${formatMoney(sumBy(orders.filter(o => !o.InvoiceReference), o => o.Total || 0))} (${orderCount - convertedOrders.length} orders)`);

          textContent = lines.join("\n");
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );

  // 4. Product Performance
  server.registerTool(
    "fortnox_product_performance",
    {
      title: "Product Performance Analytics",
      description: `Analyze product/customer sales performance. Returns top performers ranked by revenue, quantity, or invoice count.`,
      inputSchema: ProductPerformanceSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: ProductPerformanceInput) => {
      try {
        const queryParams: Record<string, string | number | boolean | undefined> = {};

        let dateRangeDescription: string | undefined;
        if (params.period) {
          const dateRange = periodToDateRange(params.period);
          queryParams.fromdate = dateRange.from_date;
          queryParams.todate = dateRange.to_date;
          dateRangeDescription = getPeriodDescription(params.period);
        } else if (params.from_date || params.to_date) {
          if (params.from_date) queryParams.fromdate = params.from_date;
          if (params.to_date) queryParams.todate = params.to_date;
          dateRangeDescription = `${params.from_date || "start"} to ${params.to_date || "end"}`;
        }

        // Fetch invoices
        const result = await fetchAllPages<FortnoxInvoiceListItem, InvoiceListResponse>(
          "/3/invoices",
          queryParams,
          (r) => r.Invoices || [],
          (r) => r.MetaInformation?.["@TotalResources"] || 0
        );

        const invoices = result.items.filter(i => !i.Cancelled);

        // Aggregate by product - use invoice totals grouped by customer as proxy
        // Note: Full product breakdown requires fetching each invoice detail which is expensive
        // For a real implementation, you'd need to fetch invoice details with rows
        // For now, we'll show customer-based analytics as a placeholder

        const customerStats = new Map<string, {
          customer_number: string;
          customer_name: string;
          revenue: number;
          invoice_count: number;
        }>();

        for (const inv of invoices) {
          const key = inv.CustomerNumber || "unknown";
          if (!customerStats.has(key)) {
            customerStats.set(key, {
              customer_number: key,
              customer_name: inv.CustomerName || key,
              revenue: 0,
              invoice_count: 0
            });
          }
          const stats = customerStats.get(key)!;
          stats.revenue += inv.Total || 0;
          stats.invoice_count += 1;
        }

        // Sort and take top N
        const sortedStats = Array.from(customerStats.values())
          .sort((a, b) => {
            switch (params.metric) {
              case "revenue":
                return b.revenue - a.revenue;
              case "invoice_count":
                return b.invoice_count - a.invoice_count;
              default:
                return b.revenue - a.revenue;
            }
          })
          .slice(0, params.top_n);

        const output = {
          period: params.period || null,
          date_range: dateRangeDescription || null,
          metric: params.metric,
          summary: {
            total_revenue: sumBy(invoices, i => i.Total || 0),
            total_invoices: invoices.length,
            unique_customers: customerStats.size
          },
          // Note: Returning customer stats as product breakdown requires invoice detail API
          top_performers: sortedStats.map((s, index) => ({
            rank: index + 1,
            identifier: s.customer_number,
            name: s.customer_name,
            revenue: s.revenue,
            invoice_count: s.invoice_count
          })),
          note: "Product-level breakdown requires invoice row details. Showing customer-level aggregation.",
          truncated: result.truncated
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          const lines: string[] = [
            "# Product/Customer Performance",
            "",
            "*Note: Full product-level analytics requires invoice row details. Showing customer-level aggregation.*",
            ""
          ];

          if (dateRangeDescription) {
            lines.push(`**Period**: ${dateRangeDescription}`);
            lines.push("");
          }

          lines.push("## Summary");
          lines.push("");
          lines.push(`- **Total Revenue**: ${formatMoney(output.summary.total_revenue)}`);
          lines.push(`- **Total Invoices**: ${output.summary.total_invoices}`);
          lines.push(`- **Unique Customers**: ${output.summary.unique_customers}`);
          lines.push("");

          lines.push(`## Top ${params.top_n} by ${params.metric === "revenue" ? "Revenue" : "Invoice Count"}`);
          lines.push("");
          lines.push("| Rank | Customer | Revenue | Invoices |");
          lines.push("|------|----------|---------|----------|");

          for (const s of sortedStats) {
            lines.push(`| ${sortedStats.indexOf(s) + 1} | ${s.customer_name} | ${formatMoney(s.revenue)} | ${s.invoice_count} |`);
          }

          textContent = lines.join("\n");
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );

  // ==========================================
  // PHASE 2: Financial Analysis Tools
  // ==========================================

  // 5. Period Comparison
  server.registerTool(
    "fortnox_period_comparison",
    {
      title: "Period Comparison Analytics",
      description: `Compare business metrics (revenue, invoice count, etc.) between two time periods with percentage changes.`,
      inputSchema: PeriodComparisonSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: PeriodComparisonInput) => {
      try {
        const comparison = comparePeriods(params.current_period, params.compare_to);

        // Fetch invoices for both periods
        const [currentResult, previousResult] = await Promise.all([
          fetchAllPages<FortnoxInvoiceListItem, InvoiceListResponse>(
            "/3/invoices",
            {
              fromdate: comparison.currentPeriod.dateRange.from_date,
              todate: comparison.currentPeriod.dateRange.to_date
            },
            (r) => r.Invoices || [],
            (r) => r.MetaInformation?.["@TotalResources"] || 0
          ),
          fetchAllPages<FortnoxInvoiceListItem, InvoiceListResponse>(
            "/3/invoices",
            {
              fromdate: comparison.previousPeriod.dateRange.from_date,
              todate: comparison.previousPeriod.dateRange.to_date
            },
            (r) => r.Invoices || [],
            (r) => r.MetaInformation?.["@TotalResources"] || 0
          )
        ]);

        const currentInvoices = currentResult.items.filter(i => !i.Cancelled);
        const previousInvoices = previousResult.items.filter(i => !i.Cancelled);

        // Calculate metrics
        const calculateMetrics = (invoices: FortnoxInvoiceListItem[]) => ({
          revenue: sumBy(invoices, i => i.Total || 0),
          invoice_count: invoices.length,
          average_invoice: invoices.length > 0 ? sumBy(invoices, i => i.Total || 0) / invoices.length : 0,
          new_customers: countUnique(invoices, i => i.CustomerNumber || "unknown")
        });

        const currentMetrics = calculateMetrics(currentInvoices);
        const previousMetrics = calculateMetrics(previousInvoices);

        // Calculate changes
        const metricResults: Record<string, GrowthResult> = {};
        for (const metric of params.metrics) {
          metricResults[metric] = calculateGrowth(
            currentMetrics[metric as keyof typeof currentMetrics],
            previousMetrics[metric as keyof typeof previousMetrics]
          );
        }

        const output = {
          current_period: {
            period: comparison.currentPeriod.period,
            description: comparison.currentPeriod.description,
            date_range: comparison.currentPeriod.dateRange,
            metrics: currentMetrics
          },
          previous_period: {
            period: comparison.previousPeriod.period,
            description: comparison.previousPeriod.description,
            date_range: comparison.previousPeriod.dateRange,
            metrics: previousMetrics
          },
          comparison: metricResults,
          truncated: currentResult.truncated || previousResult.truncated
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          const lines: string[] = [
            "# Period Comparison",
            "",
            `**Current**: ${comparison.currentPeriod.description} (${comparison.currentPeriod.dateRange.from_date} to ${comparison.currentPeriod.dateRange.to_date})`,
            `**Previous**: ${comparison.previousPeriod.description} (${comparison.previousPeriod.dateRange.from_date} to ${comparison.previousPeriod.dateRange.to_date})`,
            "",
            "## Comparison",
            "",
            ...formatComparisonTableHeader(comparison.currentPeriod.description, comparison.previousPeriod.description)
          ];

          const metricLabels: Record<string, string> = {
            revenue: "Revenue",
            invoice_count: "Invoice Count",
            average_invoice: "Avg Invoice",
            new_customers: "Customers"
          };

          for (const metric of params.metrics) {
            const isCount = metric === "invoice_count" || metric === "new_customers";
            lines.push(formatComparisonRow(
              metricLabels[metric] || metric,
              currentMetrics[metric as keyof typeof currentMetrics],
              previousMetrics[metric as keyof typeof previousMetrics],
              isCount
            ));
          }

          textContent = lines.join("\n");
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );

  // 6. Customer Growth
  server.registerTool(
    "fortnox_customer_growth",
    {
      title: "Customer Growth Analytics",
      description: `Identify growing and declining customers by comparing revenue across periods. Shows growth rates and trends.`,
      inputSchema: CustomerGrowthSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: CustomerGrowthInput) => {
      try {
        const comparison = comparePeriods(params.current_period, params.compare_to);

        // Fetch invoices for both periods
        const [currentResult, previousResult] = await Promise.all([
          fetchAllPages<FortnoxInvoiceListItem, InvoiceListResponse>(
            "/3/invoices",
            {
              fromdate: comparison.currentPeriod.dateRange.from_date,
              todate: comparison.currentPeriod.dateRange.to_date
            },
            (r) => r.Invoices || [],
            (r) => r.MetaInformation?.["@TotalResources"] || 0
          ),
          fetchAllPages<FortnoxInvoiceListItem, InvoiceListResponse>(
            "/3/invoices",
            {
              fromdate: comparison.previousPeriod.dateRange.from_date,
              todate: comparison.previousPeriod.dateRange.to_date
            },
            (r) => r.Invoices || [],
            (r) => r.MetaInformation?.["@TotalResources"] || 0
          )
        ]);

        // Group by customer
        const currentByCustomer = aggregateByDimension(
          currentResult.items.filter(i => !i.Cancelled),
          i => i.CustomerNumber || "unknown"
        );
        const previousByCustomer = aggregateByDimension(
          previousResult.items.filter(i => !i.Cancelled),
          i => i.CustomerNumber || "unknown"
        );

        // Get all unique customers
        const allCustomers = new Set([...currentByCustomer.keys(), ...previousByCustomer.keys()]);

        // Calculate growth for each customer
        const customerGrowth: Array<{
          customer_number: string;
          customer_name: string;
          current_revenue: number;
          previous_revenue: number;
          change: number;
          percent_change: number;
          trend: "up" | "down" | "flat";
        }> = [];

        for (const customerNumber of allCustomers) {
          const currentInvoices = currentByCustomer.get(customerNumber) || [];
          const previousInvoices = previousByCustomer.get(customerNumber) || [];

          const currentRevenue = sumBy(currentInvoices, i => i.Total || 0);
          const previousRevenue = sumBy(previousInvoices, i => i.Total || 0);

          // Apply min_revenue filter
          if (params.min_revenue && currentRevenue < params.min_revenue && previousRevenue < params.min_revenue) {
            continue;
          }

          const growth = calculateGrowth(currentRevenue, previousRevenue);

          // Get customer name from most recent invoice
          const customerName = currentInvoices[0]?.CustomerName ||
            previousInvoices[0]?.CustomerName ||
            customerNumber;

          customerGrowth.push({
            customer_number: customerNumber,
            customer_name: customerName,
            current_revenue: currentRevenue,
            previous_revenue: previousRevenue,
            change: growth.change,
            percent_change: growth.percentChange,
            trend: growth.trend
          });
        }

        // Filter by show parameter
        let filteredGrowth = customerGrowth;
        if (params.show === "growing") {
          filteredGrowth = customerGrowth.filter(c => c.trend === "up");
        } else if (params.show === "declining") {
          filteredGrowth = customerGrowth.filter(c => c.trend === "down");
        }

        // Sort by absolute change
        filteredGrowth.sort((a, b) => {
          if (params.show === "declining") {
            return a.change - b.change; // Most negative first
          }
          return b.change - a.change; // Most positive first
        });

        const topCustomers = filteredGrowth.slice(0, params.top_n);

        const output = {
          current_period: comparison.currentPeriod,
          previous_period: comparison.previousPeriod,
          filter: params.show,
          summary: {
            total_customers_analyzed: allCustomers.size,
            growing_customers: customerGrowth.filter(c => c.trend === "up").length,
            declining_customers: customerGrowth.filter(c => c.trend === "down").length,
            flat_customers: customerGrowth.filter(c => c.trend === "flat").length
          },
          customers: topCustomers,
          truncated: currentResult.truncated || previousResult.truncated
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          const filterLabel = params.show === "growing" ? "Growing" : params.show === "declining" ? "Declining" : "All";
          const lines: string[] = [
            `# Customer Growth Analysis - ${filterLabel}`,
            "",
            `**Current**: ${comparison.currentPeriod.description}`,
            `**Previous**: ${comparison.previousPeriod.description}`,
            "",
            "## Summary",
            "",
            `- **Customers Analyzed**: ${allCustomers.size}`,
            `- **Growing**: ${output.summary.growing_customers}`,
            `- **Declining**: ${output.summary.declining_customers}`,
            `- **Flat**: ${output.summary.flat_customers}`,
            "",
            `## Top ${params.top_n} ${filterLabel} Customers`,
            "",
            "| Customer | Current | Previous | Change |",
            "|----------|---------|----------|--------|"
          ];

          for (const c of topCustomers) {
            lines.push(`| ${c.customer_name} | ${formatMoney(c.current_revenue)} | ${formatMoney(c.previous_revenue)} | ${formatTrend(c.percent_change)} |`);
          }

          textContent = lines.join("\n");
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );

  // 7. Project Profitability
  server.registerTool(
    "fortnox_project_profitability",
    {
      title: "Project Profitability Analytics",
      description: `[LIMITED] Analyze profitability by project. Returns project list only.

For actual project financials, use fortnox_account_activity with project filtering on vouchers.`,
      inputSchema: ProjectProfitabilitySchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: ProjectProfitabilityInput) => {
      try {
        // First fetch list of projects
        const projectsResult = await fetchAllPages<FortnoxProject, ProjectListResponse>(
          "/3/projects",
          {},
          (r) => r.Projects || [],
          (r) => r.MetaInformation?.["@TotalResources"] || 0
        );

        let projects = projectsResult.items;

        // Filter to specific project if requested
        if (params.project_number) {
          projects = projects.filter(p => p.ProjectNumber === params.project_number);
        }

        if (projects.length === 0) {
          const output = {
            message: params.project_number
              ? `Project ${params.project_number} not found`
              : "No projects found",
            projects: []
          };
          return buildToolResponse(
            params.response_format === ResponseFormat.JSON
              ? JSON.stringify(output, null, 2)
              : "# Project Profitability\n\nNo projects found.",
            output
          );
        }

        // Build date range for voucher filtering
        const queryParams: Record<string, string | number | boolean | undefined> = {};
        let dateRangeDescription: string | undefined;

        if (params.period) {
          const dateRange = periodToDateRange(params.period);
          queryParams.fromdate = dateRange.from_date;
          queryParams.todate = dateRange.to_date;
          dateRangeDescription = getPeriodDescription(params.period);
        } else if (params.from_date || params.to_date) {
          if (params.from_date) queryParams.fromdate = params.from_date;
          if (params.to_date) queryParams.todate = params.to_date;
          dateRangeDescription = `${params.from_date || "start"} to ${params.to_date || "end"}`;
        }

        // Note: Full project profitability would require fetching vouchers
        // and filtering by project. This is a simplified version.
        const projectStats = projects.map(p => ({
          project_number: p.ProjectNumber,
          description: p.Description || p.ProjectNumber,
          status: p.Status || "UNKNOWN",
          start_date: p.StartDate || null,
          end_date: p.EndDate || null,
          // Placeholder values - real implementation would sum voucher rows
          revenue: 0,
          costs: 0,
          margin: 0,
          margin_percent: 0
        }));

        const output = {
          period: params.period || null,
          date_range: dateRangeDescription || null,
          note: "Project revenue/cost breakdown requires voucher analysis with project dimension. Showing project list.",
          projects: projectStats,
          truncated: projectsResult.truncated
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          const lines: string[] = [
            "# Project Profitability",
            "",
            "*Note: Full revenue/cost breakdown requires voucher analysis with project dimension.*",
            ""
          ];

          if (dateRangeDescription) {
            lines.push(`**Period**: ${dateRangeDescription}`);
            lines.push("");
          }

          lines.push("## Projects");
          lines.push("");
          lines.push("| Project | Description | Status |");
          lines.push("|---------|-------------|--------|");

          for (const p of projectStats) {
            lines.push(`| ${p.project_number} | ${p.description} | ${p.status} |`);
          }

          textContent = lines.join("\n");
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );

  // 8. Cost Center Analysis
  server.registerTool(
    "fortnox_cost_center_analysis",
    {
      title: "Cost Center Analysis",
      description: `[LIMITED] Analyze costs by cost center/department. Returns cost center list only.

For actual cost center data, use fortnox_account_activity with cost center filtering on vouchers.`,
      inputSchema: CostCenterAnalysisSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: CostCenterAnalysisInput) => {
      try {
        // Fetch cost centers
        const costCentersResult = await fetchAllPages<FortnoxCostCenter, CostCenterListResponse>(
          "/3/costcenters",
          {},
          (r) => r.CostCenters || [],
          (r) => r.MetaInformation?.["@TotalResources"] || 0
        );

        let costCenters = costCentersResult.items.filter(cc => cc.Active !== false);

        // Filter to specific cost center if requested
        if (params.cost_center) {
          costCenters = costCenters.filter(cc => cc.Code === params.cost_center);
        }

        let dateRangeDescription: string | undefined;
        if (params.period) {
          dateRangeDescription = getPeriodDescription(params.period);
        } else if (params.from_date || params.to_date) {
          dateRangeDescription = `${params.from_date || "start"} to ${params.to_date || "end"}`;
        }

        // Note: Full cost center analysis would require fetching vouchers
        // and summing by cost center dimension
        const costCenterStats = costCenters.map(cc => ({
          code: cc.Code,
          description: cc.Description || cc.Code,
          active: cc.Active !== false,
          // Placeholder - real implementation would sum voucher rows
          total_costs: 0
        }));

        const output = {
          period: params.period || null,
          date_range: dateRangeDescription || null,
          account_range: params.account_range_from || params.account_range_to
            ? { from: params.account_range_from, to: params.account_range_to }
            : null,
          note: "Cost breakdown requires voucher analysis with cost center dimension. Showing cost center list.",
          cost_centers: costCenterStats,
          truncated: costCentersResult.truncated
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          const lines: string[] = [
            "# Cost Center Analysis",
            "",
            "*Note: Full cost breakdown requires voucher analysis with cost center dimension.*",
            ""
          ];

          if (dateRangeDescription) {
            lines.push(`**Period**: ${dateRangeDescription}`);
            lines.push("");
          }

          lines.push("## Cost Centers");
          lines.push("");
          lines.push("| Code | Description | Status |");
          lines.push("|------|-------------|--------|");

          for (const cc of costCenterStats) {
            lines.push(`| ${cc.code} | ${cc.description} | ${cc.active ? "Active" : "Inactive"} |`);
          }

          textContent = lines.join("\n");
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );

  // ==========================================
  // PHASE 3: Advanced Analytics Tools
  // ==========================================

  // 9. Expense Analysis
  server.registerTool(
    "fortnox_expense_analysis",
    {
      title: "Expense Analysis",
      description: `[LIMITED] Analyze expenses by account class. Returns category structure only.

For actual expense data, use fortnox_account_activity with account_range={from: 4000, to: 8999}.`,
      inputSchema: ExpenseAnalysisSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: ExpenseAnalysisInput) => {
      try {
        let dateRangeDescription: string | undefined;
        if (params.period) {
          dateRangeDescription = getPeriodDescription(params.period);
        } else if (params.from_date || params.to_date) {
          dateRangeDescription = `${params.from_date || "start"} to ${params.to_date || "end"}`;
        }

        // Note: Full expense analysis requires fetching vouchers and filtering by account range
        // This is a placeholder showing the structure
        const expenseClasses = [
          { class: "4xxx", name: "Cost of Goods Sold", amount: 0 },
          { class: "5xxx", name: "Personnel Costs", amount: 0 },
          { class: "6xxx", name: "Other External Costs", amount: 0 },
          { class: "7xxx", name: "Depreciation", amount: 0 },
          { class: "8xxx", name: "Financial Items", amount: 0 }
        ].filter(c => {
          const classStart = parseInt(c.class.replace("xxx", "000"));
          const classEnd = parseInt(c.class.replace("xxx", "999"));
          return classStart <= params.account_range_to && classEnd >= params.account_range_from;
        });

        const output = {
          period: params.period || null,
          date_range: dateRangeDescription || null,
          account_range: {
            from: params.account_range_from,
            to: params.account_range_to
          },
          group_by: params.group_by,
          note: "Full expense breakdown requires voucher analysis. Showing account class structure.",
          expense_classes: expenseClasses,
          comparison_period: params.compare_to || null
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          const lines: string[] = [
            "# Expense Analysis",
            "",
            "*Note: Full expense breakdown requires voucher analysis by account.*",
            ""
          ];

          if (dateRangeDescription) {
            lines.push(`**Period**: ${dateRangeDescription}`);
          }
          lines.push(`**Account Range**: ${params.account_range_from} - ${params.account_range_to}`);
          lines.push("");

          lines.push("## Expense Categories");
          lines.push("");
          lines.push("| Account Class | Category |");
          lines.push("|---------------|----------|");

          for (const ec of expenseClasses) {
            lines.push(`| ${ec.class} | ${ec.name} |`);
          }

          textContent = lines.join("\n");
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );

  // 10. Yearly Comparison
  server.registerTool(
    "fortnox_yearly_comparison",
    {
      title: "Yearly Comparison Analytics",
      description: `Compare revenue and metrics across multiple years (2-5). Shows year-over-year growth trends.`,
      inputSchema: YearlyComparisonSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: YearlyComparisonInput) => {
      try {
        const yearRanges = getLastNYears(params.years);

        // Fetch invoices for each year
        const yearResults = await Promise.all(
          yearRanges.map(({ year, dateRange }) =>
            fetchAllPages<FortnoxInvoiceListItem, InvoiceListResponse>(
              "/3/invoices",
              {
                fromdate: dateRange.from_date,
                todate: dateRange.to_date
              },
              (r) => r.Invoices || [],
              (r) => r.MetaInformation?.["@TotalResources"] || 0
            ).then(result => ({ year, result }))
          )
        );

        // Calculate metrics for each year
        const yearMetrics = yearResults.map(({ year, result }) => {
          const invoices = result.items.filter(i => !i.Cancelled);
          const revenue = sumBy(invoices, i => i.Total || 0);

          return {
            year,
            revenue,
            invoice_count: invoices.length,
            average_invoice: invoices.length > 0 ? revenue / invoices.length : 0,
            customer_count: countUnique(invoices, i => i.CustomerNumber || "unknown"),
            truncated: result.truncated
          };
        });

        // Calculate year-over-year growth
        const yearsWithGrowth = yearMetrics.map((current, index) => {
          if (index === yearMetrics.length - 1) {
            return { ...current, growth: null };
          }
          const previous = yearMetrics[index + 1];
          return {
            ...current,
            growth: {
              revenue: calculateGrowth(current.revenue, previous.revenue),
              invoice_count: calculateGrowth(current.invoice_count, previous.invoice_count),
              customer_count: calculateGrowth(current.customer_count, previous.customer_count)
            }
          };
        });

        const output = {
          years_compared: params.years,
          metrics: params.metrics,
          years: yearsWithGrowth,
          truncated: yearResults.some(r => r.result.truncated)
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          const lines: string[] = [
            "# Yearly Comparison",
            "",
            `**Years**: ${yearRanges.map(y => y.year).join(", ")}`,
            "",
            "## Year-over-Year Metrics",
            ""
          ];

          // Revenue table
          if (params.metrics.includes("revenue")) {
            lines.push("### Revenue");
            lines.push("");
            lines.push("| Year | Revenue | YoY Change |");
            lines.push("|------|---------|------------|");
            for (const y of yearsWithGrowth) {
              const change = y.growth?.revenue ? formatTrend(y.growth.revenue.percentChange) : "-";
              lines.push(`| ${y.year} | ${formatMoney(y.revenue)} | ${change} |`);
            }
            lines.push("");
          }

          // Invoice count table
          if (params.metrics.includes("invoice_count")) {
            lines.push("### Invoice Count");
            lines.push("");
            lines.push("| Year | Invoices | YoY Change |");
            lines.push("|------|----------|------------|");
            for (const y of yearsWithGrowth) {
              const change = y.growth?.invoice_count ? formatTrend(y.growth.invoice_count.percentChange) : "-";
              lines.push(`| ${y.year} | ${y.invoice_count} | ${change} |`);
            }
            lines.push("");
          }

          // Customer count table
          if (params.metrics.includes("customer_count")) {
            lines.push("### Unique Customers");
            lines.push("");
            lines.push("| Year | Customers | YoY Change |");
            lines.push("|------|-----------|------------|");
            for (const y of yearsWithGrowth) {
              const change = y.growth?.customer_count ? formatTrend(y.growth.customer_count.percentChange) : "-";
              lines.push(`| ${y.year} | ${y.customer_count} | ${change} |`);
            }
          }

          textContent = lines.join("\n");
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );

  // 11. Gross Margin Trend
  server.registerTool(
    "fortnox_gross_margin_trend",
    {
      title: "Gross Margin Trend Analytics",
      description: `[LIMITED] Analyze gross margin trends. Returns formula and structure only.

For actual margin data, use fortnox_account_activity with:
- Revenue: account_range={from: 3000, to: 3999}
- COGS: account_range={from: 4000, to: 4999}`,
      inputSchema: GrossMarginTrendSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: GrossMarginTrendInput) => {
      try {
        let dateRangeDescription: string | undefined;
        if (params.period) {
          dateRangeDescription = getPeriodDescription(params.period);
        } else if (params.from_date || params.to_date) {
          dateRangeDescription = `${params.from_date || "start"} to ${params.to_date || "end"}`;
        }

        // Parse account ranges
        const revenueRange = params.revenue_accounts || "3000-3999";
        const cogsRange = params.cogs_accounts || "4000-4999";

        // Note: Full margin calculation requires voucher/SIE analysis
        // This shows the structure for the tool
        const output = {
          period: params.period || null,
          date_range: dateRangeDescription || null,
          group_by: params.group_by,
          account_ranges: {
            revenue: revenueRange,
            cogs: cogsRange
          },
          note: "Full gross margin calculation requires voucher/SIE data analysis by account.",
          periods: [] as Array<{
            period: string;
            revenue: number;
            cogs: number;
            gross_margin: number;
            margin_percent: number;
          }>
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          const lines: string[] = [
            "# Gross Margin Trend",
            "",
            "*Note: Full gross margin calculation requires voucher/SIE data analysis by account.*",
            ""
          ];

          if (dateRangeDescription) {
            lines.push(`**Period**: ${dateRangeDescription}`);
          }
          lines.push(`**Revenue Accounts**: ${revenueRange}`);
          lines.push(`**COGS Accounts**: ${cogsRange}`);
          lines.push(`**Grouped by**: ${params.group_by}`);
          lines.push("");

          lines.push("## Formula");
          lines.push("");
          lines.push("```");
          lines.push("Gross Margin = Revenue - Cost of Goods Sold");
          lines.push("Gross Margin % = (Gross Margin / Revenue) × 100");
          lines.push("```");
          lines.push("");
          lines.push("To get actual values, this tool needs voucher data with proper account coding.");

          textContent = lines.join("\n");
        }

        return buildToolResponse(textContent, output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    }
  );
}
