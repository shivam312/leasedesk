import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/PageHeader";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <PageHeader
      title="Settings"
      description="Your organization, billing details, building defaults and users."
    />
  );
}
