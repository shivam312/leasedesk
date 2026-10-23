import { describe, expect, it } from "vitest";
import {
  GST_STATES,
  gstinCheckDigit,
  gstinProblem,
  isValidIfsc,
  isValidPan,
  isValidUpiId,
  makeGstin,
  normalizeId,
} from "../identifiers";

describe("GSTIN", () => {
  it("accepts a published valid GSTIN", () => {
    // A widely used example GSTIN (Maharashtra).
    expect(gstinProblem("27AAPFU0939F1ZV")).toBeNull();
    expect(gstinCheckDigit("27AAPFU0939F1Z")).toBe("V");
  });

  it("catches a one-character typing mistake through the check digit", () => {
    expect(gstinProblem("27AAPFU0939F1ZW")).toMatch(/typing mistake/);
    expect(gstinProblem("27AAPFU0938F1ZV")).toMatch(/typing mistake/);
  });

  it("explains the wrong length, shape and state", () => {
    expect(gstinProblem("27AAPFU0939F1Z")).toBe("A GSTIN has 15 characters.");
    expect(gstinProblem("27AAPFU0939F1XV")).toMatch(
      /doesn't look like a GSTIN/,
    );
    expect(gstinProblem(makeGstin("99", "AAPFU0939F"))).toBe(
      "99 isn't a GST state code.",
    );
  });

  it("makeGstin builds valid GSTINs for any state", () => {
    for (const code of Object.keys(GST_STATES))
      expect(gstinProblem(makeGstin(code, "AABCD1234E"))).toBeNull();
  });
});

describe("other identifiers", () => {
  it("PAN: 5 letters, 4 digits, 1 letter", () => {
    expect(isValidPan("AABCD1234E")).toBe(true);
    expect(isValidPan("AABCD1234")).toBe(false);
    expect(isValidPan("aabcd1234e")).toBe(false);
  });

  it("IFSC: 4 letters, a zero, 6 letters or digits", () => {
    expect(isValidIfsc("HDFC0000123")).toBe(true);
    expect(isValidIfsc("HDFC1000123")).toBe(false);
  });

  it("UPI ID: name@bank", () => {
    expect(isValidUpiId("demoproperties@hdfcbank")).toBe(true);
    expect(isValidUpiId("9876543210@ybl")).toBe(true);
    expect(isValidUpiId("no-at-sign")).toBe(false);
  });

  it("normalizeId removes spaces and upper-cases", () => {
    expect(normalizeId(" 27aapfu 0939f1zv ")).toBe("27AAPFU0939F1ZV");
  });
});
