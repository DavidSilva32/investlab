// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/portfolio/_components/portfolio-distribution-charts", () => ({
  PortfolioDistributionCharts: ({
    institutionItems,
    classItems,
    unclassifiedValue,
  }: {
    institutionItems: Array<{ label: string }>;
    classItems: Array<{ label: string }> | null;
    unclassifiedValue: number | null;
  }) => (
    <div>
      <p>
        Instituições: {institutionItems.map((item) => item.label).join(", ")}
      </p>
      <p>
        Classes:{" "}
        {classItems?.map((item) => item.label).join(", ") ?? "indisponível"}
      </p>
      <p>Sem classe: {unclassifiedValue ?? "indisponível"}</p>
    </div>
  ),
}));

import {
  PortfolioOverview,
  type ClassifiedPosition,
  type PortfolioPosition,
} from "@/app/portfolio/_components/portfolio-overview";

function position(
  id: string,
  product: string,
  totalValue: string | null,
  institution: string | null = "Banco A",
): PortfolioPosition {
  return {
    id,
    product,
    assetCode: null,
    quantity: "1",
    institution,
    indexer: null,
    issuedAt: null,
    maturityAt: null,
    totalValue,
  };
}

function classified(
  id: string,
  value: string | null,
  assetClass: string | null,
): ClassifiedPosition {
  return {
    id,
    product: id,
    totalValue: value,
    classification: { assetClass, subClass: null, geography: null },
  };
}

describe("PortfolioOverview", () => {
  it("shows known value, completeness, top five values and the full positions path", () => {
    const html = renderToStaticMarkup(
      <PortfolioOverview
        classifiedPositions={[]}
        classificationStatus="loaded"
        positions={[
          position("1", "CDB um", "500"),
          position("2", "CDB dois", "400"),
          position("3", "CDB três", "300"),
          position("4", "CDB quatro", "200"),
          position("5", "CDB cinco", "100"),
          position("6", "CDB seis", "50"),
          position("7", "Sem valor", null),
        ]}
      />,
    );

    expect(html).toContain("Valor conhecido da carteira");
    expect(html).toContain("1.550,00");
    expect(html).toContain("6 de 7 posições com valor");
    expect(html).toContain("Principais posições");
    expect(html).toContain("Ordenadas pelo maior valor conhecido");
    expect(html).toContain("Ver todas as posições");
    expect(html).toContain("/portfolio?view=positions");
    expect(html).toContain("CDB cinco");
    expect(html).not.toContain("CDB seis");
    expect(html).toContain("CDB um");
    expect(html).toContain("32,3% da carteira conhecida");
    expect(html).toContain("1 posição está sem valor atual informado");
  });

  it("shows class coverage and keeps unknown classifications visible", () => {
    const html = renderToStaticMarkup(
      <PortfolioOverview
        positions={[position("1", "Tesouro", "300")]}
        classificationStatus="loaded"
        classifiedPositions={[
          classified("1", "200", "Renda fixa"),
          classified("2", "100", null),
        ]}
      />,
    );

    expect(html).toContain("Classes: Renda fixa, Classe não informada");
    expect(html).toContain("Sem classe: 100");
    expect(html).toContain("100,0% da carteira conhecida");
  });

  it("reports provisional, unavailable and upcoming maturity facts", () => {
    const html = renderToStaticMarkup(
      <PortfolioOverview
        classifiedPositions={[]}
        classificationStatus="loaded"
        positions={[
          {
            ...position("1", "CDB provisório", "100"),
            estimatedValue: 105,
            cdbEstimateStatus: "provisional",
          },
          {
            ...position("2", "CDB indisponível", "200"),
            cdbEstimateStatus: "unavailable",
          },
          {
            ...position("3", "Tesouro", "300"),
            maturityAt: "2099-01-01",
          },
        ]}
      />,
    );

    expect(html).toContain("1 estimativa está provisória");
    expect(html).toContain("Não foi possível atualizar uma estimativa de CDB");
    expect(html).toContain("Próximo vencimento informado: Tesouro");
    expect(html).toContain("01/01/2099");
  });

  it("explains empty and unavailable chart data without financial judgment", () => {
    const html = renderToStaticMarkup(
      <PortfolioOverview
        positions={[]}
        classifiedPositions={null}
        classificationStatus="unavailable"
      />,
    );

    expect(html).toContain("Ainda não há posições com valor conhecido.");
    expect(html).toContain("Classes: indisponível");
    expect(html).toContain("Sem classe: indisponível");
    expect(html).toContain("Não há valores ausentes ou estimativas pendentes");
  });

  it("uses neutral wording for zero-value positions and plural attention counts", () => {
    const html = renderToStaticMarkup(
      <PortfolioOverview
        classifiedPositions={[]}
        classificationStatus="loaded"
        positions={[
          position("1", "Zero", "0", null),
          {
            ...position("2", "Sem valor dois", null),
            cdbEstimateStatus: "provisional",
          },
          {
            ...position("3", "Sem valor três", null),
            cdbEstimateStatus: "provisional",
          },
          {
            ...position("4", "CDB pendente quatro", null),
            cdbEstimateStatus: "unavailable",
          },
          {
            ...position("5", "CDB pendente cinco", null),
            cdbEstimateStatus: "unavailable",
          },
        ]}
      />,
    );

    expect(html).toContain("Instituição não informada");
    expect(html).toContain("0,0% da carteira conhecida");
    expect(html).toContain("4 posições estão sem valor atual informado");
    expect(html).toContain("2 estimativas estão provisórias");
    expect(html).toContain("Não foi possível atualizar 2 estimativas de CDB");
  });
});
