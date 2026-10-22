"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isActive } from "./nav-items";

type Variant = "sidebar" | "bottom";

/**
 * Main nav. "sidebar" is shown from 768px up, "bottom" is a tab bar on phones.
 * Reads the pathname to highlight the current section.
 */
export function AppNav({ variant }: { variant: Variant }) {
  const pathname = usePathname();
  return <NavLinks variant={variant} pathname={pathname} />;
}

/** Same links without the active highlight; used as the Suspense fallback. */
export function NavLinks({
  variant,
  pathname,
}: {
  variant: Variant;
  pathname: string | null;
}) {
  return (
    <ul
      className={cn(
        variant === "sidebar" && "flex flex-col gap-1",
        variant === "bottom" && "grid grid-cols-5",
      )}
    >
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(href, pathname);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                variant === "sidebar" &&
                  "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground",
                variant === "sidebar" && active && "bg-accent text-foreground",
                variant === "bottom" &&
                  "flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground",
                variant === "bottom" && active && "text-foreground",
              )}
            >
              <Icon
                aria-hidden
                className={cn("size-5", active && "stroke-[2.5]")}
              />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
