// The console driver: used when RESEND_API_KEY is missing. Each email is
// written to .local-outbox/ (one .json with the message, plus its
// attachments) and a line is logged, so the whole flow works before the
// Resend account exists.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Email, EmailDriver, SentEmail } from "./types";

export function consoleDriver(
  outbox = path.join(process.cwd(), ".local-outbox"),
  from = "LeaseDesk <invoices@localhost>",
): EmailDriver {
  return {
    async send(email: Email): Promise<SentEmail> {
      await mkdir(outbox, { recursive: true });
      const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 8)}`;
      const attachments = [];
      for (const a of email.attachments ?? []) {
        const file = `${id}-${path.basename(a.filename)}`;
        await writeFile(path.join(outbox, file), a.content);
        attachments.push(file);
      }
      await writeFile(
        path.join(outbox, `${id}.json`),
        JSON.stringify(
          {
            from,
            to: email.to,
            replyTo: email.replyTo,
            subject: email.subject,
            text: email.text,
            html: email.html,
            attachments,
          },
          null,
          2,
        ),
      );
      console.info(
        `[email] "${email.subject}" to ${email.to.join(", ")} written to .local-outbox/${id}.json`,
      );
      return { id, driver: "console" };
    },
  };
}
