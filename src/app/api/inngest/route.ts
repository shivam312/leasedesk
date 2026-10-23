// Inngest calls this route to run background jobs (src/lib/jobs/).

import { serve } from "inngest/next";
import { inngest } from "@/lib/jobs/inngest";
import { monthlyBilling } from "@/lib/jobs/monthly-billing";
import { dailyReminders } from "@/lib/jobs/reminders";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [monthlyBilling, dailyReminders],
});
