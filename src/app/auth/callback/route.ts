// Where Google sends someone back after "Log in with Google": swap the code
// for a session, then on to `next` (a path in this app). Someone new has no
// organization yet; requireMember sends them to /welcome to make one.

import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth/forms";
import { createSupabase } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNext(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  const supabase = await createSupabase();
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : { error: new Error("No code") };
  return NextResponse.redirect(
    new URL(error ? "/login?google=failed" : next, url.origin),
  );
}
