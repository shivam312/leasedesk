import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { logOut } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Settings" };

const SECTIONS = [
  {
    href: "/settings/business",
    title: "Business details",
    description: "Your name, GSTINs and the bank account on invoices.",
  },
  {
    href: "/settings/billing-rules",
    title: "Billing rules",
    description: "Rounding, GST, TDS and building defaults.",
  },
  {
    href: "/settings/tally",
    title: "Tally",
    description: "Ledger names for the Tally file your accountant imports.",
  },
  {
    href: "/settings/team",
    title: "Team",
    description: "See who can use your account, and invite people.",
  },
] as const;

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Your business details, billing rules, Tally ledgers, team and account."
      />
      <ul className="flex max-w-2xl flex-col divide-y rounded-lg border">
        {SECTIONS.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
            >
              <span>
                <span className="block font-medium">{s.title}</span>
                <span className="block text-sm text-muted-foreground">
                  {s.description}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
      <form action={logOut} className="mt-10 border-t pt-6">
        <Button type="submit" variant="outline" className="h-11 md:h-9">
          Log out
        </Button>
      </form>
    </>
  );
}
