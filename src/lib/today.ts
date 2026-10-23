// Today's date in India, for server code that passes "today" into pure
// logic (the billing engine never reads the clock itself).

import type { PlainDate } from "@/lib/billing/dates";

/** YYYY-MM-DD in Asia/Kolkata; `now` is for tests. */
export function todayInIndia(now: Date = new Date()): PlainDate {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
