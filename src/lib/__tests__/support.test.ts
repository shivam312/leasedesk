import { describe, expect, it } from "vitest";
import { SUPPORT, supportEmailHref, supportWhatsAppHref } from "../support";

describe("support contact (D-029)", () => {
  it("shows the WhatsApp number and email the founder gave", () => {
    expect(SUPPORT.whatsappDisplay).toBe("+91 98111 29108");
    expect(SUPPORT.email).toBe("support@leasedesk.com");
  });

  it("links WhatsApp with digits only, as wa.me needs", () => {
    expect(supportWhatsAppHref()).toBe("https://wa.me/919811129108");
  });

  it("pre-fills a message when given one", () => {
    expect(supportWhatsAppHref("Page didn't load")).toBe(
      "https://wa.me/919811129108?text=Page%20didn't%20load",
    );
  });

  it("links email with a subject", () => {
    expect(supportEmailHref()).toBe(
      "mailto:support@leasedesk.com?subject=LeaseDesk%20help",
    );
  });
});
