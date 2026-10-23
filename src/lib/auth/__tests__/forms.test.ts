import { describe, expect, it } from "vitest";
import {
  forgotPasswordSchema,
  logInSchema,
  newPasswordSchema,
  parseForm,
  safeNext,
  signUpSchema,
} from "../forms";

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

const parse = <S extends Parameters<typeof parseForm>[0]>(
  schema: S,
  values: Record<string, string>,
) => parseForm(schema, form(values));

describe("forgotten password", () => {
  it("asks for a valid email", () => {
    expect(parse(forgotPasswordSchema, { email: "nope" })).toEqual({
      state: {
        fieldErrors: {
          email: "Enter a valid email address, like name@company.com.",
        },
        values: { email: "nope" },
      },
    });
  });

  it("needs the new password typed the same twice, and never echoes either", () => {
    expect(
      parse(newPasswordSchema, {
        password: "secret-123",
        confirm: "secret-124",
      }),
    ).toEqual({
      state: {
        fieldErrors: {
          confirm: "The two passwords don't match. Type the same one twice.",
        },
        values: {},
      },
    });
    expect(
      parse(newPasswordSchema, { password: "short", confirm: "short" }),
    ).toMatchObject({
      state: {
        fieldErrors: {
          password: "Use at least 8 characters for your password.",
        },
      },
    });
    expect(
      parse(newPasswordSchema, {
        password: "secret-123",
        confirm: "secret-123",
      }),
    ).toEqual({ data: { password: "secret-123", confirm: "secret-123" } });
  });

  it("only follows an emailed link to a path in this app", () => {
    expect(safeNext("/reset-password")).toBe("/reset-password");
    expect(safeNext("/billing?month=2026-10")).toBe("/billing?month=2026-10");
    expect(safeNext("https://evil.example")).toBe("/today");
    expect(safeNext("//evil.example")).toBe("/today");
    expect(safeNext("/\\evil.example")).toBe("/today");
    expect(safeNext(null)).toBe("/today");
  });

  it("refuses a path that a browser would turn into another site", () => {
    // URL parsing drops tabs and newlines, so "/\t/evil" becomes "//evil".
    expect(safeNext("/\t/evil.example")).toBe("/today");
    expect(safeNext("/\n/evil.example")).toBe("/today");
    expect(safeNext("/\r\\evil.example")).toBe("/today");
    expect(safeNext("/ /evil.example")).toBe("/ /evil.example");
  });
});
