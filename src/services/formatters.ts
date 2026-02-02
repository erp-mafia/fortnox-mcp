import { ResponseFormat, CHARACTER_LIMIT } from "../constants.js";

/**
 * Format a monetary amount with currency
 */
export function formatMoney(amount: number | undefined, currency = "SEK"): string {
  if (amount === undefined || amount === null) return "-";
  return `${amount.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

/**
 * Format a date string for display
 */
export function formatDisplayDate(dateStr: string | undefined): string {
  if (!dateStr) return "-";
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("sv-SE");
  } catch {
    return dateStr;
  }
}

/**
 * Format a boolean as Yes/No
 */
export function formatBoolean(value: boolean | undefined): string {
  if (value === undefined) return "-";
  return value ? "Yes" : "No";
}

/**
 * Truncate text if it exceeds a limit
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + "...";
}

/**
 * Build a tool response with text and structured content
 */
export function buildToolResponse<T>(
  textContent: string,
  structuredOutput: T
): { content: Array<{ type: "text"; text: string }>; structuredContent: T } {
  // Truncate if exceeds character limit
  let finalText = textContent;
  if (textContent.length > CHARACTER_LIMIT) {
    finalText = textContent.substring(0, CHARACTER_LIMIT - 100) +
      "\n\n---\n*Response truncated. Use filters or pagination to see more results.*";
  }

  return {
    content: [{ type: "text", text: finalText }],
    structuredContent: structuredOutput
  };
}

/**
 * Build an error response
 */
export function buildErrorResponse(error: unknown): {
  isError: true;
  content: Array<{ type: "text"; text: string }>;
} {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: "text", text: message }]
  };
}

/**
 * Format pagination info for markdown
 */
export function formatPaginationInfo(
  total: number,
  page: number,
  limit: number,
  showing: number
): string {
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit + 1;
  const end = start + showing - 1;
  return `Showing ${start}-${end} of ${total} (page ${page}/${totalPages})`;
}

/**
 * Build pagination metadata for structured output
 */
export function buildPaginationMeta(
  total: number,
  page: number,
  limit: number,
  count: number
): {
  total: number;
  page: number;
  limit: number;
  count: number;
  has_more: boolean;
  total_pages: number;
} {
  const totalPages = Math.ceil(total / limit);
  return {
    total,
    page,
    limit,
    count,
    has_more: page < totalPages,
    total_pages: totalPages
  };
}

/**
 * Generic list formatter for markdown output
 */
export function formatListMarkdown<T>(
  title: string,
  items: T[],
  total: number,
  page: number,
  limit: number,
  itemFormatter: (item: T) => string
): string {
  if (items.length === 0) {
    return `# ${title}\n\nNo results found.`;
  }

  const lines: string[] = [
    `# ${title}`,
    "",
    formatPaginationInfo(total, page, limit, items.length),
    ""
  ];

  for (const item of items) {
    lines.push(itemFormatter(item));
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Generic detail formatter for markdown output
 */
export function formatDetailMarkdown(
  title: string,
  fields: Array<{ label: string; value: string | number | boolean | undefined }>
): string {
  const lines: string[] = [`# ${title}`, ""];

  for (const field of fields) {
    if (field.value !== undefined && field.value !== null && field.value !== "") {
      const displayValue = typeof field.value === "boolean"
        ? formatBoolean(field.value)
        : String(field.value);
      lines.push(`- **${field.label}**: ${displayValue}`);
    }
  }

  return lines.join("\n");
}

// BI Analytics Formatting Functions

/**
 * Format a trend indicator with arrow and percentage
 *
 * @param change - The percentage change
 * @returns Formatted trend string like "↑ +15.2%" or "↓ -8.5%"
 */
export function formatTrend(change: number): string {
  if (Math.abs(change) < 0.1) {
    return "→ 0%";
  }

  const arrow = change > 0 ? "↑" : "↓";
  const sign = change > 0 ? "+" : "";
  return `${arrow} ${sign}${change.toFixed(1)}%`;
}

/**
 * Format growth comparison data
 */
export interface GrowthData {
  current: number;
  previous: number;
  change: number;
  percentChange: number;
}

/**
 * Format a comparison row for markdown tables
 */
export function formatComparisonRow(
  label: string,
  current: number,
  previous: number,
  isCount = false
): string {
  const change = current - previous;
  const percentChange = previous !== 0 ? (change / previous) * 100 : (current > 0 ? 100 : 0);

  const currentStr = isCount ? current.toString() : formatMoney(current);
  const previousStr = isCount ? previous.toString() : formatMoney(previous);
  const trendStr = formatTrend(percentChange);

  return `| ${label} | ${currentStr} | ${previousStr} | ${trendStr} |`;
}

/**
 * Format a comparison table header
 */
export function formatComparisonTableHeader(
  currentLabel: string,
  previousLabel: string
): string[] {
  return [
    `| Metric | ${currentLabel} | ${previousLabel} | Change |`,
    "|--------|-------|----------|--------|"
  ];
}

/**
 * Format a funnel stage row
 */
export function formatFunnelStage(
  stage: string,
  count: number,
  value: number,
  conversionRate?: number
): string {
  const rateStr = conversionRate !== undefined ? ` (${conversionRate.toFixed(1)}%)` : "";
  return `| ${stage} | ${count} | ${formatMoney(value)} |${rateStr}`;
}

/**
 * Format a funnel visualization in markdown
 */
export function formatFunnelVisualization(stages: Array<{
  name: string;
  count: number;
  value: number;
  conversionFromPrevious?: number;
}>): string {
  const lines: string[] = [
    "## Sales Funnel",
    "",
    "| Stage | Count | Value | Conversion |",
    "|-------|-------|-------|------------|"
  ];

  for (const stage of stages) {
    const conversionStr = stage.conversionFromPrevious !== undefined
      ? `${stage.conversionFromPrevious.toFixed(1)}%`
      : "-";
    lines.push(`| ${stage.name} | ${stage.count} | ${formatMoney(stage.value)} | ${conversionStr} |`);
  }

  return lines.join("\n");
}

/**
 * Format a cash flow projection table
 */
export function formatCashFlowTable(periods: Array<{
  period: string;
  inflows: number;
  outflows: number;
  netFlow: number;
  runningBalance: number;
}>): string {
  const lines: string[] = [
    "| Period | Inflows | Outflows | Net Flow | Balance |",
    "|--------|---------|----------|----------|---------|"
  ];

  for (const p of periods) {
    lines.push(
      `| ${p.period} | ${formatMoney(p.inflows)} | ${formatMoney(p.outflows)} | ${formatMoney(p.netFlow)} | ${formatMoney(p.runningBalance)} |`
    );
  }

  return lines.join("\n");
}

/**
 * Format percentage with sign
 */
export function formatPercent(value: number, decimals = 1): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

/**
 * Format a ranking table for top N items
 */
export function formatRankingTable(
  headers: string[],
  rows: string[][]
): string {
  const headerLine = `| ${headers.join(" | ")} |`;
  const separatorLine = `|${headers.map(() => "------").join("|")}|`;

  const lines = [headerLine, separatorLine];
  for (const row of rows) {
    lines.push(`| ${row.join(" | ")} |`);
  }

  return lines.join("\n");
}

/**
 * Format a simple bar for ASCII visualization
 */
export function formatBar(value: number, maxValue: number, width = 20): string {
  if (maxValue === 0) return "";
  const filled = Math.round((value / maxValue) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

/**
 * Format margin/profitability with color indicator
 */
export function formatMargin(margin: number): string {
  const percentStr = `${margin.toFixed(1)}%`;
  if (margin >= 30) return `${percentStr} (Good)`;
  if (margin >= 15) return `${percentStr} (OK)`;
  if (margin >= 0) return `${percentStr} (Low)`;
  return `${percentStr} (Loss)`;
}
