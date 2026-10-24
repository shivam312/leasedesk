// How users reach LeaseDesk support (D-029). The one place the contact lives:
// the error pages and Settings → Help read it from here.
export const SUPPORT = {
  whatsappDisplay: "+91 98111 29108",
  whatsappDigits: "919811129108",
  email: "support@leasedesk.com",
} as const;

export function supportWhatsAppHref(message?: string): string {
  const base = `https://wa.me/${SUPPORT.whatsappDigits}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export function supportEmailHref(): string {
  return `mailto:${SUPPORT.email}?subject=${encodeURIComponent("LeaseDesk help")}`;
}
