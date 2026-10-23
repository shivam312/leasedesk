// Reporting errors in the browser (error pages). Same as reportError in
// "@/lib/monitoring", but reads NEXT_PUBLIC_SENTRY_DSN, written into the
// bundle at build time, and has no after(): the page keeps running (D41).

import { type Ids, logError, sendToSentry } from "./send";

/**
 * Logs an error with a short message saying what failed, plus ids that help
 * find it (never names, amounts or other tenant details).
 */
export function reportError(message: string, error: unknown, ids: Ids = {}) {
  logError(message, error, ids);
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()) return;
  void sendToSentry(message, error, ids);
}
