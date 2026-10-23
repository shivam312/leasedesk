// Where links in Supabase Auth emails land (password reset): swaps the code
// in the link for a session, then goes on to `next` (a path in this app).
// A link that's expired or already used goes back to the form with a note.

import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth/forms";
import { createSupabase } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNext(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const supabase = await createSupabase();
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("No code in the link") };

  const target = new URL(
    error ? "/forgot-password?expired=1" : next,
    url.origin,
  );
  return NextResponse.redirect(target);
}
