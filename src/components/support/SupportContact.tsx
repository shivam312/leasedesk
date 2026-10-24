import { SUPPORT, supportEmailHref, supportWhatsAppHref } from "@/lib/support";

const LINK =
  "inline-flex min-h-11 items-center font-medium underline underline-offset-4 md:min-h-9";

// Plain links, no app router: the global error page uses this too, when the
// router may be what broke.
export function SupportContact({ message }: { message?: string }) {
  return (
    <ul className="flex flex-col gap-2 text-sm">
      <li>
        <a
          href={supportWhatsAppHref(message)}
          target="_blank"
          rel="noopener noreferrer"
          className={LINK}
        >
          Message us on WhatsApp
          <span className="sr-only"> (opens WhatsApp)</span>
        </a>{" "}
        <span className="text-muted-foreground">{SUPPORT.whatsappDisplay}</span>
      </li>
      <li>
        <a href={supportEmailHref()} className={`${LINK} break-all`}>
          Email {SUPPORT.email}
        </a>
      </li>
    </ul>
  );
}
