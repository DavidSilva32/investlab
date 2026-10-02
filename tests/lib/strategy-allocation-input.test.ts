import { describe, expect, it } from "vitest";
import {
  distributeRemainingPercentage,
  parseStrategyContributionAmount,
  parseStrategyPercentage,
  strategyPercentagesFromDraft,
  type StrategyPercentageDraft,
} from "@/lib/strategy-allocation-input";

const base: StrategyPercentageDraft = {
  fixed_income: "40,00",
  brazilian_equities: "30,00",
  international_etfs: "20,00",
  fiis: "10,00",
};

describe("strategy allocation input", () => {
  it("parses comma or dot decimals and permits zero", () => {
    expect(parseStrategyPercentage("0")).toBe(0);
    expect(parseStrategyPercentage("12,34")).toBe(1234);
    expect(parseStrategyPercentage("12.34")).toBe(1234);
    expect(parseStrategyPercentage("100,01")).toBeNull();
    expect(parseStrategyPercentage("1,234")).toBeNull();
    expect(parseStrategyPercentage("1,")).toBeNull();
    expect(parseStrategyPercentage("")).toBeNull();
  });

  it("requires an exact sum of 100 percent", () => {
    expect(strategyPercentagesFromDraft(base)).toEqual({
      fixed_income: 40,
      brazilian_equities: 30,
      international_etfs: 20,
      fiis: 10,
    });
    expect(strategyPercentagesFromDraft({ ...base, fiis: "9,99" })).toBeNull();
    expect(
      strategyPercentagesFromDraft({ ...base, fiis: "100,01" }),
    ).toBeNull();
  });

  it("distributes the remainder evenly after explicit invocation", () => {
    expect(
      distributeRemainingPercentage(
        { ...base, fixed_income: "50" },
        "fixed_income",
      ),
    ).toEqual({
      fixed_income: "50",
      brazilian_equities: "16,67",
      international_etfs: "16,67",
      fiis: "16,66",
    });
    expect(
      distributeRemainingPercentage(
        { ...base, fixed_income: "100" },
        "fixed_income",
      ),
    ).toEqual({
      fixed_income: "100",
      brazilian_equities: "0,00",
      international_etfs: "0,00",
      fiis: "0,00",
    });
    expect(distributeRemainingPercentage(base, "fixed_income")).not.toBeNull();
    expect(
      distributeRemainingPercentage(
        { ...base, fixed_income: "101" },
        "fixed_income",
      ),
    ).toBeNull();
  });

  it("parses Brazilian currency input without accepting excess precision", () => {
    expect(parseStrategyContributionAmount("R$ 1.234,56")).toBe(1234.56);
    expect(parseStrategyContributionAmount("R$ 0,01")).toBe(0.01);
    expect(parseStrategyContributionAmount("R$ 1,234")).toBeNull();
    expect(parseStrategyContributionAmount("R$ 0,00")).toBeNull();
    expect(parseStrategyContributionAmount("")).toBeNull();
  });
});
