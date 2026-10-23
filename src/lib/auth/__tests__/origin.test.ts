import { describe, expect, it } from "vitest";
import { emailLinkOrigin } from "../origin";

// Links in emails (password reset) must point at an address we trust, never
// one a request chose through x-forwarded-host / x-forwarded-proto.
describe("emailLinkOrigin", () => {
  it("uses APP_URL when it's set, without a trailing slash", () => {
    expect(
      emailLinkOrigin({
        appUrl: " https://app.example.in/ ",
        host: "evil.test",
      }),
    ).toBe("https://app.example.in");
  });

  it("ignores a forwarded host: only APP_URL or this machine is trusted", () => {
    // A deployed app without APP_URL, asked with Host: evil.test, gets no
    // origin at all rather than https://evil.test.
    expect(
      emailLinkOrigin({ appUrl: undefined, host: "evil.test" }),
    ).toBeNull();
    expect(emailLinkOrigin({ appUrl: "", host: "app.example.in" })).toBeNull();
  });

  it("falls back to this machine for local work and the e2e build", () => {
    expect(emailLinkOrigin({ appUrl: undefined, host: "localhost:3000" })).toBe(
      "http://localhost:3000",
    );
    expect(emailLinkOrigin({ appUrl: undefined, host: "127.0.0.1:3100" })).toBe(
      "http://127.0.0.1:3100",
    );
    expect(emailLinkOrigin({ appUrl: undefined, host: null })).toBeNull();
  });

  it("doesn't treat a look-alike host as this machine", () => {
    expect(
      emailLinkOrigin({ appUrl: undefined, host: "localhost.evil.test" }),
    ).toBeNull();
    expect(
      emailLinkOrigin({ appUrl: undefined, host: "127.0.0.1.evil.test" }),
    ).toBeNull();
    expect(
      emailLinkOrigin({ appUrl: undefined, host: "localhost:3000@evil.test" }),
    ).toBeNull();
  });
});
