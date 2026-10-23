import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        We couldn&apos;t find that
      </h1>
      <p className="text-sm text-muted-foreground">
        It may have been removed, or the link is wrong. Go back to Today, or use
        the menu to find it.
      </p>
      <div>
        <Button asChild variant="outline" className="h-11 md:h-9">
          <Link href="/today">Go to Today</Link>
        </Button>
      </div>
    </div>
  );
}
