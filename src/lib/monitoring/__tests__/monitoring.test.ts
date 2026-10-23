import { afterEach, describe, expect, it, vi } from "vitest";
import { reportError } from "../index";
import { monitoringOptions, scrubEvent } from "../options";

describe("monitoringOptions", () => {
  it("is off without a DSN", () => {
    expect(monitoringOptions({}, "server")).toBeNull();
    expect(monitoringOptions({ SENTRY_DSN: "  " }, "server")).toBeNull();
  });

  it("uses SENTRY_DSN on the server and the NEXT_PUBLIC_ one in the browser", () => {
    const env = {
      SENTRY_DSN: "https://server@o1.ingest.sentry.io/1",
      NEXT_PUBLIC_SENTRY_DSN: "https://browser@o1.ingest.sentry.io/2",
    };
    expect(monitoringOptions(env, "server")?.dsn).toBe(env.SENTRY_DSN);
    expect(monitoringOptions(env, "browser")?.dsn).toBe(
      env.NEXT_PUBLIC_SENTRY_DSN,
    );
    // The browser never sees the server DSN.
    expect(
      monitoringOptions({ SENTRY_DSN: env.SENTRY_DSN }, "browser"),
    ).toBeNull();
  });

  it("never sends personal details and samples no traces", () => {
    const options = monitoringOptions(
      { SENTRY_DSN: "https://k@o1.ingest.sentry.io/1" },
      "server",
    );
    expect(options).toMatchObject({
      sendDefaultPii: false,
      tracesSampleRate: 0,
      environment: "production",
    });
  });

  it("takes the environment and release when given", () => {
    const options = monitoringOptions(
      {
        SENTRY_DSN: "https://k@o1.ingest.sentry.io/1",
        SENTRY_ENVIRONMENT: "staging",
        VERCEL_GIT_COMMIT_SHA: "abc123",
      },
      "server",
    );
    expect(options?.environment).toBe("staging");
    expect(options?.release).toBe("abc123");
  });
});

describe("scrubEvent", () => {
  it("drops form bodies, cookies, query strings and private headers", () => {
    const event = scrubEvent({
      request: {
        data: { tenant: "Acme Traders", amount: "118000" },
        cookies: { "sb-access-token": "secret" },
        query_string: "q=Acme",
        headers: {
          Cookie: "sb=secret",
          Authorization: "Bearer x",
          "User-Agent": "Mozilla",
        },
      },
      user: { id: "u1", email: "owner@example.in", username: "Owner" },
    });
    expect(event.request).toEqual({
      data: undefined,
      cookies: undefined,
      query_string: undefined,
      headers: { "User-Agent": "Mozilla" },
    });
    expect(event.user).toEqual({ id: "u1" });
  });

  it("keeps only the error's type, not its text, which can hold tenant details", () => {
    // A failed Drizzle query's message carries its values:
    // "Failed query: insert ...\nparams: Acme Traders,27AAACA1234A1Z5,11800000".
    const event = scrubEvent({
      exception: {
        values: [
          {
            type: "DrizzleQueryError",
            value:
              "Failed query: insert into tenants\nparams: Acme Traders,27AAACA1234A1Z5,11800000",
          },
          { type: "Error", value: "duplicate key 27AAACA1234A1Z5" },
        ],
      },
      message: "Acme Traders owes 11800000",
      logentry: { message: "Acme Traders" },
      breadcrumbs: [{ category: "console", message: "Send failed Acme" }],
      extra: { tenant: "Acme Traders" },
    });
    const text = JSON.stringify(event);
    expect(text).not.toContain("27AAACA1234A1Z5");
    expect(text).not.toContain("Acme");
    expect(text).not.toContain("11800000");
    expect(event.exception?.values).toEqual([
      { type: "DrizzleQueryError", value: "DrizzleQueryError" },
      { type: "Error", value: "Error" },
    ]);
  });

  it("cuts the query string off the page address and the referer", () => {
    const event = scrubEvent({
      request: {
        url: "https://app.example.in/tenants?q=Acme%20Traders",
        headers: { Referer: "https://app.example.in/billing?q=Acme#x" },
      },
    });
    expect(event.request?.url).toBe("https://app.example.in/tenants");
    expect(event.request?.headers).toEqual({
      Referer: "https://app.example.in/billing",
    });
  });

  it("cuts the query string off the Next.js request path and drops unknown contexts", () => {
    // captureRequestError puts the full path in contexts.nextjs, and a
    // search like ?q=Acme%20Traders is a tenant's name.
    const event = scrubEvent({
      contexts: {
        nextjs: {
          request_path: "/billing/payments/new?q=Acme%20Traders",
          router_kind: "App Router",
        },
        details: { message: "Payment failed", paymentId: "p1" },
        os: { name: "Linux" },
        state: { form: { tenant: "Acme Traders" } },
      },
    });
    expect(event.contexts).toEqual({
      nextjs: {
        request_path: "/billing/payments/new",
        router_kind: "App Router",
      },
      details: { message: "Payment failed", paymentId: "p1" },
      os: { name: "Linux" },
    });
  });

  it("drops local variables from stack frames", () => {
    const event = scrubEvent({
      exception: {
        values: [
          {
            type: "Error",
            value: "x",
            stacktrace: {
              frames: [{ function: "f", vars: { gstin: "27AAPFU0939F1ZV" } }],
            },
          },
        ],
      },
    });
    expect(event.exception?.values?.[0]?.stacktrace?.frames).toEqual([
      { function: "f" },
    ]);
  });

  it("leaves an event without a request or user alone", () => {
    expect(scrubEvent({})).toEqual({});
  });
});

describe("reportError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("logs the message, the ids and the error without a DSN", () => {
    vi.stubEnv("SENTRY_DSN", "");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("boom");
    reportError("Send failed", error, { invoiceId: "inv-1", skip: null });
    expect(log).toHaveBeenCalledWith("Send failed", "inv-1", error);
  });
});

describe("reportError with Sentry on", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.doUnmock("@sentry/nextjs");
    vi.resetModules();
  });

  it("never throws or rejects when Sentry itself fails", async () => {
    vi.stubEnv("SENTRY_DSN", "https://k@o1.ingest.sentry.io/1");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const capture = vi.fn(() => {
      throw new Error("Sentry is down");
    });
    vi.doMock("@sentry/nextjs", () => ({
      getClient: () => ({}),
      withScope: (fn: (scope: unknown) => void) =>
        fn({ setContext: () => {}, setTag: () => {} }),
      captureException: capture,
    }));
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    const { reportError: report } = await import("../index");
    expect(() => report("Send failed", new Error("boom"))).not.toThrow();
    await vi.waitFor(() => expect(capture).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 10));
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});

describe("reportError on the server keeps the function alive until sent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.doUnmock("@sentry/nextjs");
    vi.doUnmock("next/server");
    vi.resetModules();
  });

  function mockSentry() {
    const calls: string[] = [];
    vi.doMock("@sentry/nextjs", () => ({
      getClient: () => ({}),
      withScope: (fn: (scope: unknown) => void) =>
        fn({ setContext: () => {}, setTag: () => {} }),
      captureException: () => calls.push("capture"),
      flush: async (timeout: number) => {
        calls.push(`flush ${timeout}`);
        return true;
      },
    }));
    return calls;
  }

  it("hands the send to after() and flushes within 2 seconds", async () => {
    // A server action returns, then the serverless function may stop: the
    // report must be captured and flushed before after()'s promise settles.
    vi.stubEnv("SENTRY_DSN", "https://k@o1.ingest.sentry.io/1");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const calls = mockSentry();
    const after = vi.fn();
    vi.doMock("next/server", () => ({ after }));
    const { reportError: report } = await import("../index");
    report("Send failed", new Error("boom"), { invoiceId: "inv-1" });
    expect(after).toHaveBeenCalledTimes(1);
    const task = after.mock.calls[0]![0] as Promise<void>;
    expect(task).toBeInstanceOf(Promise);
    await task;
    expect(calls).toEqual(["capture", "flush 2000"]);
  });

  it("still sends outside a request, where after() throws", async () => {
    vi.stubEnv("SENTRY_DSN", "https://k@o1.ingest.sentry.io/1");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const calls = mockSentry();
    vi.doMock("next/server", () => ({
      after: () => {
        throw new Error("`after` was called outside a request scope");
      },
    }));
    const { reportError: report } = await import("../index");
    expect(() =>
      report("Digest email failed", new Error("boom")),
    ).not.toThrow();
    await vi.waitFor(() => expect(calls).toEqual(["capture", "flush 2000"]));
  });

  it("does nothing beyond the log without a DSN", async () => {
    vi.stubEnv("SENTRY_DSN", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const after = vi.fn();
    vi.doMock("next/server", () => ({ after }));
    const { reportError: report } = await import("../index");
    report("Send failed", new Error("boom"));
    expect(after).not.toHaveBeenCalled();
  });
});

describe("reportError in the browser", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("logs the message, the ids and the error without a DSN", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { reportError: report } = await import("../client");
    const error = new Error("boom");
    report("Page failed to load", error, { digest: "d1", skip: undefined });
    expect(log).toHaveBeenCalledWith("Page failed to load", "d1", error);
  });
});
