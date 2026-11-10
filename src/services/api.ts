import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";
import { getTokenProvider } from "../auth/index.js";
import { getRequestContext } from "../auth/context.js";
import {
  FORTNOX_API_BASE_URL,
  RATE_LIMIT_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_RETRIES,
  RATE_LIMIT_RETRY_BASE_MS,
  MAX_FETCH_ALL_RESULTS,
  MAX_FETCH_ALL_PAGES,
  FETCH_ALL_PAGE_SIZE,
  FETCH_ALL_DELAY_MS,
  FORTNOX_MISSING_SCOPE_CODE
} from "../constants.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sliding-window rate limiter shared by every request in the process.
 *
 * Each caller reserves a start time synchronously before awaiting, so concurrent
 * callers queue up behind each other instead of all waking at once and bursting
 * past the limit.
 */
export class RateLimiter {
  private reservations: number[] = [];

  constructor(
    private maxRequests: number,
    private windowMs: number,
    private bufferMs = 50
  ) {}

  configure(maxRequests: number, windowMs: number, bufferMs = this.bufferMs): void {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.bufferMs = bufferMs;
    this.reservations = [];
  }

  async acquire(): Promise<void> {
    const now = Date.now();
    // Keep reservations still inside the window, including future ones
    this.reservations = this.reservations.filter((t) => t > now - this.windowMs);

    let start = now;
    if (this.reservations.length >= this.maxRequests) {
      const blocking = this.reservations[this.reservations.length - this.maxRequests];
      start = blocking + this.windowMs + this.bufferMs;
    }
    const last = this.reservations[this.reservations.length - 1];
    if (last !== undefined && start < last) start = last;

    this.reservations.push(start);
    if (start > now) {
      await sleep(start - now);
    }
  }
}

/** Fortnox allows 25 requests per 5 seconds per access token */
export const apiRateLimiter = new RateLimiter(RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW_MS);

/** Each company has its own Fortnox budget, so each profile gets its own limiter */
const companyRateLimiters = new Map<string, RateLimiter>();
const rateLimiterSettings = { maxRequests: RATE_LIMIT_REQUESTS, windowMs: RATE_LIMIT_WINDOW_MS, bufferMs: 50 };

/** Reconfigure every rate limiter, including those for profiles created later (used by tests) */
export function configureRateLimiters(maxRequests: number, windowMs: number, bufferMs = 50): void {
  Object.assign(rateLimiterSettings, { maxRequests, windowMs, bufferMs });
  apiRateLimiter.configure(maxRequests, windowMs, bufferMs);
  for (const limiter of companyRateLimiters.values()) {
    limiter.configure(maxRequests, windowMs, bufferMs);
  }
}

function currentRateLimiter(): RateLimiter {
  const profile = getRequestContext()?.company?.profile;
  if (!profile) return apiRateLimiter;
  let limiter = companyRateLimiters.get(profile);
  if (!limiter) {
    limiter = new RateLimiter(rateLimiterSettings.maxRequests, rateLimiterSettings.windowMs, rateLimiterSettings.bufferMs);
    companyRateLimiters.set(profile, limiter);
  }
  return limiter;
}

/** Retry settings for HTTP 429 responses (mutable so tests can shorten the delays) */
export const rateLimitRetryConfig = {
  maxRetries: RATE_LIMIT_MAX_RETRIES,
  baseDelayMs: RATE_LIMIT_RETRY_BASE_MS
};

function retryDelayMs(error: AxiosError, attempt: number): number {
  const retryAfter = Number(error.response?.headers?.["retry-after"]);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return retryAfter * 1000;
  }
  const backoff = rateLimitRetryConfig.baseDelayMs * 2 ** attempt;
  return backoff + Math.random() * rateLimitRetryConfig.baseDelayMs;
}

/**
 * Send a request through the shared rate limiter, retrying with backoff on HTTP 429.
 * The limiter only sees this process; other processes using the same token (e.g. a
 * second MCP client) share Fortnox's budget, so 429s can still happen and are retried.
 */
async function sendWithRetry<T>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
  for (let attempt = 0; ; attempt++) {
    await currentRateLimiter().acquire();
    try {
      return await axios<T>(config);
    } catch (error) {
      const isRateLimited = error instanceof AxiosError && error.response?.status === 429;
      if (!isRateLimited || attempt >= rateLimitRetryConfig.maxRetries) {
        throw error;
      }
      await sleep(retryDelayMs(error, attempt));
    }
  }
}

function cleanQueryParams(
  params?: Record<string, string | number | boolean | undefined>
): Record<string, string | number | boolean> | undefined {
  const cleanParams: Record<string, string | number | boolean> = {};
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        cleanParams[key] = value;
      }
    }
  }
  return Object.keys(cleanParams).length > 0 ? cleanParams : undefined;
}

async function getAccessToken(): Promise<string> {
  const context = getRequestContext();
  // Multi-company local mode: the tool call names the company profile
  if (context?.company) {
    return context.company.tokenProvider.getAccessToken();
  }
  // In local mode, userId is undefined and ignored
  // In remote mode, userId comes from the request context
  return getTokenProvider().getAccessToken(context?.userId);
}

/**
 * Make an authenticated request to the Fortnox API
 * Automatically uses the current user context in remote mode
 */
export async function fortnoxRequest<T>(
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  data?: unknown,
  params?: Record<string, string | number | boolean | undefined>
): Promise<T> {
  try {
    const accessToken = await getAccessToken();
    const response = await sendWithRetry<T>({
      method,
      url: `${FORTNOX_API_BASE_URL}${endpoint}`,
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      timeout: 30000,
      params: cleanQueryParams(params),
      data
    });
    return response.data;
  } catch (error) {
    throw handleApiError(error, endpoint);
  }
}

/**
 * A file downloaded from the Fortnox API
 */
export interface DownloadedFile {
  data: Buffer;
  contentType: string | null;
  fileName: string | null;
}

function fileNameFromContentDisposition(header: unknown): string | null {
  if (typeof header !== "string") return null;
  const encoded = header.match(/filename\*=(?:UTF-8'')?([^;]+)/i);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim().replace(/^"|"$/g, ""));
    } catch {
      // fall through to the plain filename
    }
  }
  const plain = header.match(/filename="?([^";]+)"?/i);
  return plain ? plain[1].trim() : null;
}

/**
 * Download a binary file (GET) from the Fortnox API
 */
export async function fortnoxDownload(
  endpoint: string,
  params?: Record<string, string | number | boolean | undefined>
): Promise<DownloadedFile> {
  try {
    const accessToken = await getAccessToken();
    const response = await sendWithRetry<ArrayBuffer>({
      method: "GET",
      url: `${FORTNOX_API_BASE_URL}${endpoint}`,
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "*/*"
      },
      timeout: 60000,
      params: cleanQueryParams(params),
      responseType: "arraybuffer"
    });
    const contentType = response.headers["content-type"];
    return {
      data: Buffer.from(response.data),
      contentType: typeof contentType === "string" ? contentType : null,
      fileName: fileNameFromContentDisposition(response.headers["content-disposition"])
    };
  } catch (error) {
    // Error bodies arrive as bytes with responseType arraybuffer; decode them for handleApiError
    if (error instanceof AxiosError && error.response?.data instanceof ArrayBuffer) {
      try {
        error.response.data = JSON.parse(Buffer.from(error.response.data).toString("utf8"));
      } catch {
        // leave the body as-is
      }
    }
    throw handleApiError(error, endpoint);
  }
}

/**
 * Handle API errors with descriptive messages
 */
export function handleApiError(error: unknown, context?: string): Error {
  const prefix = context ? `[${context}] ` : "";

  if (error instanceof AxiosError) {
    const status = error.response?.status;
    const data = error.response?.data;

    // Extract Fortnox-specific error message
    const fortnoxError = data?.ErrorInformation?.message ||
      data?.ErrorInformation?.Message ||
      data?.message ||
      data?.error;

    // Fortnox reports a scope the token wasn't granted as 400 with this code, not 403
    const fortnoxCode = Number(data?.ErrorInformation?.code ?? data?.ErrorInformation?.Code);
    if (fortnoxCode === FORTNOX_MISSING_SCOPE_CODE) {
      return new Error(
        `${prefix}Missing OAuth scope: ${fortnoxError || "the access token lacks the scope for this resource"}. ` +
        `Enable the required scope for the app in the Fortnox developer portal and re-authorize ` +
        `(existing tokens keep the scopes they were issued with).`
      );
    }

    switch (status) {
      case 400:
        return new Error(
          `${prefix}Bad request: ${fortnoxError || "Invalid parameters"}. ` +
          `Check that all required fields are provided and values are valid.`
        );
      case 401:
        return new Error(
          `${prefix}Authentication failed. The access token may be expired or invalid. ` +
          `Try refreshing authentication.`
        );
      case 403:
        return new Error(
          `${prefix}Permission denied: ${fortnoxError || "Your API credentials don't have access to this resource"}. ` +
          `Check that the required scope was granted when authorizing (re-authorize after adding scopes) ` +
          `and that the Fortnox user has permission for this action.`
        );
      case 404:
        return new Error(
          `${prefix}Resource not found. The requested item does not exist or has been deleted.`
        );
      case 429:
        return new Error(
          `${prefix}Rate limit exceeded. Fortnox allows 25 requests per 5 seconds. ` +
          `Please wait before retrying.`
        );
      case 500:
      case 502:
      case 503:
        return new Error(
          `${prefix}Fortnox server error (${status}). The service may be temporarily unavailable. ` +
          `Please try again later.`
        );
      default:
        return new Error(
          `${prefix}API error ${status}: ${fortnoxError || JSON.stringify(data)}`
        );
    }
  }

  if (error instanceof Error) {
    if (error.message.includes("ECONNABORTED") || error.message.includes("timeout")) {
      return new Error(
        `${prefix}Request timed out. The Fortnox API is not responding. Please try again.`
      );
    }
    if (error.message.includes("ENOTFOUND") || error.message.includes("ECONNREFUSED")) {
      return new Error(
        `${prefix}Cannot connect to Fortnox API. Check your internet connection.`
      );
    }
    return new Error(`${prefix}${error.message}`);
  }

  return new Error(`${prefix}Unexpected error: ${String(error)}`);
}

/**
 * Format a date for Fortnox API (YYYY-MM-DD)
 */
export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Parse a Fortnox date string to Date object
 */
export function parseDate(dateStr: string): Date {
  return new Date(dateStr);
}

/**
 * Configuration for fetchAllPages
 */
export interface FetchAllConfig {
  /** Maximum total results to fetch (default: MAX_FETCH_ALL_RESULTS) */
  maxResults?: number;
  /** Maximum pages to fetch (default: MAX_FETCH_ALL_PAGES) */
  maxPages?: number;
  /** Page size for each request (default: FETCH_ALL_PAGE_SIZE) */
  pageSize?: number;
  /** Delay between page requests in ms (default: FETCH_ALL_DELAY_MS) */
  delayBetweenPages?: number;
}

/**
 * Result from fetchAllPages
 */
export interface FetchAllResult<T> {
  /** All items fetched */
  items: T[];
  /** Total count from API (may be higher than items.length if truncated) */
  total: number;
  /** Number of pages fetched */
  pagesFetched: number;
  /** Whether results were truncated due to limits */
  truncated: boolean;
  /** Reason for truncation if truncated is true */
  truncationReason?: string;
}

/**
 * Fetch all pages of a paginated Fortnox API endpoint
 *
 * This function automatically paginates through all results from a Fortnox endpoint.
 * It includes safety limits to prevent runaway queries and respects rate limits.
 *
 * @param endpoint - API endpoint (e.g., "/3/invoices")
 * @param params - Query parameters to pass to each request
 * @param extractItems - Function to extract items array from response
 * @param extractTotal - Function to extract total count from response
 * @param config - Optional configuration for limits and delays
 * @returns All items fetched with metadata about the fetch operation
 *
 * @example
 * const result = await fetchAllPages<Invoice, InvoiceListResponse>(
 *   "/3/invoices",
 *   { filter: "unpaid" },
 *   (r) => r.Invoices || [],
 *   (r) => r.MetaInformation?.["@TotalResources"] || 0
 * );
 */
export async function fetchAllPages<T, R>(
  endpoint: string,
  params: Record<string, string | number | boolean | undefined>,
  extractItems: (response: R) => T[],
  extractTotal: (response: R) => number,
  config?: FetchAllConfig
): Promise<FetchAllResult<T>> {
  const maxResults = config?.maxResults ?? MAX_FETCH_ALL_RESULTS;
  const maxPages = config?.maxPages ?? MAX_FETCH_ALL_PAGES;
  const pageSize = config?.pageSize ?? FETCH_ALL_PAGE_SIZE;
  const delayMs = config?.delayBetweenPages ?? FETCH_ALL_DELAY_MS;

  const allItems: T[] = [];
  let page = 1;
  let total = 0;
  let hasMore = true;
  let truncated = false;
  let truncationReason: string | undefined;

  while (hasMore) {
    // Check page limit
    if (page > maxPages) {
      truncated = true;
      truncationReason = `Reached maximum page limit (${maxPages} pages). Use filters to narrow results.`;
      break;
    }

    // Check result limit
    if (allItems.length >= maxResults) {
      truncated = true;
      truncationReason = `Reached maximum result limit (${maxResults} items). Use filters to narrow results.`;
      break;
    }

    // Make request
    const response = await fortnoxRequest<R>(endpoint, "GET", undefined, {
      ...params,
      limit: pageSize,
      page
    });

    const items = extractItems(response);
    total = extractTotal(response);

    if (items.length === 0) {
      hasMore = false;
    } else {
      allItems.push(...items);

      // Check if we've fetched all available items
      if (allItems.length >= total) {
        hasMore = false;
      } else {
        page++;
        // Delay to respect rate limits (except on last page)
        if (hasMore) {
          await sleep(delayMs);
        }
      }
    }
  }

  return {
    items: allItems,
    total,
    pagesFetched: page,
    truncated,
    truncationReason
  };
}
