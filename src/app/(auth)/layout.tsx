import { brand } from "@/lib/config/brand";

// Signed-out pages: one centred column, no app nav.
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center bg-muted/40 px-4 py-10 md:justify-center">
      <p className="mb-6 text-xl font-semibold">{brand.name}</p>
      <main className="w-full max-w-sm rounded-lg border bg-background p-6 shadow-sm">
        {children}
      </main>
    </div>
  );
}
