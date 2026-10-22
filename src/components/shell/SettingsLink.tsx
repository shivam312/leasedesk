"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleUserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { isActive } from "./nav-items";

/** Profile icon in the top bar: the only way to Settings (docs/UX_PRINCIPLES.md, rule 1). */
export function SettingsLink() {
  return <SettingsLinkView active={isActive("/settings", usePathname())} />;
}

/** Without the active state; used as the Suspense fallback. */
export function SettingsLinkView({ active }: { active: boolean }) {
  return (
    <Link
      href="/settings"
      title="Settings"
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-11 min-w-11 items-center justify-center gap-2 rounded-full px-2 text-sm font-medium text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:px-3",
        active && "bg-accent text-foreground",
      )}
    >
      <CircleUserRound aria-hidden className="size-6" />
      <span className="sr-only md:not-sr-only">Settings</span>
    </Link>
  );
}
