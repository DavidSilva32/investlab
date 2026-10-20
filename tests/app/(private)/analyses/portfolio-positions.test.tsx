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
  it("lists known classes and preserves positions whose class or value is unknown", () => {
    render(
      <PortfolioPositions positions={positions} analysesByTicker={new Map()} />,
    );

    expect(screen.getByText("Renda fixa")).toBeTruthy();
    expect(screen.getByText("CDB liquidez diária")).toBeTruthy();
    expect(screen.getByText("R$ 1.250,00")).toBeTruthy();
    expect(screen.getByText("Classe não identificada")).toBeTruthy();
    expect(screen.getByText("Investimento sem classificação")).toBeTruthy();
    expect(screen.getByText("Valor não informado")).toBeTruthy();
  });

  it("collapses a class group with its accessible trigger", async () => {
    const user = userEvent.setup();
    render(
      <PortfolioPositions positions={positions} analysesByTicker={new Map()} />,
    );
    const group = screen.getByRole("button", { name: /Renda fixa\s*1/i });

    await user.click(group);

    expect(group.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("CDB liquidez diária")).toBeNull();
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
        analysesByTicker={
          new Map([["PETR4", <p key="analysis">Referência Graham</p>]])
        }
      />,
    );
    const trigger = screen.getByRole("button", {
      name: "Ver análise da ação",
    });
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

    expect(screen.getByText("Ativo")).toBeTruthy();
    expect(screen.getByText("R$ 125,00")).toBeTruthy();
    expect(screen.getByText("R$ 20,00")).toBeTruthy();
  });
});
