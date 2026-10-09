// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  getLongTermAllocationBreakdown,
  LongTermAllocationBreakdown,
} from "@/app/portfolio/_components/long-term-allocation-breakdown";

describe("LongTermAllocationBreakdown", () => {
  afterEach(cleanup);

  it("groups values by the same classes used by the contribution strategy", () => {
    const breakdown = getLongTermAllocationBreakdown([
      {
        product: "CDB",
        assetClass: "Renda fixa",
        geography: "Brasil",
        positionCount: 1,
        valueCents: "10000",
        knownValueCents: "10000",
        unvaluedPositions: 0,
      },
      {
        product: "ETF de índice",
        assetClass: "Renda variável",
        geography: "Exterior",
        positionCount: 2,
        valueCents: "60000",
        knownValueCents: "60000",
        unvaluedPositions: 0,
      },
      {
        product: "Fundo Imobiliário",
        assetClass: "Fundos",
        geography: "Brasil",
        positionCount: 1,
        valueCents: null,
        knownValueCents: "30000",
        unvaluedPositions: 1,
      },
    ]);

    expect(breakdown.knownTotalCents).toBe("100000");
    expect(breakdown.unvaluedPositions).toBe(1);
    expect(breakdown.classes).toEqual([
      expect.objectContaining({
        id: "fixed_income",
        valueCents: "10000",
        percentage: 10,
      }),
      expect.objectContaining({
        id: "international_etfs",
        valueCents: "60000",
        percentage: 60,
      }),
      expect.objectContaining({ id: "fiis", valueCents: "30000" }),
    ]);
  });

  it("shows the class summary and points to the editable strategy simulator", () => {
    render(
      <LongTermAllocationBreakdown
        positions={[
          {
            product: "Ação",
            assetClass: "Renda variável",
            geography: "Brasil",
            positionCount: 1,
            valueCents: "5000",
            knownValueCents: "5000",
            unvaluedPositions: 0,
          },
          {
            product: "ETF",
            assetClass: "Renda variável",
            geography: "Exterior",
            positionCount: 1,
            valueCents: null,
            knownValueCents: "0",
            unvaluedPositions: 1,
          },
        ]}
      />,
    );

    expect(
      screen.getByText("Composição do investimento de longo prazo"),
    ).toBeTruthy();
    const distribution = within(
      screen.getByRole("list", {
        name: "Valores conhecidos por classe de investimento",
      }),
    );
    expect(distribution.getByText("Ações e BDRs")).toBeTruthy();
    expect(distribution.getByText("R$ 50,00")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Ver estratégia e próximo aporte" })
        .getAttribute("href"),
    ).toBe("/strategy");
    expect(screen.getByText(/1 posição\(ões\) sem valor atual/)).toBeTruthy();
  });

  it("keeps unrecognized products in an explicit other class", () => {
    const breakdown = getLongTermAllocationBreakdown([
      {
        product: "Produto sem classe reconhecida",
        assetClass: null,
        positionCount: 1,
        valueCents: "1250",
        unvaluedPositions: 0,
      },
      {
        product: "Outra posição sem cotação",
        assetClass: null,
        positionCount: 1,
        valueCents: null,
        unvaluedPositions: 1,
      },
    ]);

    expect(breakdown.classes).toEqual([
      expect.objectContaining({
        id: "other",
        label: "Outras posições",
        valueCents: "1250",
        percentage: 100,
      }),
    ]);
  });

  it("explains when no long-term positions have known values", () => {
    render(<LongTermAllocationBreakdown positions={[]} />);
    expect(
      screen.getByText(
        "Ainda não há valores conhecidos em posições de longo prazo.",
      ),
    ).toBeTruthy();
  });
});
