// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatProjectionCurrency,
  formatProjectionAmountInput,
  formatProjectionTooltipLabel,
  getProjectionCalculationFailureMessage,
  getProjectionAxisTicks,
  parseProjectionNumber,
  formatProjectionAxisTimeLabel,
  formatProjectionYearLabel,
  PortfolioObjectiveProjection,
} from "@/app/(private)/portfolio/_components/portfolio-objective-projection";
import type { PortfolioObjective } from "@/app/(private)/portfolio/_components/portfolio-objective-card";

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

function createMonthlyProjectionPoints(monthCount: number) {
  return Array.from({ length: monthCount + 1 }, (_, month) => ({
    year: month / 12,
    investedAmount: 0,
    nominalAmount: 0,
    purchasingPowerAmount: 0,
  }));
}

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

it("formats plural years with a singular remaining month", () => {
  expect(formatProjectionYearLabel(25 / 12)).toContain("2 anos e 1");
});

describe("PortfolioObjectiveProjection", () => {
  afterEach(cleanup);

  it("formats chart labels and values for the projection tooltip", () => {
    expect(formatProjectionYearLabel(10)).toBe("10 anos");
    expect(formatProjectionYearLabel(1)).toBe("1 ano");
    expect(formatProjectionYearLabel(0)).toBe("Início");
    expect(formatProjectionYearLabel("indefinido")).toBe("Início");
    expect(formatProjectionYearLabel(1 / 12)).toBe("1 mês");
    expect(formatProjectionYearLabel(2 / 12)).toBe("2 meses");
    expect(formatProjectionYearLabel(13 / 12)).toBe("1 ano e 1 mês");
    expect(formatProjectionYearLabel(14 / 12)).toBe("1 ano e 2 meses");
    expect(formatProjectionTooltipLabel(0)).toBe("Saldo inicial");
    expect(formatProjectionTooltipLabel(2 / 12)).toBe("Após 2 meses");
    expect(formatProjectionAxisTimeLabel(2 / 12)).toBe("2m");
    expect(formatProjectionAxisTimeLabel(0)).toBe("0");
    expect(formatProjectionAxisTimeLabel("indefinido")).toBe("0");
    expect(formatProjectionAxisTimeLabel(14 / 12)).toBe("1a 2m");
    expect(getProjectionAxisTicks(createMonthlyProjectionPoints(3))).toEqual([
      0,
      1 / 12,
      2 / 12,
      3 / 12,
    ]);
    expect(getProjectionAxisTicks(createMonthlyProjectionPoints(12))).toEqual(
      Array.from({ length: 13 }, (_, month) => month / 12),
    );
    expect(getProjectionAxisTicks(createMonthlyProjectionPoints(13))).toEqual([
      0,
      13 / 12,
    ]);
    expect(getProjectionAxisTicks([])).toEqual([]);
    expect(getProjectionAxisTicks(createMonthlyProjectionPoints(14))).toEqual([
      0,
      14 / 12,
    ]);
    const fiveYearTicks = getProjectionAxisTicks(
      createMonthlyProjectionPoints(60),
    );
    expect(fiveYearTicks).toEqual([0, 1, 2, 3, 4, 5]);
    expect(fiveYearTicks.map(formatProjectionAxisTimeLabel)).toEqual([
      "0",
      "1a",
      "2a",
      "3a",
      "4a",
      "5a",
    ]);
    const longHorizonTicks = getProjectionAxisTicks(
      createMonthlyProjectionPoints(1200),
    );
    expect(longHorizonTicks).toEqual([0, 20, 40, 60, 80, 100]);
    expect(longHorizonTicks).toHaveLength(6);
    expect(longHorizonTicks.at(-1)).toBe(100);
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
    expect((startingAmountInput as HTMLInputElement).value).toBe("65.000,00");
    await user.tab();
    expect((startingAmountInput as HTMLInputElement).value).toBe("65.000,00");

    await user.click(
      screen.getByRole("combobox", { name: "O que quer simular" }),
    );
    await user.click(
      screen.getByRole("option", { name: "Quanto posso acumular?" }),
    );
    expect(screen.queryByLabelText("Meta")).toBeNull();
    expect(screen.queryByLabelText("Valor da meta representa")).toBeNull();
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
    for (const label of ["Saldo inicial", "Aporte mensal"]) {
      const input = screen.getByLabelText(label);
      const originalValue = (input as HTMLInputElement).value;
      fireEvent.change(input, { target: { value: "" } });
      fireEvent.change(input, { target: { value: originalValue } });
    }
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

  it("masks monetary fields as Brazilian currency while typing", async () => {
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

    const startingAmount = screen.getByLabelText("Saldo inicial");
    expect((startingAmount as HTMLInputElement).value).toBe("65.000,00");
    fireEvent.change(startingAmount, { target: { value: "123456" } });
    expect((startingAmount as HTMLInputElement).value).toBe("1.234,56");

    const contribution = screen.getByLabelText("Aporte mensal");
    fireEvent.change(contribution, { target: { value: "987654" } });
    expect((contribution as HTMLInputElement).value).toBe("9.876,54");

    await user.click(
      screen.getByRole("combobox", { name: "O que quer simular" }),
    );
    await user.click(
      screen.getByRole("option", { name: "Quanto preciso aportar?" }),
    );
    const target = screen.getByLabelText("Meta");
    fireEvent.change(target, { target: { value: "123456789" } });
    expect((target as HTMLInputElement).value).toBe("1.234.567,89");
    fireEvent.change(target, { target: { value: "" } });
    Object.defineProperty(target, "selectionStart", {
      configurable: true,
      value: null,
    });
    Object.defineProperty(target, "selectionEnd", {
      configurable: true,
      value: null,
    });
    fireEvent.change(target, { target: { value: "100000000000" } });
    fireEvent.keyDown(
      screen.getByRole("slider", {
        name: "Meta, controle deslizante",
      }),
      { key: "ArrowRight" },
    );
    await user.click(
      screen.getByRole("combobox", { name: "Valor da meta representa" }),
    );
    await user.click(
      screen.getByRole("option", { name: "Poder de compra de hoje" }),
    );
    expect(
      screen.getByRole("combobox", { name: "Valor da meta representa" })
        .textContent,
    ).toContain("Poder de compra de hoje");
  });

  it("keeps the caret at the end while typing and calculates from the masked amount", async () => {
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

    fireEvent.change(screen.getByLabelText("Prazo em anos"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText("Rendimento anual (%)"), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByLabelText("Inflação anual (%)"), {
      target: { value: "0" },
    });

    const startingAmount = screen.getByLabelText(
      "Saldo inicial",
    ) as HTMLInputElement;
    await user.clear(startingAmount);
    await user.type(startingAmount, "123456");

    expect(startingAmount.value).toBe("1.234,56");
    expect(startingAmount.selectionStart).toBe(startingAmount.value.length);
    expect(startingAmount.selectionEnd).toBe(startingAmount.value.length);
    expect(
      within(
        screen.getByRole("region", { name: "Resultado da simulação" }),
      ).getByText("Patrimônio nominal projetado").parentElement?.textContent,
    ).toContain("13.234,56");
  });

  it("keeps the planning form visible while the starting balance and results load", () => {
    render(
      <PortfolioObjectiveProjection
        objective={objective}
        startingBalance={null}
        startingBalanceLoading
      />,
    );

    expect(
      screen.getByRole("status", { name: "Carregando saldo inicial" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("status", { name: "Carregando projeção" }),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Meta")).toBeNull();
    expect(screen.getByLabelText("Prazo em anos")).toBeTruthy();
    expect(screen.getByLabelText("Rendimento anual (%)")).toBeTruthy();
    expect(
      screen.queryByRole("region", { name: "Resultado da simulação" }),
    ).toBeNull();
  });

  it("shows a localized balance error and retries the source on request", async () => {
    const user = userEvent.setup();
    const onRetryStartingBalance = vi.fn();
    render(
      <PortfolioObjectiveProjection
        objective={objective}
        startingBalance={null}
        startingBalanceError="Falha ao carregar o saldo."
        onRetryStartingBalance={onRetryStartingBalance}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain(
      "Falha ao carregar o saldo.",
    );
    expect(screen.queryByLabelText("Meta")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(onRetryStartingBalance).toHaveBeenCalledOnce();
  });

  it("keeps accumulation independent from objective targets", () => {
    const { container } = render(
      <PortfolioObjectiveProjection
        objective={{ ...objective, targetAmount: 16_000 }}
        startingBalance={{
          amount: 12_335.83,
          referenceDate: "2026-10-01",
          source: "portfolio",
          completeness: "complete",
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText("Aporte mensal"), {
      target: { value: "2000" },
    });

    expect(screen.queryByText(/Meta alcançada/)).toBeNull();
    expect(screen.queryByText("Meta nominal")).toBeNull();
    expect(screen.queryByText("Meta real")).toBeNull();
    expect(
      [
        ...container.querySelectorAll(
          ".recharts-xAxis .recharts-cartesian-axis-tick-value",
        ),
      ].map((tick) => tick.textContent),
    ).toEqual(["0", "2a", "4a", "6a", "8a", "10a"]);
    expect(
      screen.getByRole("table", { name: "Evolução anual da projeção" }),
    ).toBeTruthy();
    expect(screen.getByRole("row", { name: /Ano 10/ })).toBeTruthy();
    expect(container.querySelector(".recharts-reference-line")).toBeNull();
    expect(
      screen.getByRole("region", { name: "Resultado da simulação" })
        .textContent,
    ).toContain("Patrimônio nominal projetado");
  });

  it("does not show a goal in accumulation mode even when an objective exists", () => {
    const { container } = render(
      <PortfolioObjectiveProjection
        objective={{ ...objective, targetAmount: 10_000 }}
        startingBalance={{
          amount: 12_335.83,
          referenceDate: "2026-10-01",
          source: "portfolio",
          completeness: "complete",
        }}
      />,
    );

    expect(screen.queryByText(/Meta/)).toBeNull();
    expect(container.querySelector(".recharts-reference-line")).toBeNull();
  });

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
    expect(screen.getByText("Planejar patrimônio").className).toContain(
      "text-lg",
    );
    expect(screen.queryByLabelText("Meta")).toBeNull();
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
    await user.click(
      screen.getByRole("combobox", { name: "O que quer simular" }),
    );
    await user.click(
      screen.getByRole("option", { name: "Quanto preciso aportar?" }),
    );
    expect(screen.getByLabelText("Meta")).toBeTruthy();
    expect(screen.getByLabelText("Valor da meta representa")).toBeTruthy();
    await user.click(
      screen.getByRole("combobox", { name: "O que quer simular" }),
    );
    await user.click(
      screen.getByRole("option", { name: "Quanto posso acumular?" }),
    );
    expect(screen.queryByLabelText("Meta")).toBeNull();
    expect(screen.queryByLabelText("Valor da meta representa")).toBeNull();
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
    expect(screen.getByLabelText("Meta")).toBeTruthy();
    expect(screen.getByLabelText("Valor da meta representa")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Prazo em anos"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText("Rendimento anual (%)"), {
      target: { value: "7" },
    });
    fireEvent.change(screen.getByLabelText("Inflação anual (%)"), {
      target: { value: "4" },
    });
    await user.click(screen.getByRole("combobox", { name: "Aporte aumenta?" }));
    await user.click(
      screen.getByRole("option", { name: "Aumentar pela inflação" }),
    );

    await waitFor(() => {
      expect(screen.getByText("Aporte mensal inicial necessário")).toBeTruthy();
    });
    const calculatedContribution = screen.getByLabelText(
      "Aporte mensal",
    ) as HTMLInputElement;
    expect(calculatedContribution.disabled).toBe(true);
    expect(calculatedContribution.value).not.toBe("0,00");
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
    await user.click(screen.getByRole("combobox", { name: "Aporte aumenta?" }));
    await user.click(screen.getByRole("option", { name: "Manter valor" }));

    expect(
      screen.getByText(
        "As premissas geram um valor fora do limite que podemos calcular.",
      ),
    ).toBeTruthy();
  });
});
