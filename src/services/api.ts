import axios, { AxiosError, AxiosRequestConfig } from "axios";
import { getFortnoxAuth } from "./auth.js";
import {
  FORTNOX_API_BASE_URL,
  RATE_LIMIT_REQUESTS,
  RATE_LIMIT_WINDOW_MS
} from "../constants.js";

// Rate limiting state
let requestTimestamps: number[] = [];

/**
 * Simple rate limiter for Fortnox API (25 requests per 5 seconds)
 */
async function waitForRateLimit(): Promise<void> {
  const now = Date.now();

  // Remove timestamps outside the window
  requestTimestamps = requestTimestamps.filter(
    (ts) => now - ts < RATE_LIMIT_WINDOW_MS
  );

  // If at limit, wait for oldest request to expire
  if (requestTimestamps.length >= RATE_LIMIT_REQUESTS) {
    const oldestTimestamp = requestTimestamps[0];
    const waitTime = RATE_LIMIT_WINDOW_MS - (now - oldestTimestamp) + 50; // +50ms buffer
    if (waitTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    // Clean up again after waiting
    requestTimestamps = requestTimestamps.filter(
      (ts) => Date.now() - ts < RATE_LIMIT_WINDOW_MS
    );
  }

  requestTimestamps.push(Date.now());
}

/**
 * Make an authenticated request to the Fortnox API
 */
export async function fortnoxRequest<T>(
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  data?: unknown,
  params?: Record<string, string | number | boolean | undefined>
): Promise<T> {
  await waitForRateLimit();

  const auth = getFortnoxAuth();
  const accessToken = await auth.getAccessToken();

  // Clean undefined params
  const cleanParams: Record<string, string | number | boolean> = {};
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        cleanParams[key] = value;
      }
    }
  }

  const config: AxiosRequestConfig = {
    method,
    url: `${FORTNOX_API_BASE_URL}${endpoint}`,
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    timeout: 30000,
    params: Object.keys(cleanParams).length > 0 ? cleanParams : undefined,
    data
  };

  try {
    const response = await axios(config);
    return response.data;
  } catch (error) {
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
          `${prefix}Permission denied. Your API credentials don't have access to this resource. ` +
          `Check your Fortnox app scopes.`
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
