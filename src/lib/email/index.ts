// Sending email. Code calls emailDriver().send(...) and never picks a
// provider itself: Resend when RESEND_API_KEY is set; otherwise the console
// driver (.local-outbox/), but only outside production or with
// EMAIL_DRIVER=console. A production server without a key fails closed: it
// refuses to send rather than writing tenants' invoices to a local folder.
// Creating the Resend account and verifying the sending domain is a human
// task (docs/DECISIONS_NEEDED.md).

import { consoleDriver } from "./console";
import { createResendClient, resendDriver } from "./resend";
import { EmailError, type EmailDriver } from "./types";

export type { Email, EmailAttachment, EmailDriver, SentEmail } from "./types";
export { EmailError } from "./types";

type Env = Record<string, string | undefined>;

/** The sender, e.g. "Demo Properties <invoices@demoproperties.in>" (EMAIL_FROM). */
export function emailFrom(env: Env = process.env): string {
  return env.EMAIL_FROM?.trim() || "LeaseDesk <invoices@localhost>";
}

/** Shown wherever sending would happen when email isn't set up. */
export const EMAIL_NOT_SET_UP =
  "Email isn't set up yet, so nothing can be sent. Invoices stay as drafts until it is (Settings → Business).";

/** Which driver sends: Resend, the local outbox, or none (production without a key). */
export function emailMode(
  env: Env = process.env,
): "resend" | "console" | "not_set_up" {
  if (env.RESEND_API_KEY?.trim()) return "resend";
  if (env.NODE_ENV !== "production" || env.EMAIL_DRIVER?.trim() === "console")
    return "console";
  return "not_set_up";
}

export function emailDriver(env: Env = process.env): EmailDriver {
  const key = env.RESEND_API_KEY?.trim();
  if (emailMode(env) === "not_set_up")
    return {
      async send() {
        throw new EmailError(EMAIL_NOT_SET_UP);
      },
    };
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
