import * as React from "react";
import { cn } from "@/lib/utils";

/** A form field: label above, optional hint, plain-words error below (build-screen skill). */
function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${htmlFor}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${htmlFor}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Props that link an input to its Field error, or to its hint. */
function errorProps(id: string, error?: string, hasHint = false) {
  if (error) return { "aria-invalid": true, "aria-describedby": `${id}-error` };
  return hasHint ? { "aria-describedby": `${id}-hint` } : {};
}

/** A message for the whole form, e.g. "Saved." or a server error. */
function FormMessage({
  message,
  tone = "error",
}: {
  message?: string;
  tone?: "error" | "success";
}) {
  if (!message) return null;
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-md px-3 py-2 text-sm",
        tone === "error"
          ? "bg-destructive/10 text-destructive"
          : "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
      )}
    >
      {message}
    </p>
  );
}

function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        {
          neutral: "bg-muted text-muted-foreground",
          good: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
          warn: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
          bad: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
        }[tone],
      )}
    >
      {children}
    </span>
  );
}

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-lg border bg-card p-4 text-card-foreground", className)}
      {...props}
    />
  );
}

export { Badge, Card, errorProps, Field, FormMessage };
