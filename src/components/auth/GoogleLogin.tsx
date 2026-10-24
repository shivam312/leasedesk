import { connection } from "next/server";
import { Button } from "@/components/ui/button";
import { googleLoginEnabled } from "@/lib/auth/providers";
import { logInWithGoogle } from "@/server/actions/auth";

/** "Log in with Google", only when the Google provider is turned on. */
export async function GoogleLogin({ label }: { label: string }) {
  await connection();
  if (!(await googleLoginEnabled())) return null;
  return (
    <form action={logInWithGoogle} className="mt-4">
      <Button type="submit" variant="outline" className="h-11 w-full md:h-10">
        {label}
      </Button>
    </form>
  );
}
