import { describe, expect, it } from "vitest";
import { amountInWords } from "../amount-in-words";

describe("amountInWords (Indian system, for invoices)", () => {
  it("writes whole rupees with lakh and thousand", () => {
    // ₹1,18,000 = 1 lakh + 18 thousand
    expect(amountInWords(11800000)).toBe(
      "Rupees One Lakh Eighteen Thousand Only",
    );
  });

  it("writes crores, lakhs, thousands, hundreds and tens", () => {
    // ₹12,34,56,789 = 12 crore 34 lakh 56 thousand 7 hundred 89
    expect(amountInWords(12_345_678_900)).toBe(
      "Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine Only",
    );
  });

  it("adds paise after the rupees", () => {
    // ₹1,06,917.75
    expect(amountInWords(10691775)).toBe(
      "Rupees One Lakh Six Thousand Nine Hundred Seventeen and Seventy Five Paise Only",
    );
  });

  it("handles teens, round tens and zero", () => {
    expect(amountInWords(1100)).toBe("Rupees Eleven Only");
    expect(amountInWords(4000)).toBe("Rupees Forty Only");
    expect(amountInWords(0)).toBe("Rupees Zero Only");
    expect(amountInWords(5)).toBe("Rupees Zero and Five Paise Only");
  });

  it("writes amounts over 99 crore as a number of crores", () => {
    // ₹1,00,00,00,000 = 100 crore
    expect(amountInWords(100_000_000_000)).toBe(
      "Rupees One Hundred Crore Only",
    );
  });

  it("refuses negative or fractional paise", () => {
    expect(() => amountInWords(-100)).toThrow();
    expect(() => amountInWords(10.5)).toThrow();
  });
});
