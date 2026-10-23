// Where Supabase Auth lives. Without the environment variables, the app talks
// to the local stack from `supabase start`, like the database (src/lib/db/url.ts).
// The local anon key is the Supabase CLI's fixed demo key, the same on every
// machine; it is not a secret and only works against 127.0.0.1.

export const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
export const LOCAL_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

type Env = Record<string, string | undefined>;

export function supabaseConfig(env: Env = process.env): {
  url: string;
  anonKey: string;
} {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (url && anonKey) return { url, anonKey };
  if (url || anonKey) {
    throw new Error(
      "Set both NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, or neither to use the local stack.",
    );
  }
  return { url: LOCAL_SUPABASE_URL, anonKey: LOCAL_SUPABASE_ANON_KEY };
}
