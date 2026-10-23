"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/monitoring";
import "./globals.css";

// Shown when the whole app fails to load (the root layout itself broke).
// It replaces the root layout, so it brings its own html and body.
export default function GlobalError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    reportError("App failed to load", error, { digest: digestOf(error) });
  }, [error]);

  return (
    <html lang="en-IN">
      <body className="flex min-h-full flex-col p-6 font-sans antialiased">
        <title>Something went wrong</title>
        <div className="flex max-w-xl flex-col gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">
            Something went wrong
          </h1>
          <p className="text-sm text-muted-foreground">
            The app didn&apos;t load. Try again in a moment.
          </p>
          <div>
            <button
              type="button"
              onClick={() => retry()}
              className="inline-flex h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

function digestOf(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "digest" in error
    ? String(error.digest)
    : undefined;
}
