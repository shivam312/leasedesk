// Starts error reporting in the browser when NEXT_PUBLIC_SENTRY_DSN is set at
// build time; without it the Sentry code isn't even loaded (D41).

import { monitoringOptions } from "@/lib/monitoring/options";

const options = monitoringOptions(
  {
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  },
  "browser",
);

const sentry = options
  ? import("@sentry/nextjs").then((Sentry) => {
      Sentry.init(options);
      return Sentry;
    })
  : null;

export function onRouterTransitionStart(
  url: string,
  navigationType: "push" | "replace" | "traverse",
) {
  void sentry?.then((Sentry) =>
    Sentry.captureRouterTransitionStart(url, navigationType),
  );
}
