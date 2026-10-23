import { describe, expect, it } from "vitest";
import {
  assertLocalDatabase,
  databaseUrl,
  isLocalDatabaseUrl,
  LOCAL_DATABASE_URL,
} from "../url";

describe("databaseUrl", () => {
  it("falls back to the local Supabase database", () => {
    expect(databaseUrl({})).toBe(LOCAL_DATABASE_URL);
    expect(databaseUrl({ DATABASE_URL: "  " })).toBe(LOCAL_DATABASE_URL);
  });

  it("uses DATABASE_URL when set", () => {
    const url = "postgresql://u:p@localhost:5432/other";
    expect(databaseUrl({ DATABASE_URL: url })).toBe(url);
  });
});

describe("isLocalDatabaseUrl", () => {
  it("accepts loopback hosts", () => {
    expect(isLocalDatabaseUrl(LOCAL_DATABASE_URL)).toBe(true);
    expect(isLocalDatabaseUrl("postgres://u:p@localhost/db")).toBe(true);
    expect(isLocalDatabaseUrl("postgres://u:p@[::1]:5432/db")).toBe(true);
  });

  it("rejects remote hosts and garbage", () => {
    expect(
      isLocalDatabaseUrl("postgres://u:p@db.abc.supabase.co:5432/postgres"),
    ).toBe(false);
    expect(isLocalDatabaseUrl("postgres://u:p@127.0.0.1.evil.com/db")).toBe(
      false,
    );
    expect(isLocalDatabaseUrl("not a url")).toBe(false);
  });
});

describe("assertLocalDatabase", () => {
  const remote =
    "postgres://u:p@aws-0-ap-south-1.pooler.supabase.com:6543/postgres";

  it("allows local databases", () => {
    expect(() => assertLocalDatabase(LOCAL_DATABASE_URL, {})).not.toThrow();
  });

  it("refuses remote databases unless ALLOW_REMOTE_DB=yes", () => {
    expect(() => assertLocalDatabase(remote, {})).toThrow(
      /isn't on this machine/,
    );
    expect(() =>
      assertLocalDatabase(remote, { ALLOW_REMOTE_DB: "1" }),
    ).toThrow();
    expect(() =>
      assertLocalDatabase(remote, { ALLOW_REMOTE_DB: "yes" }),
    ).not.toThrow();
  });

  it("never puts the URL (and its password) in the error", () => {
    let message = "";
    try {
      assertLocalDatabase(remote, {});
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toBe("");
    expect(message).not.toContain("pooler");
  });
});
