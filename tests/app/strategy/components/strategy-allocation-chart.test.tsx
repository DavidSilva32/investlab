// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatStrategyPercentage,
  StrategyAllocationChart,
} from "@/app/strategy/_components/strategy-allocation-chart";

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});

afterEach(cleanup);

describe("StrategyAllocationChart", () => {
  it("formats tooltip values as percentages with two decimal places", () => {
    expect(formatStrategyPercentage(12.345)).toBe("12.35%");
  });

  it("labels the current and selected compositions and all classes", () => {
    render(
      <StrategyAllocationChart
        data={[
          {
            name: "Atual",
            fixed_income: 40,
            brazilian_equities: 30,
            international_etfs: 20,
            fiis: 10,
          },
          {
            name: "Escolhida",
            fixed_income: 20,
            brazilian_equities: 30,
            international_etfs: 40,
            fiis: 10,
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("group", {
        name: "Comparação da composição percentual por classe",
      }),
    ).toBeTruthy();
    expect(screen.getByText("Renda fixa")).toBeTruthy();
    expect(screen.getByText("Ações brasileiras")).toBeTruthy();
    expect(screen.getByText("ETFs internacionais")).toBeTruthy();
    expect(screen.getByText("FIIs")).toBeTruthy();
  });
});
