import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { logOut } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Your business details, building defaults (GST, due days, invoice prefix) and team members."
      />
      <form action={logOut} className="mt-10 border-t pt-6">
        <Button type="submit" variant="outline">
          Log out
        </Button>
      </form>
    </>
  );
}
