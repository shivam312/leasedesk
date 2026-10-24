import { Suspense } from "react";
import Link from "next/link";
import { Search as SearchIcon } from "lucide-react";
import { brand } from "@/lib/config/brand";
import { AppNav, NavLinks } from "@/components/shell/AppNav";
import {
  SettingsLink,
  SettingsLinkView,
} from "@/components/shell/SettingsLink";

// Signed-in app shell: sidebar on laptops, bottom tab bar on phones.
// Settings is reached through the profile icon (docs/UX_PRINCIPLES.md, rule 1).
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-6 border-r bg-background px-3 py-4 md:flex">
        <Link href="/today" className="px-3 text-lg font-semibold">
          {brand.name}
        </Link>
        <nav aria-label="Main">
          <Suspense fallback={<NavLinks variant="sidebar" pathname={null} />}>
            <AppNav variant="sidebar" />
          </Suspense>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur md:justify-end md:px-8">
          <Link href="/today" className="text-lg font-semibold md:hidden">
            {brand.name}
          </Link>
          <div className="flex items-center gap-2">
            <form
              action="/search"
              method="get"
              role="search"
              className="hidden md:block"
            >
              <input
                type="search"
                name="q"
                aria-label="Quick search"
                placeholder="Search tenant, unit, invoice"
                className="h-9 w-64 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </form>
            <Link
              href="/search"
              aria-label="Search"
              className="inline-flex size-11 items-center justify-center rounded-md hover:bg-accent md:hidden"
            >
              <SearchIcon className="size-5" aria-hidden />
            </Link>
            <Suspense fallback={<SettingsLinkView active={false} />}>
              <SettingsLink />
            </Suspense>
          </div>
        </header>

        <main
          id="main"
          tabIndex={-1}
          className="flex-1 px-4 pt-6 pb-[calc(4rem+env(safe-area-inset-bottom)+1.5rem)] outline-none md:px-8 md:pb-8"
        >
          {children}
        </main>
      </div>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <Suspense fallback={<NavLinks variant="bottom" pathname={null} />}>
          <AppNav variant="bottom" />
        </Suspense>
      </nav>
    </div>
  );
}
