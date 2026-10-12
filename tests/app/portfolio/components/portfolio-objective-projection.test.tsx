// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatProjectionCurrency,
  formatProjectionAmountInput,
  getProjectionCalculationFailureMessage,
  parseProjectionNumber,
  formatProjectionYearLabel,
  PortfolioObjectiveProjection,
} from "@/app/portfolio/_components/portfolio-objective-projection";
import type { PortfolioObjective } from "@/app/portfolio/_components/portfolio-objective-card";

const objective: PortfolioObjective = {
  id: "goal-1",
  kind: "CUSTOM",
  name: "Primeiro milhão",
  targetAmount: 1_000_000,
  monthlyPlannedAmount: 1_000,
  currentValue: 65_000,
  knownValue: 65_000,
  remainingAmount: 935_000,
  progressPercent: 6.5,
  assignedPositionCount: 2,
  missingPositionCount: 0,
  unvaluedPositionCount: 0,
  assignedAssetKeys: ["asset-1", "asset-2"],
  canEditAssignments: true,
};

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

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: () => undefined,
});

Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
  configurable: true,
  value: () => false,
});
Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
  configurable: true,
  value: () => undefined,
});
Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
  configurable: true,
  value: () => undefined,
});

describe("PortfolioObjectiveProjection", () => {
  afterEach(cleanup);

  it("formats chart labels and values for the projection tooltip", () => {
    expect(formatProjectionYearLabel(10)).toBe("Ano 10");
    expect(formatProjectionCurrency(1250)).toBe("R$ 1.250,00");
    expect(parseProjectionNumber("Infinity")).toBeNull();
    expect(parseProjectionNumber("R$ 1.234,56")).toBe(1234.56);
    expect(formatProjectionAmountInput(1234.56)).toBe("1.234,56");
  });

  it("only converts numeric range failures into a client-safe message", () => {
    expect(getProjectionCalculationFailureMessage(new RangeError())).toMatch(
      /fora do limite/,
    );
    expect(() =>
      getProjectionCalculationFailureMessage(new TypeError("unexpected")),
    ).toThrow("unexpected");
  });

  it("shows the sourced starting wealth and updates both purchasing-power paths as inputs change", async () => {
    const user = userEvent.setup();
    render(
      <PortfolioObjectiveProjection
        objective={objective}
        startingBalance={{
          amount: 65_000,
          referenceDate: "2026-10-01",
          source: "portfolio",
          completeness: "complete",
        }}
      />,
    );

    expect(
      (screen.getByLabelText("Saldo inicial") as HTMLInputElement).value,
    ).toBe("65.000,00");
    expect(screen.getAllByText("R$").length).toBeGreaterThan(0);
    expect(screen.getByText("Sobre o cálculo")).toBeTruthy();
    expect(screen.queryByText(/O cenário inicial usa 0%/)).toBeNull();
    expect(
      (screen.getByLabelText("Rendimento anual (%)") as HTMLInputElement).value,
    ).toBe("12");
    expect(
      (screen.getByLabelText("Inflação anual (%)") as HTMLInputElement).value,
    ).toBe("5.14");
    expect(
      (screen.getByLabelText("Prazo em anos") as HTMLInputElement).value,
    ).toBe("10");
    expect(
      screen.getByRole("region", { name: "Resultado da simulação" }),
    ).toBeTruthy();
    expect(screen.getByText(/Patrimônio conhecido/)).toBeTruthy();
    expect(
      screen.getByRole("slider", {
        name: "Saldo inicial, controle deslizante",
      }),
    ).toBeTruthy();

    const startingAmountInput = screen.getByLabelText("Saldo inicial");
    await user.click(startingAmountInput);
    expect((startingAmountInput as HTMLInputElement).value).toBe("65000");
    await user.tab();
    expect((startingAmountInput as HTMLInputElement).value).toBe("65.000,00");

    await user.click(
      screen.getByRole("combobox", { name: "O que quer simular" }),
    );
    await user.click(
      screen.getByRole("option", { name: "Quanto posso acumular?" }),
    );
    fireEvent.change(screen.getByLabelText("Meta"), {
      target: { value: "2000000" },
    });
    fireEvent.change(screen.getByLabelText("Prazo em anos"), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByLabelText("Rendimento anual (%)"), {
      target: { value: "8" },
    });
    fireEvent.change(screen.getByLabelText("Rendimento anual (%)"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Rendimento anual (%)"), {
      target: { value: "8" },
    });
    fireEvent.change(screen.getByLabelText("Inflação anual (%)"), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByLabelText("Inflação anual (%)"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Inflação anual (%)"), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByLabelText("Saldo inicial"), {
      target: { value: "70000" },
    });
    fireEvent.change(screen.getByLabelText("Saldo inicial"), {
      target: { value: "100000000" },
    });
    fireEvent.change(screen.getByLabelText("Aporte mensal"), {
      target: { value: "1200" },
    });
    for (const label of ["Meta", "Saldo inicial", "Aporte mensal"]) {
      const input = screen.getByLabelText(label);
      const originalValue = (input as HTMLInputElement).value;
      fireEvent.change(input, { target: { value: "" } });
      fireEvent.change(input, { target: { value: originalValue } });
    }
    await user.click(
      screen.getByRole("combobox", { name: "Valor da meta representa" }),
    );
    await user.click(
      screen.getByRole("option", { name: "Poder de compra de hoje" }),
    );
    await user.click(screen.getByRole("combobox", { name: "Aporte aumenta?" }));
    await user.click(
      screen.getByRole("option", { name: "Aumentar pela inflação" }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("region", { name: "Resultado da simulação" }),
      ).toBeTruthy();
    });
    expect(screen.getByText("Patrimônio nominal projetado")).toBeTruthy();
    expect(
      screen.getByText("Patrimônio em poder de compra de hoje"),
    ).toBeTruthy();
    expect(screen.getByLabelText(/Gráfico com projeção nominal/)).toBeTruthy();
    expect(screen.getByLabelText(/Gráfico com projeção nominal/)).toBeTruthy();

    const editableSliders = [
      "Meta, controle deslizante",
      "Prazo em anos, controle deslizante",
      "Rendimento anual (%), controle deslizante",
      "Saldo inicial, controle deslizante",
      "Inflação anual (%), controle deslizante",
      "Aporte mensal, controle deslizante",
    ];
    for (const name of editableSliders) {
      const slider = screen.getByRole("slider", { name });
      fireEvent.keyDown(slider, { key: "ArrowRight" });
    }

    const returnSlider = screen.getByRole("slider", {
      name: "Rendimento anual (%), controle deslizante",
    });
    fireEvent.change(screen.getByLabelText("Rendimento anual (%)"), {
      target: { value: "1001" },
    });
    expect(
      screen
        .getByLabelText("Rendimento anual (%)")
        .getAttribute("aria-invalid"),
    ).toBe("true");
    expect(screen.getByText(/taxa maior que -100% e até 1.000%/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Rendimento anual (%)"), {
      target: { value: "8" },
    });
    fireEvent.keyDown(returnSlider, { key: "ArrowRight" });
    await waitFor(() => {
      expect(
        screen.getByRole("region", { name: "Resultado da simulação" }),
      ).toBeTruthy();
    });
  }, 15_000);

  it("asks for a starting balance instead of treating missing data as zero", () => {
    render(
      <PortfolioObjectiveProjection
        objective={objective}
        startingBalance={null}
      />,
    );

    expect(screen.getByText(/incompleto/)).toBeTruthy();
    expect(
      (screen.getByLabelText("Saldo inicial") as HTMLInputElement).value,
    ).toBe("");
    expect(
      screen.queryByRole("region", { name: "Resultado da simulação" }),
    ).toBeNull();
  });

  it("uses the known wealth as initial balance and explains when it is partial", () => {
    render(
      <PortfolioObjectiveProjection
        objective={null}
        startingBalance={{
          amount: 63_171.81,
          referenceDate: null,
          source: "portfolio",
          completeness: "partial",
        }}
      />,
    );

    expect(
      (screen.getByLabelText("Saldo inicial") as HTMLInputElement).value,
    ).toBe("63.171,81");
    expect(screen.getByText(/Patrimônio conhecido \(parcial\)/)).toBeTruthy();
    expect(
      screen.getByText(/saldo parcial.*posições sem valor.*data-base única/i),
    ).toBeTruthy();
  });

  it("opens with editable scenario assumptions and accepts an explicit zero", async () => {
    const user = userEvent.setup();
    render(
      <PortfolioObjectiveProjection objective={null} startingBalance={null} />,
    );
    expect((screen.getByLabelText("Meta") as HTMLInputElement).value).toBe(
      "1.000.000,00",
    );
    expect(
      (screen.getByLabelText("Prazo em anos") as HTMLInputElement).value,
    ).toBe("10");
    expect(
      (screen.getByLabelText("Rendimento anual (%)") as HTMLInputElement).value,
    ).toBe("12");
    expect(
      (screen.getByLabelText("Inflação anual (%)") as HTMLInputElement).value,
    ).toBe("5.14");
    expect(
      (screen.getByLabelText("Aporte mensal") as HTMLInputElement).value,
    ).toBe("0,00");
    expect(
      screen.queryByRole("region", { name: "Resultado da simulação" }),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "Sobre o cálculo" }));
    expect(screen.getByText(/12% é uma hipótese editável/)).toBeTruthy();
    expect(screen.getByText(/média do IPCA de 2016–2025/)).toBeTruthy();
    expect(screen.getByText(/não uma previsão/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Saldo inicial"), {
      target: { value: "0" },
    });
    expect(
      screen.getByRole("region", { name: "Resultado da simulação" }),
    ).toBeTruthy();
  });

  it("supports the required-contribution scenario with an inflation-adjusted starting payment", async () => {
    const user = userEvent.setup();
    render(
      <PortfolioObjectiveProjection
        objective={{ ...objective, monthlyPlannedAmount: null }}
        startingBalance={{
          amount: 65_000,
          referenceDate: "2026-10-01",
          source: "objective",
          completeness: "complete",
        }}
      />,
    );

    await user.click(
      screen.getByRole("combobox", { name: "O que quer simular" }),
    );
    await user.click(
      screen.getByRole("option", { name: "Quanto preciso aportar?" }),
    );
    fireEvent.change(screen.getByLabelText("Prazo em anos"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText("Rendimento anual (%)"), {
      target: { value: "7" },
    });
    fireEvent.change(screen.getByLabelText("Inflação anual (%)"), {
      target: { value: "4" },
    });
    await user.click(
      screen.getByRole("combobox", { name: "Valor da meta representa" }),
    );
    await user.click(screen.getByRole("option", { name: "Valor futuro" }));
    await user.click(screen.getByRole("combobox", { name: "Aporte aumenta?" }));
    await user.click(
      screen.getByRole("option", { name: "Aumentar pela inflação" }),
    );

    await waitFor(() => {
      expect(screen.getByText("Aporte mensal inicial necessário")).toBeTruthy();
    });
    expect(
      screen.getByText(
        "Valor do primeiro mês; reajuste anual pela inflação escolhida.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Patrimônio nominal projetado")).toBeTruthy();
    expect(
      screen.getByText("Patrimônio em poder de compra de hoje"),
    ).toBeTruthy();

    await user.click(screen.getByRole("combobox", { name: "Aporte aumenta?" }));
    await user.click(screen.getByRole("option", { name: "Manter valor" }));
    expect(screen.getByText("Aporte mensal necessário")).toBeTruthy();
    expect(
      screen.queryByText(
        "Valor do primeiro mês; reajuste anual pela inflação escolhida.",
      ),
    ).toBeNull();
  });

  it("shows a calculation limit error for assumptions that underflow real purchasing power", async () => {
    const user = userEvent.setup();
    render(
      <PortfolioObjectiveProjection
        objective={objective}
        startingBalance={{
          amount: 65_000,
          referenceDate: "2026-10-01",
          source: "portfolio",
          completeness: "complete",
        }}
      />,
    );

    await user.click(
      screen.getByRole("combobox", { name: "O que quer simular" }),
    );
    await user.click(
      screen.getByRole("option", { name: "Quanto posso acumular?" }),
    );
    fireEvent.change(screen.getByLabelText("Prazo em anos"), {
      target: { value: "100" },
    });
    fireEvent.change(screen.getByLabelText("Rendimento anual (%)"), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByLabelText("Inflação anual (%)"), {
      target: { value: "-99.99" },
    });
    await user.click(
      screen.getByRole("combobox", { name: "Valor da meta representa" }),
    );
    await user.click(screen.getByRole("option", { name: "Valor futuro" }));
    await user.click(screen.getByRole("combobox", { name: "Aporte aumenta?" }));
    await user.click(screen.getByRole("option", { name: "Manter valor" }));

    expect(
      screen.getByText(
        "As premissas geram um valor fora do limite que podemos calcular.",
      ),
    ).toBeTruthy();
  });
});
