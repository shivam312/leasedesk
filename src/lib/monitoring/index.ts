// Reporting errors. Code calls reportError(...) instead of console.error: it
// always writes to the log, and also sends the error to Sentry when a DSN is
// set (see options.ts). Without one it's the same as console.error, and the
// Sentry code is never loaded, in the browser or on the server (D41).

export { monitoringOptions, scrubEvent } from "./options";

type Ids = Record<string, string | number | null | undefined>;

function enabled(): boolean {
  // NEXT_PUBLIC_ variables are written into the browser bundle at build time.
  return typeof window === "undefined"
    ? Boolean(process.env.SENTRY_DSN?.trim())
    : Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN?.trim());
}

/**
 * Logs an error with a short message saying what failed, plus ids that help
 * find it (never names, amounts or other tenant details).
 */
export function reportError(message: string, error: unknown, ids: Ids = {}) {
  const parts = Object.values(ids).filter((v) => v != null);
  console.error(message, ...parts, error);
  if (!enabled()) return;
  void import("@sentry/nextjs")
    .then((Sentry) => {
      if (!Sentry.getClient()) return;
      Sentry.withScope((scope) => {
        scope.setContext("details", { message, ...ids });
        scope.setTag("failed", message);
        Sentry.captureException(error);
      });
    })
    .catch(() => {
      // Reporting must never break the page or action that failed.
    });
}
