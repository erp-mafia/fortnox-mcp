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
