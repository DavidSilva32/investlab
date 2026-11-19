import { describe, expect, it } from "vitest";
import * as financialCategoryRoute from "@/app/api/financial-categories/route";

describe("financial categories API", () => {
  it("exposes the read-only default and owner catalog", () => {
    expect(financialCategoryRoute.GET).toBeTypeOf("function");
    expect(financialCategoryRoute).not.toHaveProperty("POST");
    expect(financialCategoryRoute).not.toHaveProperty("PATCH");
    expect(financialCategoryRoute).not.toHaveProperty("DELETE");
  });
});
