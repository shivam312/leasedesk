import { describe, expect, it } from "vitest";
import { addressWithState } from "../address";

describe("addressWithState", () => {
  it("adds the state when the address doesn't name it", () => {
    expect(addressWithState("Golf Course Road, Gurugram", "06")).toBe(
      "Golf Course Road, Gurugram, Haryana",
    );
  });

  it("doesn't repeat a state the address already names", () => {
    expect(
      addressWithState(
        "100 Feet Road, Indiranagar, Bengaluru, Karnataka 560038",
        "29",
      ),
    ).toBe("100 Feet Road, Indiranagar, Bengaluru, Karnataka 560038");
    expect(addressWithState("Andheri East, MAHARASHTRA", "27")).toBe(
      "Andheri East, MAHARASHTRA",
    );
  });

  it("matches whole words only", () => {
    // "Goa" isn't the word "Goalpara".
    expect(addressWithState("Goalpara Road", "30")).toBe("Goalpara Road, Goa");
  });
});
