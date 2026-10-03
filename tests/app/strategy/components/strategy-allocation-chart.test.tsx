// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatStrategyPercentage,
  formatStrategyTooltip,
  StrategyAllocationChart,
} from "@/app/strategy/_components/strategy-allocation-chart";
import {
  getStrategyAssetClassColor,
  strategyAssetClasses,
} from "@/lib/strategy-allocation";

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: class {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.callback(
        [
          {
            target,
            contentRect: { width: 500, height: 220 },
          } as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  },
});

afterEach(cleanup);

describe("StrategyAllocationChart", () => {
  it("formats tooltip values as percentages with two decimal places", () => {
    expect(formatStrategyPercentage(12.345)).toBe("12,35%");
  });

  it("uses the shared semantic class-color tokens", () => {
    expect(
      strategyAssetClasses.map(({ id }) => [
        id,
        getStrategyAssetClassColor(id),
      ]),
    ).toEqual([
      ["fixed_income", "var(--asset-class-fixed-income)"],
      ["brazilian_equities", "var(--asset-class-brazilian-equities)"],
      ["international_etfs", "var(--asset-class-international-etfs)"],
      ["fiis", "var(--asset-class-fiis)"],
    ]);
  });

  it("identifies each tooltip percentage with its class and color", () => {
    const { container, rerender } = render(
      formatStrategyTooltip(50, "international_etfs"),
    );
    expect(screen.getByText("ETFs internacionais")).toBeTruthy();
    expect(screen.getByText("50,00%").getAttribute("style")).toContain(
      "--asset-class-international-etfs",
    );
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();

    rerender(formatStrategyTooltip(12.5, "unknown"));
    expect(screen.getByText("12,50%")).toBeTruthy();
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
            name: "Planejada",
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
    expect(screen.getByText("Ações e BDRs")).toBeTruthy();
    expect(screen.getByText("ETFs internacionais")).toBeTruthy();
    expect(screen.getByText("Fundos imobiliários (FIIs)")).toBeTruthy();
    expect(screen.getAllByText("40%").length).toBeGreaterThan(0);
    expect(screen.queryByText("10%")).toBeNull();
  });
});
