import { AsyncLocalStorage } from "async_hooks";
import { RequestContext } from "./types.js";

// Passes user context through call stack
export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return requestContext.getStore();
}

export function getCurrentUserId(): string | undefined {
  return requestContext.getStore()?.userId;
}

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return requestContext.run(context, fn);
}

export async function runWithContextAsync<T>(
  context: RequestContext,
  fn: () => Promise<T>
): Promise<T> {
  return requestContext.run(context, fn);
}
