"use client";

import { useState, useTransition } from "react";
import { buttonVariants } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { recordWhatsappReminderAction } from "@/server/actions/reminders";

/**
 * "Remind on WhatsApp": opens WhatsApp with the message filled in, in one
 * tap, and records the reminder in the background.
 */
export function WhatsappReminderLink({
  invoiceId,
  url,
  contactName,
}: {
  invoiceId: string;
  url: string;
  contactName: string;
}) {
  const [message, setMessage] = useState<string>();
  const [, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <a
        href={url}
        target="_blank"
        rel="noopener"
        onClick={() =>
          startTransition(async () => {
            setMessage((await recordWhatsappReminderAction(invoiceId)).message);
          })
        }
        className={buttonVariants({
          variant: "outline",
          className: "h-11 self-start md:h-9",
        })}
      >
        Remind {contactName} on WhatsApp
      </a>
      <FormMessage message={message} />
    </div>
  );
}
