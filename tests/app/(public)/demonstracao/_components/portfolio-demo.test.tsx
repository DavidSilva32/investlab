// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatSampleCurrency,
  formatSamplePercentage,
  PortfolioDemo,
} from "@/app/(public)/demonstracao/_components/portfolio-demo";

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

describe("PortfolioDemo", () => {
  it("formats the illustrative chart values with their units", () => {
    expect(formatSampleCurrency(18400)).toBe("R$ 18.400");
    expect(formatSamplePercentage(35)).toBe("35%");
  });

  it("shows the positions view with a fictional allocation and sample holdings", () => {
    render(<PortfolioDemo />);

    expect(
      screen
        .getByRole("tab", { name: "Posições" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByText("Composição conhecida")).toBeTruthy();
    expect(screen.getByText("CDB de exemplo")).toBeTruthy();
    expect(screen.getByText("ETF de exemplo")).toBeTruthy();
    expect(
      screen.getByRole("img", {
        name: /Composição fictícia da carteira/,
      }),
    ).toBeTruthy();
  });

  it("switches to the objectives view and shows the illustrative progress", async () => {
    const user = userEvent.setup();
    render(<PortfolioDemo />);

    await user.click(screen.getByRole("tab", { name: "Objetivos" }));

    expect(
      screen
        .getByRole("tab", { name: "Objetivos" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByText("Reserva de exemplo")).toBeTruthy();
    expect(screen.getByText("70% do valor-alvo fictício")).toBeTruthy();
    expect(
      screen.getByText(/Não representa prazo, rentabilidade/),
    ).toBeTruthy();
  });

  it("switches to the strategy view and labels sample percentages as user-defined", async () => {
    const user = userEvent.setup();
    render(<PortfolioDemo />);

    await user.click(screen.getByRole("tab", { name: "Estratégia" }));

    expect(
      screen
        .getByRole("tab", { name: "Estratégia" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      screen.getByText("Percentuais fictícios escolhidos pela pessoa"),
    ).toBeTruthy();
    expect(
      screen.getByRole("img", {
        name: /Estratégia fictícia definida pela pessoa/,
      }),
    ).toBeTruthy();
    expect(screen.getByText("Ações e BDRs")).toBeTruthy();
  });
});
