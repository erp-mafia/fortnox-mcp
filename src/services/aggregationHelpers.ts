/**
 * Aggregation Helper Utilities for BI Analytics
 *
 * Provides reusable functions for aggregating and analyzing business data.
 */

/**
 * Basic statistics result
 */
export interface BasicStats {
  count: number;
  total: number;
  average: number;
  min: number;
  max: number;
}

/**
 * Growth calculation result
 */
export interface GrowthResult {
  current: number;
  previous: number;
  change: number;
  percentChange: number;
  trend: "up" | "down" | "flat";
}

/**
 * Time bucket for grouping
 */
export type TimeBucket = "week" | "month" | "quarter" | "year";

/**
 * Calculate basic statistics for an array of numbers
 */
export function calculateBasicStats(values: number[]): BasicStats {
  if (values.length === 0) {
    return { count: 0, total: 0, average: 0, min: 0, max: 0 };
  }

  const total = values.reduce((sum, v) => sum + v, 0);
  return {
    count: values.length,
    total,
    average: total / values.length,
    min: Math.min(...values),
    max: Math.max(...values)
  };
}

/**
 * Calculate growth between two values
 */
export function calculateGrowth(current: number, previous: number): GrowthResult {
  const change = current - previous;
  const percentChange = previous !== 0 ? (change / previous) * 100 : current > 0 ? 100 : 0;

  let trend: "up" | "down" | "flat" = "flat";
  if (percentChange > 0.1) trend = "up";
  else if (percentChange < -0.1) trend = "down";

  return {
    current,
    previous,
    change,
    percentChange,
    trend
  };
}

/**
 * Aggregate items by a dimension (key extractor)
 */
export function aggregateByDimension<T>(
  items: T[],
  keyExtractor: (item: T) => string
): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const key = keyExtractor(item);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(item);
  }

  return groups;
}

/**
 * Get ISO week number for a date
 */
export function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Get quarter number for a date (1-4)
 */
export function getQuarterNumber(date: Date): number {
  return Math.floor(date.getMonth() / 3) + 1;
}

/**
 * Get time bucket key for a date
 */
export function getTimeBucketKey(dateStr: string | undefined, bucket: TimeBucket): string {
  if (!dateStr) return "unknown";

  const date = new Date(dateStr);
  const year = date.getFullYear();

  switch (bucket) {
    case "week": {
      const week = getWeekNumber(date);
      return `${year}-W${week.toString().padStart(2, "0")}`;
    }
    case "month":
      return dateStr.substring(0, 7); // YYYY-MM
    case "quarter":
      return `${year}-Q${getQuarterNumber(date)}`;
    case "year":
      return year.toString();
  }
}

/**
 * Group items by time period
 */
export function groupByTimePeriod<T>(
  items: T[],
  dateExtractor: (item: T) => string | undefined,
  bucket: TimeBucket
): Map<string, T[]> {
  return aggregateByDimension(items, (item) => getTimeBucketKey(dateExtractor(item), bucket));
}

/**
 * Sum values from items using a value extractor
 */
export function sumBy<T>(items: T[], valueExtractor: (item: T) => number): number {
  return items.reduce((sum, item) => sum + valueExtractor(item), 0);
}

/**
 * Count unique values by key
 */
export function countUnique<T>(items: T[], keyExtractor: (item: T) => string): number {
  const unique = new Set(items.map(keyExtractor));
  return unique.size;
}

/**
 * Get date range for a number of days ahead from today
 */
export function getFutureDateRange(daysAhead: number): { from_date: string; to_date: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const future = new Date(today);
  future.setDate(future.getDate() + daysAhead);

  return {
    from_date: formatDateString(today),
    to_date: formatDateString(future)
  };
}

/**
 * Format a date as YYYY-MM-DD string
 */
export function formatDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Parse a date string to Date object
 */
export function parseDate(dateStr: string): Date {
  return new Date(dateStr);
}

/**
 * Check if a date falls within a range
 */
export function isDateInRange(
  dateStr: string | undefined,
  from_date?: string,
  to_date?: string
): boolean {
  if (!dateStr) return false;

  const date = new Date(dateStr);
  date.setHours(0, 0, 0, 0);

  if (from_date) {
    const from = new Date(from_date);
    from.setHours(0, 0, 0, 0);
    if (date < from) return false;
  }

  if (to_date) {
    const to = new Date(to_date);
    to.setHours(0, 0, 0, 0);
    if (date > to) return false;
  }

  return true;
}

/**
 * Sort groups by total value descending
 */
export function sortGroupsByTotal<T>(
  groups: Map<string, T[]>,
  valueExtractor: (item: T) => number
): Array<{ key: string; items: T[]; total: number }> {
  return Array.from(groups.entries())
    .map(([key, items]) => ({
      key,
      items,
      total: sumBy(items, valueExtractor)
    }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Calculate running totals for time series
 */
export function calculateRunningTotals(
  values: Array<{ key: string; value: number }>,
  startingBalance = 0
): Array<{ key: string; value: number; runningTotal: number }> {
  let running = startingBalance;
  return values.map(({ key, value }) => {
    running += value;
    return { key, value, runningTotal: running };
  });
}

/**
 * Generate time bucket keys for a date range
 */
export function generateTimeBucketKeys(
  from_date: string,
  to_date: string,
  bucket: "week" | "month"
): string[] {
  const keys: string[] = [];
  const start = new Date(from_date);
  const end = new Date(to_date);

  let current = new Date(start);

  while (current <= end) {
    keys.push(getTimeBucketKey(formatDateString(current), bucket));

    if (bucket === "week") {
      current.setDate(current.getDate() + 7);
    } else {
      current.setMonth(current.getMonth() + 1);
    }
  }

  // Remove duplicates while preserving order
  return [...new Set(keys)];
}
