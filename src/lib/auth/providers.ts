// Whether "Log in with Google" is offered: only when the Supabase project
// has its Google provider turned on (Auth → Providers; creating the Google
// OAuth client is a human task). Read from Auth's public settings, cached.

import { supabaseConfig } from "@/lib/supabase/config";

/** From Auth's /settings answer: is Google turned on? Pure. */
export function googleEnabledFrom(settings: unknown): boolean {
  if (typeof settings !== "object" || settings === null) return false;
  const external = (settings as { external?: unknown }).external;
  return (
    typeof external === "object" &&
    external !== null &&
    (external as Record<string, unknown>).google === true
  );
}

let cached: { at: number; on: boolean } | null = null;
const FIVE_MINUTES = 5 * 60 * 1000;

export async function googleLoginEnabled(now = Date.now()): Promise<boolean> {
  if (cached && now - cached.at < FIVE_MINUTES) return cached.on;
  let on = false;
  try {
    const { url, anonKey } = supabaseConfig();
    const res = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: anonKey },
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    on = res.ok && googleEnabledFrom(await res.json());
  } catch {
    on = false;
  }
  cached = { at: now, on };
  return on;
}
