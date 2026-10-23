"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/monitoring/client";
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
      <body className="flex min-h-full flex-col bg-background p-6 font-sans text-foreground antialiased">
        <title>Something went wrong</title>
        <div className="flex max-w-xl flex-col gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">
            Something went wrong
          </h1>
          {/* No support contact yet (D-029): point to someone the user knows. */}
          <p role="alert" className="text-sm text-muted-foreground">
            The app didn&apos;t load. Your data is safe. Wait a minute and try
            again. If it still doesn&apos;t load, ask the person who set up
            LeaseDesk for you to check it.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => retry()}
              className="inline-flex h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Try again
            </button>
            {/* A plain link: the app's router may be what broke. */}
            <a
              href="/today"
              className="inline-flex h-11 items-center rounded-md border px-4 text-sm font-medium"
            >
              Go to Today
            </a>
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
