import { describe, expect, it } from "vitest";
import { googleEnabledFrom } from "../providers";

describe("googleEnabledFrom", () => {
  it("is on only when Auth says Google is", () => {
    expect(googleEnabledFrom({ external: { google: true, email: true } })).toBe(
      true,
    );
    expect(googleEnabledFrom({ external: { google: false } })).toBe(false);
    expect(googleEnabledFrom({ external: {} })).toBe(false);
    expect(googleEnabledFrom(null)).toBe(false);
    expect(googleEnabledFrom("nope")).toBe(false);
  });
});
