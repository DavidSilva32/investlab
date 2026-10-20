// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  getPortfolioSummary,
  PortfolioSummary,
} from "@/app/(private)/analyses/_components/portfolio-summary";
import type { PortfolioPosition } from "@/app/(private)/portfolio/_components/portfolio-classification-list";

const positions: PortfolioPosition[] = [
  {
    id: "fixed",
    product: "CDB",
    institution: "Banco",
    totalValue: "150.00",
    classification: {
      assetClass: "Renda fixa",
      subClass: "CDB",
      geography: "Brasil",
    },
    classificationSource: "manual",
  },
  {
    id: "equity",
    product: "PETR4",
    assetCode: "PETR4",
    institution: "Corretora",
    totalValue: "50.00",
    classification: {
      assetClass: "Renda variável",
      subClass: "Ação",
      geography: "Brasil",
    },
    classificationSource: "manual",
  },
  {
    id: "unknown",
    product: "Ativo sem cotação",
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

describe("PortfolioSummary", () => {
  it("sums known amounts only and groups identified and unknown classes", () => {
    const summary = getPortfolioSummary(positions);

    expect(summary.count).toBe(3);
    expect(summary.knownValueCents).toBe(20_000n);
    expect(summary.unvaluedCount).toBe(1);
    expect(summary.groups.map(({ id, count }) => [id, count])).toEqual([
      ["fixed_income", 1],
      ["brazilian_equities", 1],
      ["unclassified", 1],
    ]);
  });

  it("shows a simple summary and explains missing values", () => {
    render(<PortfolioSummary positions={positions} />);

    expect(screen.getByText("Sua carteira")).toBeTruthy();
    expect(screen.getByText("R$ 200,00")).toBeTruthy();
    expect(screen.getByText("Ações e BDRs")).toBeTruthy();
    expect(screen.getByText("Renda fixa")).toBeTruthy();
    expect(screen.getByText("Classe não identificada")).toBeTruthy();
    expect(
      screen.getByText(
        /valores conhecidos; posições sem valor não são somadas como zero/i,
      ),
    ).toBeTruthy();
  });

  it("does not display zero as a known valuation when every position lacks a value", () => {
    render(<PortfolioSummary positions={[positions[2]!]} />);

    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.getByText("Sem valor atual")).toBeTruthy();
  });

  it("prefers valid canonical cents and marks multiple positions in a class", () => {
    const groupedPositions = [
      positions[0]!,
      {
        ...positions[0]!,
        id: "fixed-canonical",
        totalValue: "9999.00",
        canonicalValueCents: "22500",
      },
      {
        ...positions[0]!,
        id: "fixed-invalid-canonical",
        totalValue: "10.00",
        canonicalValueCents: "invalid",
      },
    ];
    const summary = getPortfolioSummary(groupedPositions);
    render(<PortfolioSummary positions={groupedPositions} />);

    expect(summary.knownValueCents).toBe(38_500n);
    expect(summary.groups[0]?.count).toBe(3);
    expect(
      screen.getByText((_, element) => element?.textContent === "3 posições"),
    ).toBeTruthy();
  });

  it("shows a known zero balance as zero instead of treating it as absent", () => {
    render(
      <PortfolioSummary
        positions={[
          {
            ...positions[0]!,
            totalValue: "0.00",
          },
        ]}
      />,
    );

    expect(screen.getAllByText("R$ 0,00")).toHaveLength(2);
    expect(screen.queryByText("—")).toBeNull();
    expect(
      getPortfolioSummary([{ ...positions[0]!, totalValue: "0.00" }]),
    ).toMatchObject({ knownValueCount: 1, unvaluedCount: 0 });
  });

  it("shows zero for a class with a known zero amount", () => {
    const summary = getPortfolioSummary([
      { ...positions[0]!, totalValue: "0.00" },
      positions[2]!,
    ]);
    render(
      <PortfolioSummary
        positions={[{ ...positions[0]!, totalValue: "0.00" }, positions[2]!]}
      />,
    );

    expect(summary.groups[0]).toMatchObject({
      valueCents: 0n,
      knownValueCount: 1,
    });
    expect(screen.getAllByText("R$ 0,00")).toHaveLength(2);
  });
});
