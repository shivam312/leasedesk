// Which database to connect to, and the guard that keeps scripts off remote databases.

/** The Supabase CLI's local Postgres (`supabase start`). Not a secret: it only exists on your machine. */
export const LOCAL_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

type Env = Record<string, string | undefined>;

/** `DATABASE_URL` if set, otherwise the local Supabase database. */
export function databaseUrl(env: Env = process.env): string {
  return env.DATABASE_URL?.trim() || LOCAL_DATABASE_URL;
}

export function isLocalDatabaseUrl(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Migrations and seeding only run against a local database unless a person
 * opts in with `ALLOW_REMOTE_DB=yes` (CLAUDE.md: always ask before touching a
 * non-local database).
 */
export function assertLocalDatabase(url: string, env: Env = process.env): void {
  if (isLocalDatabaseUrl(url) || env.ALLOW_REMOTE_DB === "yes") return;
  throw new Error(
    "DATABASE_URL points at a database that isn't on this machine. " +
      "To run against it on purpose, set ALLOW_REMOTE_DB=yes for this one command.",
  );
}
