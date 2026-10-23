// Sending email. Code calls emailDriver().send(...) and never picks a
// provider itself: Resend when RESEND_API_KEY is set, otherwise the console
// driver (.local-outbox/). Creating the Resend account and verifying the
// sending domain is a human task (docs/DECISIONS_NEEDED.md).

import { consoleDriver } from "./console";
import { createResendClient, resendDriver } from "./resend";
import type { EmailDriver } from "./types";

export type { Email, EmailAttachment, EmailDriver, SentEmail } from "./types";
export { EmailError } from "./types";

type Env = Record<string, string | undefined>;

/** The sender, e.g. "Demo Properties <invoices@demoproperties.in>" (EMAIL_FROM). */
export function emailFrom(env: Env = process.env): string {
  return env.EMAIL_FROM?.trim() || "LeaseDesk <invoices@localhost>";
}

export function emailDriver(env: Env = process.env): EmailDriver {
  const key = env.RESEND_API_KEY?.trim();
  if (key) {
    const from = env.EMAIL_FROM?.trim();
    if (!from)
      throw new Error(
        "RESEND_API_KEY is set but EMAIL_FROM isn't: set the verified sender, e.g. Invoices <invoices@yourdomain.in>",
      );
    return resendDriver(createResendClient(key), from);
  }
  return consoleDriver(undefined, emailFrom(env));
}
