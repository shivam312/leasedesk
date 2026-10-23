// The email adapter's shapes (docs/AUTONOMY.md, External services).

export type EmailAttachment = { filename: string; content: Buffer };

export type Email = {
  to: string[];
  subject: string;
  /** Plain text; every email has it. */
  text: string;
  html?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
};

export type SentEmail = {
  /** The provider's id, or the outbox file name for the console driver. */
  id: string;
  driver: "console" | "resend";
};

export interface EmailDriver {
  send(email: Email): Promise<SentEmail>;
}

/** A send that failed, with a message to show as it is. */
export class EmailError extends Error {}
