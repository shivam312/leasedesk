import { describe, expect, it } from "vitest";
import { contentDisposition, sniffType } from "../store";

describe("contentDisposition", () => {
  it("works for names a header can't carry as they are", () => {
    const value = contentDisposition('Q3 – 16A "final".pdf');
    expect(value).toBe(
      "inline; filename=\"Q3 _ 16A _final_.pdf\"; filename*=UTF-8''Q3%20%E2%80%93%2016A%20%22final%22.pdf",
    );
    // A Response accepts it (it throws on characters over code 255)
    expect(
      () => new Response("x", { headers: { "Content-Disposition": value } }),
    ).not.toThrow();
    expect(
      () =>
        new Response("x", {
          headers: { "Content-Disposition": contentDisposition("फ़ॉर्म.pdf") },
        }),
    ).not.toThrow();
  });
});

describe("sniffType", () => {
  it("reads PDF, PNG and JPG from their first bytes", () => {
    expect(sniffType(new TextEncoder().encode("%PDF-1.7"))).toBe(
      "application/pdf",
    );
    expect(sniffType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe(
      "image/png",
    );
    expect(sniffType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      "image/jpeg",
    );
    expect(sniffType(new TextEncoder().encode("<html>"))).toBeNull();
  });
});
