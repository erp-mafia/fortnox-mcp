/**
 * Vercel Serverless Entry Point
 *
 * This file handles requests in Vercel's serverless environment.
 * It creates the remote server and handles all incoming requests.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createRemoteServer } from "../src/server/remote.js";
import { getStorageFromEnv } from "../src/auth/storage/index.js";

// Validate required environment variables
function validateEnv(): void {
  const required = ["SERVER_URL", "JWT_SECRET"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

// Create the Express app once (reused across invocations)
let app: ReturnType<typeof createRemoteServer> | null = null;

function getApp() {
  if (!app) {
    validateEnv();
    const tokenStorage = getStorageFromEnv();
    app = createRemoteServer({
      serverUrl: process.env.SERVER_URL!,
      jwtSecret: process.env.JWT_SECRET!,
      tokenStorage,
    });
  }
  return app;
}

// Vercel serverless handler
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  // Get or create the Express app
  const expressApp = getApp();

  // Convert Vercel request to Express-compatible format and handle
  return new Promise<void>((resolve) => {
    expressApp(req as any, res as any, () => {
      resolve();
    });
  });
}
