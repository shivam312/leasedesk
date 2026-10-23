// Inngest calls this route to run background jobs (src/lib/jobs/).

import { serve } from "inngest/next";
import { inngest } from "@/lib/jobs/inngest";
import { jobs } from "@/lib/jobs/monthly-billing";

export const { GET, POST, PUT } = serve({ client: inngest, functions: jobs });
