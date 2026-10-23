import { describe, expect, it } from "vitest";
import { upiPaymentLink } from "../upi";

describe("upiPaymentLink", () => {
  it("builds a upi://pay link with payee, amount in rupees and the invoice number", () => {
    // ₹1,08,000 = 10800000 paise → am=108000.00
    expect(
      upiPaymentLink({
        upiId: "demo@okhdfcbank",
        payeeName: "Demo Properties LLP",
        amountPaise: 10800000,
        note: "B1/26-27/0001",
      }),
    ).toBe(
      "upi://pay?pa=demo%40okhdfcbank&pn=Demo%20Properties%20LLP&am=108000.00&cu=INR&tn=B1%2F26-27%2F0001",
    );
  });

  it("keeps paise exactly, without floats", () => {
    // 10691775 paise → 106917.75
    expect(
      upiPaymentLink({
        upiId: "a@b",
        payeeName: "A",
        amountPaise: 10691775,
        note: "X",
      }),
    ).toContain("am=106917.75&");
    expect(
      upiPaymentLink({
        upiId: "a@b",
        payeeName: "A",
        amountPaise: 5,
        note: "X",
      }),
    ).toContain("am=0.05&");
  });

  it("leaves the amount out when there is nothing to pay", () => {
    expect(
      upiPaymentLink({
        upiId: "a@b",
        payeeName: "A",
        amountPaise: 0,
        note: "X",
      }),
    ).toBe("upi://pay?pa=a%40b&pn=A&cu=INR&tn=X");
  });
});
