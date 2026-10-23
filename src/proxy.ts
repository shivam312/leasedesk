// Runs before every page request: refreshes the Supabase session cookie and
// sends signed-out visitors to the login page. This is an optimistic check;
// every server action and data read checks the user again (src/lib/auth.ts).

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfig } from "@/lib/supabase/config";

/** Pages anyone can open. */
const PUBLIC_PATHS = ["/login", "/signup", "/invite"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, anonKey } = supabaseConfig();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet)
          response.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some(
    (p) => path === p || path.startsWith(`${p}/`),
  );
  if (!user && !isPublic) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    return NextResponse.redirect(login);
  }
  if (user && (path === "/login" || path === "/signup")) {
    const today = request.nextUrl.clone();
    today.pathname = "/today";
    today.search = "";
    return NextResponse.redirect(today);
  }
  return response;
}

export const config = {
  // Everything except Next.js internals, static files and the background-job
  // endpoint (Inngest signs its own requests; src/app/api/inngest).
  matcher: [
    "/((?!_next/static|_next/image|api/inngest|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
