import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Two or three views of one nav section, e.g. Leases | Buildings: plain
 * links (each its own page), the current one marked, 44px tall on phones.
 */
export function SectionTabs({
  label,
  tabs,
  current,
}: {
  /** For screen readers, e.g. "Leases views". */
  label: string;
  tabs: readonly { href: string; label: string }[];
  current: string;
}) {
  return (
    <nav aria-label={label} className="-mt-2 mb-4 flex gap-1 border-b">
      {tabs.map((t) => {
        const active = t.href === current;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm md:min-h-9",
              active
                ? "border-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export const LEASES_TABS = [
  { href: "/leases", label: "Leases" },
  { href: "/leases/buildings", label: "Buildings" },
] as const;
