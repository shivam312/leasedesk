// Sentry settings, worked out from the environment. With no DSN this returns
// null and Sentry is never started, so local work, tests and the pipeline
// send nothing anywhere. Creating the Sentry project and setting SENTRY_DSN
// (and NEXT_PUBLIC_SENTRY_DSN for the browser) is a human task (D41).

type Env = Record<string, string | undefined>;

/** The parts of a Sentry event we clean before it leaves the server. */
export type ReportableEvent = {
  exception?: {
    values?: {
      type?: string;
      value?: string;
      stacktrace?: { frames?: { vars?: unknown }[] };
    }[];
  };
  contexts?: { [key: string]: object | undefined };
  message?: unknown;
  logentry?: unknown;
  breadcrumbs?: unknown;
  extra?: unknown;
  request?: {
    url?: string;
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
  beforeBreadcrumb: <B extends { category?: string }>(crumb: B) => B | null;
};

const SAFE_HEADERS = new Set(["user-agent", "referer", "content-type"]);

// Contexts that say where and on what the error happened, never what was
// on screen. `details` is reportError's message and ids; `nextjs` has the
// request path, whose query string is cut off below. Anything else (a
// context added later by an integration) is dropped.
const SAFE_CONTEXTS = new Set([
  "details",
  "nextjs",
  "os",
  "runtime",
  "app",
  "device",
  "browser",
  "culture",
  "cloud_resource",
  "trace",
]);

/** An address without its query string or fragment (searches hold names). */
function withoutQuery(url: string): string {
  return url.split(/[?#]/, 1)[0]!;
}

/**
 * Keeps tenant and payment details out of error reports: form bodies,
 * cookies, query strings and every header except a few harmless ones are
 * dropped, and a user is reported by id only, never email or name. An
 * error's text is dropped too, keeping only its type: a failed query's
 * message lists the values it tried to save (names, GSTINs, amounts). What
 * failed is still in the report, from reportError's message and ids.
 * Breadcrumbs, extra data, stack-frame variables and unknown contexts go
 * for the same reason; the Next.js request path loses its query string.
 */
export function scrubEvent<E extends ReportableEvent>(event: E): E {
  if (event.request) {
    const { headers, url } = event.request;
    event.request = {
      ...event.request,
      url: url === undefined ? undefined : withoutQuery(url),
      data: undefined,
      cookies: undefined,
      query_string: undefined,
      headers: headers
        ? Object.fromEntries(
            Object.entries(headers)
              .filter(([k]) => SAFE_HEADERS.has(k.toLowerCase()))
              .map(([k, v]) =>
                k.toLowerCase() === "referer" ? [k, withoutQuery(v)] : [k, v],
              ),
          )
        : undefined,
    };
    if (url === undefined) delete event.request.url;
  }
  if (event.exception?.values) {
    event.exception.values = event.exception.values.map((e) => ({
      ...e,
      value: e.type ?? "Error",
      // Local variables (off by default) would hold amounts and GSTINs.
      ...(e.stacktrace?.frames && {
        stacktrace: {
          ...e.stacktrace,
          frames: e.stacktrace.frames.map((frame) => {
            const kept = { ...frame };
            delete kept.vars;
            return kept;
          }),
        },
      }),
    }));
  }
  if (event.contexts) {
    event.contexts = Object.fromEntries(
      Object.entries(event.contexts)
        .filter(([k]) => SAFE_CONTEXTS.has(k))
        .map(([k, v]) => {
          const path = v && "request_path" in v ? v.request_path : undefined;
          return k === "nextjs" && typeof path === "string"
            ? [k, { ...v, request_path: withoutQuery(path) }]
            : [k, v];
        }),
    );
  }
  delete event.message;
  delete event.logentry;
  delete event.breadcrumbs;
  delete event.extra;
  if (event.user) event.user = { id: event.user.id };
  return event;
}

/** Console lines can hold anything (the console email driver logs whole emails). */
export function dropConsoleBreadcrumb<B extends { category?: string }>(
  crumb: B,
): B | null {
  return crumb.category === "console" ? null : crumb;
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
    beforeBreadcrumb: dropConsoleBreadcrumb,
  };
}
