// Sentry settings, worked out from the environment. With no DSN this returns
// null and Sentry is never started, so local work, tests and the pipeline
// send nothing anywhere. Creating the Sentry project and setting SENTRY_DSN
// (and NEXT_PUBLIC_SENTRY_DSN for the browser) is a human task (D41).

type Env = Record<string, string | undefined>;

/** The parts of a Sentry event we clean before it leaves the server. */
export type ReportableEvent = {
  request?: {
    data?: unknown;
    cookies?: unknown;
    headers?: Record<string, string>;
    query_string?: unknown;
  };
  user?: { id?: string | number; [key: string]: unknown };
};

export type MonitoringOptions = {
  dsn: string;
  environment: string;
  release?: string;
  sendDefaultPii: false;
  tracesSampleRate: number;
  beforeSend: <E extends ReportableEvent>(event: E) => E;
};

const SAFE_HEADERS = new Set(["user-agent", "referer", "content-type"]);

/**
 * Keeps tenant and payment details out of error reports: form bodies,
 * cookies, query strings and every header except a few harmless ones are
 * dropped, and a user is reported by id only, never email or name.
 */
export function scrubEvent<E extends ReportableEvent>(event: E): E {
  if (event.request) {
    const { headers } = event.request;
    event.request = {
      ...event.request,
      data: undefined,
      cookies: undefined,
      query_string: undefined,
      headers: headers
        ? Object.fromEntries(
            Object.entries(headers).filter(([k]) =>
              SAFE_HEADERS.has(k.toLowerCase()),
            ),
          )
        : undefined,
    };
  }
  if (event.user) event.user = { id: event.user.id };
  return event;
}

/**
 * Options for Sentry.init, or null when error reporting is off.
 * `side` picks the variable: the browser can only see NEXT_PUBLIC_ ones.
 */
export function monitoringOptions(
  env: Env,
  side: "server" | "browser",
): MonitoringOptions | null {
  const dsn = (
    side === "browser" ? env.NEXT_PUBLIC_SENTRY_DSN : env.SENTRY_DSN
  )?.trim();
  if (!dsn) return null;
  const environment =
    (side === "browser"
      ? env.NEXT_PUBLIC_SENTRY_ENVIRONMENT
      : env.SENTRY_ENVIRONMENT
    )?.trim() || "production";
  return {
    dsn,
    environment,
    release: env.VERCEL_GIT_COMMIT_SHA?.trim() || undefined,
    sendDefaultPii: false,
    // Errors only: performance tracing costs quota and isn't needed for the pilot.
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
  };
}
