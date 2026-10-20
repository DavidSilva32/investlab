// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { PortfolioPositions } from "@/app/(private)/analyses/_components/portfolio-positions";
import type { PortfolioPosition } from "@/app/(private)/portfolio/_components/portfolio-classification-list";

const positions: PortfolioPosition[] = [
  {
    id: "cash",
    product: "CDB liquidez diária",
    institution: "Banco",
    totalValue: "1250.00",
    classification: {
      assetClass: "Renda fixa",
      subClass: "CDB",
      geography: "Brasil",
    },
    classificationSource: "manual",
  },
  {
    id: "unknown",
    product: "Investimento sem classificação",
    institution: null,
    totalValue: null,
    classification: {
      assetClass: null,
      subClass: null,
      geography: null,
    },
    classificationSource: "unclassified",
  },
];

afterEach(cleanup);

describe("PortfolioPositions", () => {
  it("lists known classes and preserves positions whose class or value is unknown", async () => {
    render(
      <PortfolioPositions positions={positions} analysesByTicker={new Map()} />,
    );

    expect(screen.getByText("Renda fixa")).toBeTruthy();
    expect(screen.getByText("R$ 1.250,00")).toBeTruthy();
    expect(screen.getByText("Classe não identificada")).toBeTruthy();
    expect(screen.queryByText("CDB liquidez diária")).toBeNull();
    expect(screen.queryByText("Investimento sem classificação")).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Renda fixa/ }));
    await user.click(
      screen.getByRole("button", { name: /Classe não identificada/ }),
    );
    expect(
      screen.getAllByRole("link", { name: /Ver carteira completa/ }),
    ).toHaveLength(2);
  });

  it("opens a compact class summary with its accessible trigger", async () => {
    const user = userEvent.setup();
    render(
      <PortfolioPositions positions={positions} analysesByTicker={new Map()} />,
    );
    const group = screen.getByRole("button", { name: /Renda fixa\s*1/i });

    await user.click(group);

    expect(group.getAttribute("aria-expanded")).toBe("true");
    expect(screen.queryByText("CDB liquidez diária")).toBeNull();
    expect(
      screen.getByText(/aplicações de renda fixa ficam resumidas/i),
    ).toBeTruthy();
  });

  it("shows provided action analysis inside the asset details", async () => {
    const user = userEvent.setup();
    const share: PortfolioPosition = {
      ...positions[0]!,
      id: "share",
      assetCode: "PETR4",
      product: "Ação preferencial",
      classification: {
        assetClass: "Renda variável",
        subClass: "Ação",
        geography: "Brasil",
      },
    };
    render(
      <PortfolioPositions
        positions={[share]}
        tickersNeedingInput={new Set(["PETR4"])}
        analysesByTicker={
          new Map([["PETR4", <p key="analysis">Referência Graham</p>]])
        }
      />,
    );
    const trigger = screen.getByRole("button", { name: "Completar dados" });
    const row = trigger.closest("li")!;

    await user.click(trigger);

    expect(screen.getByText("Referência Graham")).toBeTruthy();
  });

  it("uses canonical cents, falls back for invalid amounts, and labels blank assets", () => {
    const canonical: PortfolioPosition = {
      ...positions[1]!,
      id: "",
      product: "",
      totalValue: null,
      canonicalValueCents: "12500",
    };
    const fallback: PortfolioPosition = {
      ...positions[0]!,
      id: "fallback",
      totalValue: "20.00",
      canonicalValueCents: "invalid",
    };

    render(
      <PortfolioPositions
        positions={[canonical, fallback]}
        analysesByTicker={new Map()}
      />,
    );

    expect(
      screen.getByRole("button", { name: /Classe não identificada/ }),
    ).toBeTruthy();
    expect(screen.queryByText("Ativo")).toBeNull();
    expect(screen.getByText("R$ 125,00")).toBeTruthy();
    expect(screen.getByText("R$ 20,00")).toBeTruthy();
  });

  it("does not offer stock formulas for international ETFs or FIIs", async () => {
    const user = userEvent.setup();
    const etf = {
      ...positions[0]!,
      id: "etf",
      product: "ETF internacional",
      assetCode: "IVVB11",
      classification: {
        assetClass: "Renda variável",
        subClass: "ETF",
        geography: "Exterior",
      },
    };
    const fii = {
      ...positions[0]!,
      id: "fii",
      product: "Fundo imobiliário",
      assetCode: "HGLG11",
      classification: {
        assetClass: "Fundos",
        subClass: "FII",
        geography: "Brasil",
      },
    };
    render(
      <PortfolioPositions
        positions={[etf, fii]}
        analysesByTicker={
          new Map([["IVVB11", <p key="etf">Não usar fórmula</p>]])
        }
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /ETFs internacionais/ }),
    );
    await user.click(
      screen.getByRole("button", { name: /Fundos imobiliários/ }),
    );

    expect(
      screen.getByText(/sem aplicar fórmulas de ações aos ETFs/i),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /sem aplicar fórmulas de ações aos fundos imobiliários/i,
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Não usar fórmula")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Completar dados" }),
    ).toBeNull();
  });

  it("shows a next step for ticker-backed shares and keeps a share without ticker readable", () => {
    const positionsWithoutCompleteIdentity: PortfolioPosition[] = [
      {
        ...positions[0]!,
        id: "petr4",
        assetCode: "PETR4",
        product: "Ação ordinária",
        classification: {
          assetClass: "Renda variável",
          subClass: null,
          geography: "Brasil",
        },
      },
      {
        ...positions[0]!,
        id: "",
        assetCode: null,
        product: "Ação preferencial",
        totalValue: null,
        classification: {
          assetClass: "Renda variável",
          subClass: null,
          geography: "Brasil",
        },
      },
      {
        ...positions[0]!,
        id: "empty-product",
        assetCode: null,
        product: "",
        classification: {
          assetClass: "Renda variável",
          subClass: "Ação",
          geography: "Brasil",
        },
      },
      {
        ...positions[0]!,
        id: "vale3",
        assetCode: "VALE3",
        product: "Ação ordinária",
        classification: {
          assetClass: "Renda variável",
          subClass: null,
          geography: "Brasil",
        },
      },
    ];
    render(
      <PortfolioPositions
        positions={positionsWithoutCompleteIdentity}
        analysesByTicker={
          new Map([["VALE3", <p key="vale">Referências prontas</p>]])
        }
      />,
    );

    expect(screen.getByText(/4 ações para analisar/)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Abrir análise/ }).getAttribute("href"),
    ).toBe("/analises?ticker=PETR4");
    expect(screen.getByText("Ação preferencial")).toBeTruthy();
    expect(screen.getByText("Ação")).toBeTruthy();
    expect(screen.getByText("Valor não informado")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Ver análise da ação" }),
    ).toBeTruthy();
  });

  it("keeps BDRs out of the Brazilian share formulas", () => {
    const bdr: PortfolioPosition = {
      ...positions[0]!,
      id: "bdr",
      assetCode: "AAPL34",
      product: "BDR",
      classification: {
        assetClass: "Renda variável",
        subClass: null,
        geography: "Brasil",
      },
    };
    render(
      <PortfolioPositions
        positions={[bdr]}
        analysesByTicker={
          new Map([["AAPL34", <p key="bdr">Fórmula de ação</p>]])
        }
      />,
    );

    expect(
      screen.getByText(
        "Nenhuma ação brasileira elegível foi confirmada nesta classe.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Fórmula de ação")).toBeNull();
    expect(screen.queryByRole("link", { name: /Abrir análise/ })).toBeNull();
  });

  it("preserves a broad variable-income category without stock formulas", async () => {
    const broadPosition: PortfolioPosition = {
      ...positions[0]!,
      id: "variable-category",
      assetCode: "FUNDX",
      product: "Ativo de renda variável",
      classification: {
        assetClass: "Renda variável",
        subClass: null,
        geography: null,
      },
    };
    render(
      <PortfolioPositions
        positions={[broadPosition]}
        analysesByTicker={new Map([["FUNDX", <p key="analysis">Graham</p>]])}
      />,
    );

    const categoryTrigger = screen.getByRole("button", {
      name: /Renda variável/,
    });
    expect(categoryTrigger).toBeTruthy();
    await userEvent.click(categoryTrigger);

    expect(
      screen.getByText(/consulte carteira para revisar e classificar/i),
    ).toBeTruthy();
    expect(screen.queryByText("Graham")).toBeNull();
    expect(screen.queryByText("Classe não identificada")).toBeNull();
  });
});
