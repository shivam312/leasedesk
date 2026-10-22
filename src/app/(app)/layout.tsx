import { Suspense } from "react";
import Link from "next/link";
import { CircleUserRound } from "lucide-react";
import { AppNav, NavLinks } from "@/components/shell/AppNav";

// Signed-in app shell: sidebar on laptops, bottom tab bar on phones.
// Settings is reached through the profile icon (docs/UX_PRINCIPLES.md, rule 1).
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-6 border-r bg-background px-3 py-4 md:flex">
        <Link href="/today" className="px-3 text-lg font-semibold">
          LeaseDesk
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
            LeaseDesk
          </Link>
          <Link
            href="/settings"
            aria-label="Profile and settings"
            className="flex size-10 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <CircleUserRound aria-hidden className="size-6" />
          </Link>
        </header>

        <main className="flex-1 px-4 pt-6 pb-24 md:px-8 md:pb-8">
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
