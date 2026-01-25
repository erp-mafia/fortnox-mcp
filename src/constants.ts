// Fortnox API Configuration
export const FORTNOX_API_BASE_URL = "https://api.fortnox.se";
export const FORTNOX_OAUTH_URL = "https://apps.fortnox.se/oauth-v1";

// Rate limiting: 25 requests per 5 seconds
export const RATE_LIMIT_REQUESTS = 25;
export const RATE_LIMIT_WINDOW_MS = 5000;

// Response limits
export const CHARACTER_LIMIT = 25000;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Token expiry buffer (refresh 5 minutes before expiry)
export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

// Response format enum
export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json"
}
