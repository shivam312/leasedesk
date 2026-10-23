import { describe, expect, it } from "vitest";
import { cn } from "../utils";

describe("cn", () => {
  it("joins classes and drops falsy values", () => {
    expect(cn("a", false, undefined, null, "b", { c: true, d: false })).toBe(
      "a b c",
    );
  });

  it("lets a later Tailwind class override a conflicting earlier one", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
    expect(cn("text-sm text-red-500", "text-blue-600")).toBe(
      "text-sm text-blue-600",
    );
  });
});
