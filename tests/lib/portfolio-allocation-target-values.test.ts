import { describe, expect, it } from "vitest";
import {
  getPortfolioAllocationTargetCents,
  isValidPortfolioAllocationTargets,
} from "@/lib/portfolio-allocation-target-values";

const completeTargets = {
  "Renda fixa": 50,
  "Renda variável": 20,
  Fundos: 20,
  Criptoativos: 5,
  Imóveis: 0,
  Outros: 5,
};

describe("portfolio allocation target values", () => {
  it("converts exact percentages to integer cents", () => {
    const targets = {
      "Renda fixa": 50.25,
      "Renda variável": 19.75,
      Fundos: 20,
      Criptoativos: 5,
      Imóveis: 0,
      Outros: 5,
    };
    expect(getPortfolioAllocationTargetCents(targets)).toEqual([
      5025, 1975, 2000, 500, 0, 500,
    ]);
    expect(isValidPortfolioAllocationTargets(targets)).toBe(true);
  });

  it.each([
    null,
    [],
    {},
    { ...completeTargets, Extra: 0 },
    {
      "Renda fixa": 50,
      "Renda variável": 20,
      Fundos: 20,
      Criptoativos: 5,
      Imóveis: 0,
      Extra: 5,
    },
    { ...completeTargets, Fundos: "20" },
    { ...completeTargets, Fundos: Number.NaN },
    { ...completeTargets, Fundos: Number.POSITIVE_INFINITY },
    { ...completeTargets, Fundos: -1 },
    { ...completeTargets, Fundos: 100.01 },
    { ...completeTargets, Fundos: 20.001 },
    { ...completeTargets, Outros: 4 },
  ])("rejects invalid or incomplete target values: %j", (input) => {
    expect(getPortfolioAllocationTargetCents(input)).toBeNull();
    expect(isValidPortfolioAllocationTargets(input)).toBe(false);
  });
});
