import { describe, expect, it } from "vitest";

import { formatCurrency, formatQuantity } from "@/lib/utils";

describe("financial formatting", () => {
  it("formats monetary values for Brazil", () => {
    expect(formatCurrency(59451.42)).toBe("R$ 59.451,42");
  });

  it("does not expose decimal noise in quantities", () => {
    expect(formatQuantity(300000)).toBe("300.000");
  });
});
