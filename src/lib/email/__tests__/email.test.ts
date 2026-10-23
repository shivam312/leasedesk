import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { consoleDriver } from "../console";
import { emailDriver } from "../index";
import { resendDriver, type ResendClient } from "../resend";
import { EmailError } from "../types";

const email = {
  to: ["accounts@acme.example"],
  subject: "Invoice ABC/26-27/0001 for Nov 2026",
  text: "Please find the invoice attached.",
  attachments: [
    { filename: "ABC-26-27-0001.pdf", content: Buffer.from("%PDF") },
  ],
};

describe("console driver", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("writes the email and its attachments to the outbox", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "outbox-"));
    vi.spyOn(console, "info").mockImplementation(() => {});
    const sent = await consoleDriver(dir, "Demo <a@b.example>").send(email);
    expect(sent.driver).toBe("console");
    const files = await readdir(dir);
    expect(files).toHaveLength(2);
    const json = JSON.parse(
      await readFile(path.join(dir, `${sent.id}.json`), "utf8"),
    );
    expect(json).toMatchObject({
      from: "Demo <a@b.example>",
      to: email.to,
      subject: email.subject,
      attachments: [`${sent.id}-ABC-26-27-0001.pdf`],
    });
    expect(
      await readFile(path.join(dir, `${sent.id}-ABC-26-27-0001.pdf`), "utf8"),
    ).toBe("%PDF");
  });
});

describe("resend driver", () => {
  const client = (result: unknown) =>
    ({
      emails: { send: vi.fn().mockResolvedValue(result) },
    }) as unknown as ResendClient & {
      emails: { send: ReturnType<typeof vi.fn> };
    };

  it("sends through Resend with the sender and attachments", async () => {
    const c = client({ data: { id: "re_1" }, error: null });
    const sent = await resendDriver(c, "Invoices <i@demo.example>").send(email);
    expect(sent).toEqual({ id: "re_1", driver: "resend" });
    expect(c.emails.send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Invoices <i@demo.example>",
        to: email.to,
        attachments: [
          expect.objectContaining({ filename: "ABC-26-27-0001.pdf" }),
        ],
      }),
    );
  });

  it("turns a Resend error into an EmailError", async () => {
    const c = client({ data: null, error: { message: "Domain not verified" } });
    await expect(
      resendDriver(c, "x <x@y.example>").send(email),
    ).rejects.toThrow(EmailError);
  });
});

describe("emailDriver", () => {
  it("uses the console driver without RESEND_API_KEY", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "outbox-"));
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(dir);
    vi.spyOn(console, "info").mockImplementation(() => {});
    const sent = await emailDriver({}).send(email);
    expect(sent.driver).toBe("console");
    cwd.mockRestore();
    await rm(dir, { recursive: true, force: true });
  });

  it("needs EMAIL_FROM with a Resend key", () => {
    expect(() => emailDriver({ RESEND_API_KEY: "re_x" })).toThrow(/EMAIL_FROM/);
    expect(() =>
      emailDriver({ RESEND_API_KEY: "re_x", EMAIL_FROM: "a <a@b.example>" }),
    ).not.toThrow();
  });
});
