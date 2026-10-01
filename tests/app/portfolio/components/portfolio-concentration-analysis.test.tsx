// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { PortfolioConcentrationAnalysis as PortfolioConcentrationAnalysisComponent } from "@/app/portfolio/_components/portfolio-concentration-analysis";
import {
  getPortfolioConcentration,
  type ConcentrationDimension,
  type PortfolioConcentrationPosition,
} from "@/lib/portfolio-concentration";

function PortfolioConcentrationAnalysis({
  positions,
}: {
  positions: PortfolioConcentrationPosition[];
}) {
  const dimensions: ConcentrationDimension[] = [
    "asset",
    "assetClass",
    "subClass",
    "geography",
  ];
  const analyses = Object.fromEntries(
    dimensions.map((dimension) => [
      dimension,
      getPortfolioConcentration(positions, dimension),
    ]),
  ) as Record<
    ConcentrationDimension,
    ReturnType<typeof getPortfolioConcentration>
  >;
  return <PortfolioConcentrationAnalysisComponent analyses={analyses} />;
}

const positions = [
  {
    id: "1",
    product: "Acao exemplo",
    assetCode: "ACAO3",
    issuer: "Empresa",
    institution: "Corretora",
    totalValue: "75",
    estimatedValue: null,
    source: "IMPORT",
    referenceDate: "2026-09-10",
    classification: {
      assetClass: "Renda Variavel",
      subClass: "Acao",
      geography: null,
    },
    classificationSource: "inferred" as const,
  },
  {
    id: "2",
    product: "Ativo sem classificacao",
    assetCode: null,
    issuer: null,
    institution: null,
    totalValue: "25",
    referenceDate: "2026-09-12",
    classification: { assetClass: null, subClass: null, geography: null },
    classificationSource: "unclassified" as const,
  },
  {
    id: "3",
    product: "Sem valor",
    assetCode: null,
    issuer: null,
    institution: null,
    totalValue: null,
    classification: { assetClass: null, subClass: null, geography: null },
    classificationSource: "unclassified" as const,
  },
];

afterEach(cleanup);

describe("PortfolioConcentrationAnalysis", () => {
  it("explains concentration, classification coverage, dates, and limits by dimension", async () => {
    const user = userEvent.setup();
    render(<PortfolioConcentrationAnalysis positions={positions} />);

    expect(screen.getByRole("heading", { name: /Concentra/ })).toBeTruthy();
    expect(screen.getAllByText(/ACAO3/).length).toBeGreaterThan(0);
    expect(screen.getByText(/1 posi/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Classe" }));
    expect(
      screen
        .getByRole("button", { name: "Classe" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("progressbar", { name: "Renda Variavel: 75,0%" }),
    ).toBeTruthy();
    expect(
      screen
        .getAllByRole("progressbar")
        .some((bar) => bar.getAttribute("aria-label")?.includes("25,0%")),
    ).toBe(true);

    await user.click(screen.getByRole("button", { name: /Base de/ }));
    expect(
      screen.getAllByText(
        (_, element) => element?.textContent?.includes("10/09/2026") ?? false,
      ).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        (_, element) =>
          element?.textContent?.includes("10/09/2026 a 12/09/2026") ?? false,
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(/setor/)).toBeTruthy();
    expect(screen.getByText(/ETFs/)).toBeTruthy();
  });

  it("formats one reference date without creating a range", async () => {
    const user = userEvent.setup();
    render(<PortfolioConcentrationAnalysis positions={[positions[0]]} />);

    await user.click(screen.getByRole("button", { name: /Base de/ }));
    const dateText = screen
      .getAllByText(
        (_, element) =>
          element?.textContent?.includes("Datas de referência") ?? false,
      )
      .find((element) => element.tagName === "P")?.textContent;

    expect(dateText).toContain("10/09/2026");
    expect(dateText).not.toContain(" a ");
  });

  it("preserves a reference date that does not use the expected date format", async () => {
    const user = userEvent.setup();
    render(
      <PortfolioConcentrationAnalysis
        positions={[{ ...positions[0], referenceDate: "data-desconhecida" }]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Base de/ }));
    expect(screen.getByText(/data-desconhecida/)).toBeTruthy();
  });
  it("keeps the missing-value state visible without showing a fabricated percentage", async () => {
    render(<PortfolioConcentrationAnalysis positions={[positions[2]]} />);

    expect(screen.getByRole("status").textContent).toMatch(/posi/);
    expect(screen.queryByRole("progressbar")).toBeNull();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Base de/ }));
    expect(screen.getByText(/Não informada/)).toBeTruthy();
  });
});
