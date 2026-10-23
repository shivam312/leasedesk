// Background jobs (Inngest). Without INNGEST_SIGNING_KEY the client talks to
// Inngest's local dev server (`pnpm jobs:dev`), so jobs work before the
// Inngest account exists (docs/AUTONOMY.md, External services).

import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "leasedesk",
  isDev: !process.env.INNGEST_SIGNING_KEY,
});
