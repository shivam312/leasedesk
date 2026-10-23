// The Resend driver: used when RESEND_API_KEY is set.

import { Resend } from "resend";
import { EmailError, type Email, type EmailDriver } from "./types";

/** The part of the Resend client this driver uses (a stub in tests). */
export type ResendClient = Pick<Resend, "emails">;

export function resendDriver(client: ResendClient, from: string): EmailDriver {
  return {
    async send(email: Email) {
      const { data, error } = await client.emails.send({
        from,
        to: email.to,
        subject: email.subject,
        text: email.text,
        ...(email.html ? { html: email.html } : {}),
        ...(email.replyTo ? { replyTo: email.replyTo } : {}),
        attachments: email.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
        })),
      });
      if (error || !data) {
        throw new EmailError(
          `The email to ${email.to.join(", ")} couldn't be sent: ${error?.message ?? "no reply from Resend"}`,
        );
      }
      return { id: data.id, driver: "resend" as const };
    },
  };
}

export function createResendClient(apiKey: string): ResendClient {
  return new Resend(apiKey);
}
