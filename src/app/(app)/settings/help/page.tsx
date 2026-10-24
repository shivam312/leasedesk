import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/PageHeader";
import { SupportContact } from "@/components/support/SupportContact";

export const metadata: Metadata = { title: "Help" };

export default function HelpPage() {
  return (
    <>
      <PageHeader
        title="Help"
        description="Stuck, or something looks wrong? Message us on WhatsApp or email us. Tell us what you were doing and which tenant or invoice it was."
      />
      <div className="max-w-2xl rounded-lg border px-4 py-3">
        <SupportContact message="Hi, I need help with LeaseDesk." />
      </div>
    </>
  );
}
