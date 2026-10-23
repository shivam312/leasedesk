import Link from "next/link";
import { Card } from "@/components/ui/field";

/** Instead of a form someone can't save: who can change it, and a way back. */
export function NoAccess({
  message,
  back,
}: {
  message: string;
  back: { href: string; label: string };
}) {
  return (
    <Card className="max-w-xl">
      <p className="text-sm">{message}</p>
      <Link
        href={back.href}
        className="mt-1 inline-block py-2 text-sm underline"
      >
        {back.label}
      </Link>
    </Card>
  );
}
