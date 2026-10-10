// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { FundamentalIndicatorCard } from "@/app/analyses/_components/fundamental-indicator-card";

describe("FundamentalIndicatorCard", () => {
  afterEach(cleanup);

  it("formats multiples as x and opens its explanation by click", async () => {
    render(
      <FundamentalIndicatorCard
        indicator={{
          key: "pe",
          value: 8.4,
          unavailableReason: null,
          referenceDate: "2025-12-31",
          sourceDocument: "DFP",
          periodBasis: "annual",
          marketDataDate: "2026-09-19T15:30:00-03:00",
        }}
      />,
    );
    expect(screen.getByText("8,4x")).toBeTruthy();
    expect(screen.getByText(/Cotação observada em/)).toBeTruthy();
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", {
        name: "Ajuda sobre P/L",
      }),
    );
    expect(
      await screen.findByText(/Compara o valor de mercado da empresa/i),
    ).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(
      screen.queryByText(/Compara o valor de mercado da empresa/i),
    ).toBeNull();
  });

  it("uses a plain-language unavailable message instead of backend jargon", () => {
    render(
      <FundamentalIndicatorCard
        indicator={{
          key: "roe",
          value: null,
          unavailableReason:
            "Indisponível: são necessárias demonstrações financeiras anuais de dois anos consecutivos, com lucro líquido e patrimônio líquido informados.",
          referenceDate: null,
          sourceDocument: null,
        }}
      />,
    );
    expect(screen.getByText("Indisponível")).toBeTruthy();
    expect(
      screen.getByText("Faltam dados compatíveis de lucro e patrimônio."),
    ).toBeTruthy();
  });

  it("shows separate LTM and market dates using São Paulo quote time", () => {
    render(
      <FundamentalIndicatorCard
        indicator={{
          key: "pe",
          value: 5,
          unavailableReason: null,
          referenceDate: "2026-06-30",
          sourceDocument: "ITR",
          periodBasis: "trailing_twelve_months",
          marketDataDate: "2026-09-19T15:30:00-03:00",
        }}
      />,
    );

    expect(
      screen.getByText(
        /Últimos 12 meses até 30 de jun\. de 2026 · Cotação observada em 19\/09\/2026, 15:30/,
      ),
    ).toBeTruthy();
  });
  it("identifies the accumulated interim statement used by the indicator", () => {
    render(
      <FundamentalIndicatorCard
        indicator={{
          key: "pb",
          value: 1.2,
          unavailableReason: null,
          referenceDate: "2026-06-30",
          sourceDocument: "ITR",
          periodBasis: "year_to_date",
        }}
      />,
    );

    expect(screen.getByText("1,2x")).toBeTruthy();
    expect(screen.getByText(/Acumulado no ano até/)).toBeTruthy();
  });

  it("labels point-in-time balances and quarterly periods separately", () => {
    const { rerender } = render(
      <FundamentalIndicatorCard
        indicator={{
          key: "pb",
          value: 1.2,
          unavailableReason: null,
          referenceDate: "2026-06-30",
          sourceDocument: "ITR",
          periodBasis: "point_in_time",
        }}
      />,
    );
    expect(screen.getByText(/Saldo informado em/)).toBeTruthy();

    rerender(
      <FundamentalIndicatorCard
        indicator={{
          key: "netMargin",
          value: 12,
          unavailableReason: null,
          referenceDate: "2026-06-30",
          sourceDocument: "ITR",
          periodBasis: "quarterly",
        }}
      />,
    );
    expect(screen.getByText(/Trimestre encerrado em/)).toBeTruthy();

    rerender(
      <FundamentalIndicatorCard
        indicator={{
          key: "roe",
          value: 12,
          unavailableReason: null,
          referenceDate: "2026-06-30",
          sourceDocument: "ITR",
        }}
      />,
    );
    expect(screen.getByText(/Acumulado no ano até/)).toBeTruthy();
  });

  it("makes an invalid market quote timestamp explicit", () => {
    render(
      <FundamentalIndicatorCard
        indicator={{
          key: "pe",
          value: 8.4,
          unavailableReason: null,
          referenceDate: "2025-12-31",
          sourceDocument: "DFP",
          periodBasis: "annual",
          marketDataDate: "2026-99-99T99:99:99Z",
        }}
      />,
    );

    expect(screen.getByText(/Data da cotação não informada/)).toBeTruthy();
  });

  it.each([
    ["threshold_not_configured", "Defina um limite nas configurações"],
    [
      "financial_sector_methodology_required",
      "A metodologia atual não compara este indicador neste setor.",
    ],
    [
      "financial_roe_requires_ltm",
      "Para bancos, o ROE só é comparado com lucro dos últimos 12 meses.",
    ],
    [
      "positive_equity_required",
      "É necessário patrimônio líquido positivo para avaliar o ROE.",
    ],
    [
      "market_data_date_required",
      "A data da cotação usada no múltiplo não está disponível.",
    ],
    [
      "positive_multiple_required",
      "O múltiplo precisa ser positivo para comparação.",
    ],
  ] as const)("explains the %s criterion state", async (reason, message) => {
    render(
      <FundamentalIndicatorCard
        indicator={{
          key:
            reason === "positive_equity_required" ||
            reason === "financial_roe_requires_ltm"
              ? "roe"
              : "pe",
          value: 8.4,
          unavailableReason: null,
          referenceDate: "2025-12-31",
          sourceDocument: "DFP",
          marketDataDate: null,
        }}
        criterion={{
          status: "unavailable",
          reason,
          value: 8.4,
          threshold: null,
        }}
      />,
    );
    await userEvent.setup().click(
      screen.getByRole("button", {
        name: `Ajuda sobre ${reason === "positive_equity_required" || reason === "financial_roe_requires_ltm" ? "ROE" : "P/L"}`,
      }),
    );
    expect(await screen.findByText(new RegExp(message))).toBeTruthy();
  });

  it.each([
    [null, "Faltam dados compatíveis de preço e lucro."],
    [12, "Os dados disponíveis não permitem aplicar este limite."],
  ] as const)(
    "explains an otherwise unavailable criterion with value %s",
    async (value, message) => {
      render(
        <FundamentalIndicatorCard
          indicator={{
            key: "pe",
            value,
            unavailableReason: null,
            referenceDate: null,
            sourceDocument: null,
          }}
          criterion={{
            status: "unavailable",
            reason: "industrial_indicator_not_in_contract",
            value,
            threshold: null,
          }}
        />,
      );
      await userEvent
        .setup()
        .click(screen.getByRole("button", { name: "Ajuda sobre P/L" }));
      expect((await screen.findAllByText(message)).length).toBeGreaterThan(0);
    },
  );
});
