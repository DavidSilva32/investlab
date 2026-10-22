// @vitest-environment jsdom
import type React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";

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

const chartConfig = {
  nominalAmount: { label: "Patrimônio nominal", color: "#60a5fa" },
  purchasingPowerAmount: { label: "Patrimônio real", color: "#fbbf24" },
};
const themedChartConfig = {
  value: {
    label: "Valor",
    theme: { light: "#60a5fa", dark: "#93c5fd" },
  },
};

const tooltipPayload = [
  {
    dataKey: "nominalAmount",
    name: "nominalAmount",
    value: 124,
    color: "#60a5fa",
    type: "area",
    payload: { fill: "url(#projection-nominal-fill)" },
  },
  {
    dataKey: "purchasingPowerAmount",
    name: "purchasingPowerAmount",
    value: 92,
    color: "#fbbf24",
    type: "area",
    payload: { fill: "url(#projection-real-fill)" },
  },
] as unknown as React.ComponentProps<typeof ChartTooltipContent>["payload"];

describe("ChartTooltipContent", () => {
  afterEach(cleanup);

  it("formats a numeric chart label and identifies each colored series", () => {
    render(
      <ChartContainer config={chartConfig}>
        <ChartTooltipContent
          active
          label={2 / 12}
          labelFormatter={(value) =>
            value === 0
              ? "Saldo inicial"
              : `Após ${Math.round(Number(value) * 12)} meses`
          }
          payload={tooltipPayload}
          valueFormatter={(value) => `R$ ${Number(value).toFixed(2)}`}
        />
      </ChartContainer>,
    );

    expect(screen.queryByText("Após 2 meses")).not.toBeNull();
    expect(screen.queryByText("Patrimônio nominal")).not.toBeNull();
    expect(screen.queryByText("Patrimônio real")).not.toBeNull();
    expect(screen.queryByText("R$ 124.00")).not.toBeNull();
    expect(screen.queryByText("R$ 92.00")).not.toBeNull();
    expect(
      document.querySelector<HTMLElement>(
        '[data-chart-tooltip-row="nominalAmount"] [data-chart-tooltip-indicator]',
      )?.style.backgroundColor,
    ).toBe("rgb(96, 165, 250)");
    expect(
      document.querySelector<HTMLElement>(
        '[data-chart-tooltip-row="purchasingPowerAmount"] [data-chart-tooltip-indicator]',
      )?.style.backgroundColor,
    ).toBe("rgb(251, 191, 36)");
  });

  it("passes the numeric starting point to the label formatter", () => {
    render(
      <ChartContainer config={chartConfig}>
        <ChartTooltipContent
          active
          label={0}
          labelFormatter={(value) =>
            value === 0 ? "Saldo inicial" : String(value)
          }
          payload={tooltipPayload}
        />
      </ChartContainer>,
    );

    expect(screen.queryByText("Saldo inicial")).not.toBeNull();
  });
});

describe("ChartContainer theme support", () => {
  afterEach(cleanup);

  it("applies dark chart colors to every dark palette", () => {
    const { container } = render(
      <ChartContainer config={themedChartConfig}>
        <div />
      </ChartContainer>,
    );

    const style = container.querySelector("style")?.textContent;
    expect(style).toContain(".dark [data-chart=");
    expect(style).toContain("--color-value: #93c5fd");
  });
});
