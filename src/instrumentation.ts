// Starts error reporting on the server (Node and edge) when SENTRY_DSN is
// set; without it nothing is started and nothing is sent (D41).

import type { Instrumentation } from "next";
import { monitoringOptions } from "@/lib/monitoring/options";

export async function register() {
  const options = monitoringOptions(process.env, "server");
  if (!options) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.init(options);
}

export const onRequestError: Instrumentation.onRequestError = async (
  ...args
) => {
  if (!monitoringOptions(process.env, "server")) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
};
