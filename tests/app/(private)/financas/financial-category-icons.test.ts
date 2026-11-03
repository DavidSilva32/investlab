import { FolderOpen, House, Utensils } from "lucide-react";
import { describe, expect, it } from "vitest";
import { getFinancialCategoryIcon } from "@/app/(private)/financas/_components/financial-category-icons";

describe("getFinancialCategoryIcon", () => {
  it("normalizes accents and letter case for known category names", () => {
    expect(getFinancialCategoryIcon("  ALIMENTAÇÃO ")).toBe(Utensils);
    expect(getFinancialCategoryIcon("Moradia")).toBe(House);
  });

  it("uses a generic folder icon for categories without a specific mapping", () => {
    expect(getFinancialCategoryIcon("Veterinário")).toBe(FolderOpen);
  });
});
