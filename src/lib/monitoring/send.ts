// The part of reportError shared by the server and the browser: log, then
// send to Sentry. Sentry's code is only loaded when a DSN is set (D41).

export type Ids = Record<string, string | number | null | undefined>;

/** Writes the error to the log with its ids (never names or amounts). */
export function logError(message: string, error: unknown, ids: Ids) {
  const parts = Object.values(ids).filter((v) => v != null);
  console.error(message, ...parts, error);
}

/**
 * Sends the error to Sentry. With `flushMs`, waits up to that long for the
 * report to leave. Never rejects: reporting must never break the page or
 * action that failed.
 */
export async function sendToSentry(
  message: string,
  error: unknown,
  ids: Ids,
  flushMs?: number,
): Promise<void> {
  try {
    const Sentry = await import("@sentry/nextjs");
    if (!Sentry.getClient()) return;
    Sentry.withScope((scope) => {
      scope.setContext("details", { message, ...ids });
      scope.setTag("failed", message);
      Sentry.captureException(error);
    });
    if (flushMs !== undefined) await Sentry.flush(flushMs);
  } catch {
    // Reporting must never break the page or action that failed.
  }
}
