"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/monitoring";

// Shown when a page fails to load. Technical detail goes to the log (and
// Sentry when it is set up) only.
export default function AppError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    const digest =
      typeof error === "object" && error !== null && "digest" in error
        ? String(error.digest)
        : undefined;
    reportError("Page failed to load", error, { digest });
  }, [error]);

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        Something went wrong
      </h1>
      <p className="text-sm text-muted-foreground">
        This page didn&apos;t load. Try again, or go back to Today.
      </p>
      <div className="flex gap-2">
        <Button onClick={() => retry()}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/today">Go to Today</Link>
        </Button>
      </div>
    </div>
  );
}
