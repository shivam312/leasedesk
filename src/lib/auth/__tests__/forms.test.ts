import { describe, expect, it } from "vitest";
import { logInSchema, parseForm, signUpSchema } from "../forms";

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
};

describe("sign-up form", () => {
  it("accepts a valid sign-up and lower-cases the email", () => {
    expect(
      parseForm(
        signUpSchema,
        form({
          organizationName: "  Mehta Properties ",
          email: "Owner@Mehta.IN",
          password: "a-long-password",
        }),
      ),
    ).toEqual({
      data: {
        organizationName: "Mehta Properties",
        email: "owner@mehta.in",
        password: "a-long-password",
      },
    });
  });

  it("gives one plain message per field and keeps what was typed, except the password", () => {
    const result = parseForm(
      signUpSchema,
      form({ organizationName: "", email: "not-an-email", password: "short" }),
    );
    expect(result).toEqual({
      state: {
        fieldErrors: {
          organizationName: "Enter your company or building name.",
          email: "Enter a valid email address, like name@company.com.",
          password: "Use at least 8 characters for your password.",
        },
        values: { organizationName: "", email: "not-an-email" },
      },
    });
  });
});

describe("login form", () => {
  it("asks for a missing password", () => {
    const result = parseForm(
      logInSchema,
      form({ email: "a@b.in", password: "" }),
    );
    expect("state" in result && result.state.fieldErrors?.password).toBe(
      "Enter your password.",
    );
  });
});
