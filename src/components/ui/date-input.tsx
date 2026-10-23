"use client";

import * as React from "react";
import { formatDate } from "@/lib/format";
import { Input } from "./input";

/**
 * A native date picker with the chosen date beside it in DD-MM-YYYY, since
 * the picker itself shows the browser's format (often MM/DD/YYYY).
 * Works controlled (`value`) or uncontrolled (`defaultValue`, in GET forms).
 */
export function DateInput({
  onChange,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  const [own, setOwn] = React.useState(String(props.defaultValue ?? ""));
  const value = props.value !== undefined ? String(props.value) : own;
  const shown = /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDate(value) : "";
  return (
    <span className="flex items-center gap-3">
      <Input
        {...props}
        type="date"
        onChange={(e) => {
          setOwn(e.target.value);
          onChange?.(e);
        }}
      />
      <span
        aria-hidden
        className="shrink-0 text-sm text-muted-foreground tabular-nums"
      >
        {shown || "DD-MM-YYYY"}
      </span>
    </span>
  );
}
