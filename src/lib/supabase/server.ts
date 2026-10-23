// Supabase Auth for server components and server actions. The session lives
// in cookies (@supabase/ssr); src/proxy.ts refreshes it on every request.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseConfig } from "./config";

export async function createSupabase() {
  const store = await cookies();
  const { url, anonKey } = supabaseConfig();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet)
            store.set(name, value, options);
        } catch {
          // Called from a server component, where cookies are read-only.
          // The proxy refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}
