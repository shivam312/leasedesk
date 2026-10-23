// Reporting errors on the server. Code calls reportError(...) instead of
// console.error: it always writes to the log, and also sends the error to
// Sentry when SENTRY_DSN is set (see options.ts). Without one it's the same
// as console.error, and the Sentry code is never loaded (D41).
//
// Browser code (error pages) uses "@/lib/monitoring/client" instead, which
// doesn't pull in next/server.

import { after } from "next/server";
import { type Ids, logError, sendToSentry } from "./send";

export { monitoringOptions, scrubEvent } from "./options";

// How long a report may hold the function open after the response.
const FLUSH_MS = 2000;

/**
 * Logs an error with a short message saying what failed, plus ids that help
 * find it (never names, amounts or other tenant details).
 */
export function reportError(message: string, error: unknown, ids: Ids = {}) {
  logError(message, error, ids);
  if (!process.env.SENTRY_DSN?.trim()) return;
  // On serverless hosting the function can stop once the action or route has
  // returned, so the send is handed to after(), which keeps it alive until
  // the report is flushed (at most FLUSH_MS).
  const sent = sendToSentry(message, error, ids, FLUSH_MS);
  try {
    after(sent);
  } catch {
    // Outside a request (a script or test) there is no after(); the send
    // still runs on its own.
  }
}
