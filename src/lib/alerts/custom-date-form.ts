// The "Add a date" form on a lease: what it is, the day, and how many days
// before to remind (typed "30, 7"). Pure.

import { z } from "zod";

export const customDateSchema = z.object({
  label: z
    .string()
    .trim()
    .min(2, "Say what the date is, like “Rent review” or “Insurance renewal”.")
    .max(80),
  date: z.iso.date("Choose the date."),
  remind: z
    .string()
    .trim()
    .transform((v) =>
      v === ""
        ? [30, 7]
        : [
            ...new Set(
              v
                .split(/[,\s]+/)
                .filter(Boolean)
                .map(Number),
            ),
          ],
    )
    .pipe(
      z
        .array(
          z
            .number()
            .int("Remind days are whole numbers, like 30, 7.")
            .min(0)
            .max(730),
        )
        .max(5, "Up to five reminders."),
    )
    .transform((days) => days.sort((a, b) => b - a)),
});
