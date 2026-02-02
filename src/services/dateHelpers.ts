/**
 * Date Helper Utilities for Analytics
 *
 * Provides convenience functions for converting period strings to date ranges
 * and calculating aging buckets for unpaid invoices.
 */

export type DatePeriod =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "last_quarter"
  | "this_year"
  | "last_year";

export interface DateRange {
  from_date: string;
  to_date: string;
}

export type AgeBucket = "1-30 days" | "31-60 days" | "61-90 days" | "90+ days" | "not_due";

/**
 * Format a date as YYYY-MM-DD string
 */
function formatDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Get start of week (Monday) for a given date
 */
function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get end of week (Sunday) for a given date
 */
function getEndOfWeek(date: Date): Date {
  const start = getStartOfWeek(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return end;
}

/**
 * Get the quarter (0-3) for a given month (0-11)
 */
function getQuarter(month: number): number {
  return Math.floor(month / 3);
}

/**
 * Convert a period string to a date range
 *
 * @param period - Period identifier like "last_month", "this_quarter", etc.
 * @returns Object with from_date and to_date in YYYY-MM-DD format
 *
 * @example
 * periodToDateRange("last_month") // { from_date: "2025-05-01", to_date: "2025-05-31" }
 */
export function periodToDateRange(period: DatePeriod): DateRange {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (period) {
    case "today": {
      const dateStr = formatDateString(today);
      return { from_date: dateStr, to_date: dateStr };
    }

    case "yesterday": {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = formatDateString(yesterday);
      return { from_date: dateStr, to_date: dateStr };
    }

    case "this_week": {
      const start = getStartOfWeek(today);
      const end = getEndOfWeek(today);
      return {
        from_date: formatDateString(start),
        to_date: formatDateString(end)
      };
    }

    case "last_week": {
      const lastWeekDate = new Date(today);
      lastWeekDate.setDate(lastWeekDate.getDate() - 7);
      const start = getStartOfWeek(lastWeekDate);
      const end = getEndOfWeek(lastWeekDate);
      return {
        from_date: formatDateString(start),
        to_date: formatDateString(end)
      };
    }

    case "this_month": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return {
        from_date: formatDateString(start),
        to_date: formatDateString(end)
      };
    }

    case "last_month": {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return {
        from_date: formatDateString(start),
        to_date: formatDateString(end)
      };
    }

    case "this_quarter": {
      const quarter = getQuarter(today.getMonth());
      const start = new Date(today.getFullYear(), quarter * 3, 1);
      const end = new Date(today.getFullYear(), quarter * 3 + 3, 0);
      return {
        from_date: formatDateString(start),
        to_date: formatDateString(end)
      };
    }

    case "last_quarter": {
      const currentQuarter = getQuarter(today.getMonth());
      let year = today.getFullYear();
      let quarter = currentQuarter - 1;
      if (quarter < 0) {
        quarter = 3;
        year -= 1;
      }
      const start = new Date(year, quarter * 3, 1);
      const end = new Date(year, quarter * 3 + 3, 0);
      return {
        from_date: formatDateString(start),
        to_date: formatDateString(end)
      };
    }

    case "this_year": {
      const start = new Date(today.getFullYear(), 0, 1);
      const end = new Date(today.getFullYear(), 11, 31);
      return {
        from_date: formatDateString(start),
        to_date: formatDateString(end)
      };
    }

    case "last_year": {
      const year = today.getFullYear() - 1;
      const start = new Date(year, 0, 1);
      const end = new Date(year, 11, 31);
      return {
        from_date: formatDateString(start),
        to_date: formatDateString(end)
      };
    }

    default: {
      // Exhaustive check
      const _exhaustive: never = period;
      throw new Error(`Unknown period: ${_exhaustive}`);
    }
  }
}

/**
 * Calculate the aging bucket for an unpaid invoice based on its due date
 *
 * @param dueDate - Due date in YYYY-MM-DD format
 * @returns Aging bucket category
 *
 * @example
 * getAgeBucket("2025-01-15") // "31-60 days" (if today is 2025-02-20)
 */
export function getAgeBucket(dueDate: string | undefined): AgeBucket {
  if (!dueDate) return "not_due";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);

  // If due date is in the future, not yet due
  if (due >= today) {
    return "not_due";
  }

  // Calculate days overdue
  const diffTime = today.getTime() - due.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= 30) return "1-30 days";
  if (diffDays <= 60) return "31-60 days";
  if (diffDays <= 90) return "61-90 days";
  return "90+ days";
}

/**
 * Get a human-readable description of a date period
 */
export function getPeriodDescription(period: DatePeriod): string {
  const descriptions: Record<DatePeriod, string> = {
    today: "Today",
    yesterday: "Yesterday",
    this_week: "This week",
    last_week: "Last week",
    this_month: "This month",
    last_month: "Last month",
    this_quarter: "This quarter",
    last_quarter: "Last quarter",
    this_year: "This year",
    last_year: "Last year"
  };
  return descriptions[period];
}

/**
 * Get the previous equivalent period for comparison
 *
 * @param period - Current period
 * @returns The previous equivalent period
 *
 * @example
 * getPreviousPeriod("this_month") // "last_month"
 * getPreviousPeriod("this_quarter") // "last_quarter"
 */
export function getPreviousPeriod(period: DatePeriod): DatePeriod {
  const mapping: Record<DatePeriod, DatePeriod> = {
    today: "yesterday",
    yesterday: "yesterday", // Can't go further back simply
    this_week: "last_week",
    last_week: "last_week", // Would need custom logic for 2 weeks ago
    this_month: "last_month",
    last_month: "last_month", // Would need custom logic
    this_quarter: "last_quarter",
    last_quarter: "last_quarter", // Would need custom logic
    this_year: "last_year",
    last_year: "last_year" // Would need custom logic
  };
  return mapping[period];
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
 * Get quarter number (1-4) for a date
 */
export function getQuarterNumber(date: Date): number {
  return Math.floor(date.getMonth() / 3) + 1;
}

/**
 * Interface for period comparison results
 */
export interface PeriodComparison {
  currentPeriod: {
    period: DatePeriod;
    description: string;
    dateRange: DateRange;
  };
  previousPeriod: {
    period: DatePeriod;
    description: string;
    dateRange: DateRange;
  };
}

/**
 * Compare two periods and get their date ranges
 *
 * @param currentPeriod - The current period to analyze
 * @param comparePeriod - Optional period to compare to (defaults to previous equivalent)
 * @returns Period comparison with date ranges
 */
export function comparePeriods(
  currentPeriod: DatePeriod,
  comparePeriod?: DatePeriod
): PeriodComparison {
  const previousPeriod = comparePeriod || getPreviousPeriod(currentPeriod);

  return {
    currentPeriod: {
      period: currentPeriod,
      description: getPeriodDescription(currentPeriod),
      dateRange: periodToDateRange(currentPeriod)
    },
    previousPeriod: {
      period: previousPeriod,
      description: getPeriodDescription(previousPeriod),
      dateRange: periodToDateRange(previousPeriod)
    }
  };
}

/**
 * Get date ranges for the last N years
 *
 * @param years - Number of years to get (including current year)
 * @returns Array of year info with date ranges
 */
export function getLastNYears(years: number): Array<{
  year: number;
  dateRange: DateRange;
}> {
  const currentYear = new Date().getFullYear();
  const result: Array<{ year: number; dateRange: DateRange }> = [];

  for (let i = 0; i < years; i++) {
    const year = currentYear - i;
    result.push({
      year,
      dateRange: {
        from_date: `${year}-01-01`,
        to_date: `${year}-12-31`
      }
    });
  }

  return result;
}

/**
 * Get the number of days between two dates
 */
export function daysBetween(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Check if a date falls within a due date range
 */
export function isDueDateInRange(
  dueDate: string | undefined,
  fromDate: string,
  toDate: string
): boolean {
  if (!dueDate) return false;
  return dueDate >= fromDate && dueDate <= toDate;
}

/**
 * Get future date from today
 */
export function getFutureDate(daysAhead: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return date.toISOString().split("T")[0];
}

/**
 * Get today's date as string
 */
export function getTodayString(): string {
  return new Date().toISOString().split("T")[0];
}
