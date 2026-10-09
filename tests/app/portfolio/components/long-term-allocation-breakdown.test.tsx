// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
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
        referenceDate: "2026-10-01",
      },
    ]);

    expect(breakdown.knownValueCents).toBe("100000");
    expect(breakdown.unvaluedPositionCount).toBe(1);
    expect(breakdown.valuationDates).toEqual(["2026-10-01"]);
    expect(breakdown.classes).toEqual([
      expect.objectContaining({
        id: "fixed_income",
        knownValueCents: "10000",
        currentPercentage: 10,
      }),
      expect.objectContaining({
        id: "international_etfs",
        knownValueCents: "60000",
        currentPercentage: 60,
      }),
      expect.objectContaining({ id: "fiis", knownValueCents: "30000" }),
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
            referenceDate: "2026-10-01",
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
          {
            product: "CDB",
            assetClass: "Renda fixa",
            geography: "Brasil",
            positionCount: 1,
            valueCents: "2500",
            knownValueCents: "2500",
            unvaluedPositions: 0,
            referenceDate: "2026-10-02",
          },
        ]}
      />,
    );

    expect(
      screen.getByText("Composição atual do investimento de longo prazo"),
    ).toBeTruthy();
    const distribution = within(
      screen.getByRole("list", {
        name: "Distribuição atual por classe de investimento",
      }),
    );
    expect(distribution.getByText("Ações e BDRs")).toBeTruthy();
    expect(distribution.getByText("R$ 50,00")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Comparar com a estratégia" })
        .getAttribute("href"),
    ).toBe("/strategy");
    expect(
      screen.getByText(/1 posição\(ões\) sem valor conhecido/),
    ).toBeTruthy();
    expect(
      screen.getByText("Datas conhecidas: 01/10/2026, 02/10/2026."),
    ).toBeTruthy();
  });

  it("keeps unrecognized products in an explicit unknown class", () => {
    const breakdown = getLongTermAllocationBreakdown([
      {
        product: "Produto sem classe reconhecida",
        assetClass: null,
        positionCount: 1,
        valueCents: "1250",
        knownValueCents: "1250",
        unvaluedPositions: 0,
      },
      {
        product: "Outra posição sem cotação",
        assetClass: null,
        positionCount: 1,
        valueCents: null,
        knownValueCents: "0",
        unvaluedPositions: 1,
        referenceDate: null,
      },
    ]);

    expect(breakdown.classes).toEqual([
      expect.objectContaining({
        id: "unclassified",
        label: "Classe não identificada",
        knownValueCents: "1250",
        currentPercentage: 100,
        percentageBasisPoints: 10000,
        color: "var(--asset-class-neutral)",
      }),
    ]);
  });

  it("explains missing classifications and missing objective assignments", () => {
    render(
      <LongTermAllocationBreakdown
        missingPositionCount={1}
        positions={[
          {
            product: "Ativo de renda variável",
            assetClass: "Renda variável",
            geography: "Brasil",
            positionCount: 1,
            valueCents: "6000",
            knownValueCents: "6000",
            unvaluedPositions: 0,
            referenceDate: "2026-10-01",
          },
        ]}
      />,
    );
    expect(screen.getByText("Classe não identificada")).toBeTruthy();
    expect(screen.getByText("Composição parcial")).toBeTruthy();
    expect(
      screen.getByText(/atribuída\(s\) não foram encontradas/),
    ).toBeTruthy();
    expect(screen.getByText(/sem classe identificada/)).toBeTruthy();
  });

  it("makes all dates available and discloses known positions without dates", () => {
    render(
      <LongTermAllocationBreakdown
        positions={[
          ...["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"].map(
            (referenceDate) => ({
              product: "CDB",
              assetClass: "Renda fixa",
              geography: "Brasil",
              positionCount: 1,
              valueCents: "100",
              knownValueCents: "100",
              unvaluedPositions: 0,
              referenceDate,
            }),
          ),
          {
            product: "CDB sem data",
            assetClass: "Renda fixa",
            geography: "Brasil",
            positionCount: 1,
            valueCents: "100",
            knownValueCents: "100",
            unvaluedPositions: 0,
            referenceDate: null,
          },
        ]}
      />,
    );

    expect(
      screen.getByText(
        /Datas conhecidas: 01\/10\/2026.*1 posição\(ões\) sem data/,
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByText("Ver todas as datas de referência"));
    expect(screen.getByText("04/10/2026")).toBeTruthy();
  });

  it("calls out unknown position classes even when they have no known value", () => {
    render(
      <LongTermAllocationBreakdown
        positions={[
          {
            product: "Ativo sem classificação",
            assetClass: null,
            geography: null,
            positionCount: 1,
            valueCents: "0",
            knownValueCents: "0",
            unvaluedPositions: 0,
          },
        ]}
      />,
    );

    expect(screen.getByText("Composição parcial")).toBeTruthy();
    expect(
      screen.getByText(/1 posição\(ões\) não têm classe identificada/),
    ).toBeTruthy();
  });

  it("marks malformed and unavailable reference dates without inventing one", () => {
    render(
      <LongTermAllocationBreakdown
        positions={[
          {
            product: "CDB",
            assetClass: "Renda fixa",
            geography: "Brasil",
            positionCount: 1,
            valueCents: "875",
            unvaluedPositions: 0,
            referenceDate: "data-inválida",
          },
          {
            product: "CDB sem valor conhecido",
            assetClass: "Renda fixa",
            geography: "Brasil",
            positionCount: 1,
            unvaluedPositions: 0,
            referenceDate: null,
          },
          {
            product: "CDB com data ausente",
            assetClass: "Renda fixa",
            geography: "Brasil",
            positionCount: 1,
            valueCents: "50",
            knownValueCents: "50",
            unvaluedPositions: 0,
            referenceDate: null,
          },
        ]}
      />,
    );

    expect(
      screen.getByText(
        "Datas conhecidas: data-inválida; 1 posição(ões) sem data.",
      ),
    ).toBeTruthy();
  });

  it("explains when no long-term positions have known values", () => {
    render(<LongTermAllocationBreakdown positions={[]} />);
    expect(
      screen.getByText(
        "Ainda não há valores conhecidos nas posições de longo prazo.",
      ),
    ).toBeTruthy();
  });
});
