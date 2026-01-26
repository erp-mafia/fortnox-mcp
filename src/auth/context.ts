import { AsyncLocalStorage } from "async_hooks";
import { RequestContext } from "./types.js";

/**
 * Async local storage for request context
 * Allows passing user context through the call stack without explicit parameter passing
 */
export const requestContext = new AsyncLocalStorage<RequestContext>();

/**
 * Get the current request context
 * Returns undefined if called outside of a request context
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContext.getStore();
}

/**
 * Get the current user ID from the request context
 */
export function getCurrentUserId(): string | undefined {
  return requestContext.getStore()?.userId;
}

/**
 * Run a function within a request context
 */
export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return requestContext.run(context, fn);
}

/**
 * Run an async function within a request context
 */
export async function runWithContextAsync<T>(
  context: RequestContext,
  fn: () => Promise<T>
): Promise<T> {
  return requestContext.run(context, fn);
}
