// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PortfolioDiagnostics } from "@/app/portfolio/_components/portfolio-diagnostics";
import {
  getPortfolioDiagnostics,
  type PortfolioDiagnostic,
} from "@/lib/portfolio-diagnostics";
import { getPortfolioInsights } from "@/lib/portfolio-insights";

vi.mock("@/lib/portfolio-diagnostics", () => ({
  getPortfolioDiagnostics: vi.fn(),
}));
const props = {
  insights: getPortfolioInsights([]),
  classificationStatus: "loaded" as const,
  classDistribution: null,
  positionCount: 2,
};
const rows: PortfolioDiagnostic[] = [
  {
    id: "values",
    severity: "missing",
    title: "Valores ausentes",
    detail: "O total não inclui todas as posições.",
    count: 2,
    action: "positions",
    href: "/portfolio?view=positions",
  },
  {
    id: "estimates",
    severity: "attention",
    title: "Estimativas com ressalvas",
    detail: "Consulte os valores informados.",
    count: 1,
    action: "positions",
    href: "/portfolio?view=positions",
  },
  {
    id: "classification",
    severity: "missing",
    title: "Classes incompletas",
    detail: "Revise as classes informadas.",
    count: 3,
    action: "classification",
  },
  {
    id: "reserve",
    severity: "missing",
    title: "Reserva incompleta",
    detail: "Revise as posições da reserva.",
    action: "reserve",
    href: "/portfolio?panel=objectives&objective=reserve",
  },
  {
    id: "allocation",
    severity: "information",
    title: "Diferença para a meta",
    detail: "A diferença é para a sua meta pessoal.",
    action: "strategy",
    href: "/strategy",
  },
  {
    id: "maturity",
    severity: "information",
    title: "Vencimento informado",
    detail: "O vencimento não confirma resgate.",
    action: "positions",
    href: "/portfolio?view=positions",
  },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PortfolioDiagnostics", () => {
  it("shows an import action for an empty portfolio without safety claims", () => {
    vi.mocked(getPortfolioDiagnostics).mockReturnValue(rows);
    render(<PortfolioDiagnostics {...props} positionCount={0} />);
    expect(
      screen
        .getByRole("link", { name: /Importar posições/ })
        .getAttribute("href"),
    ).toBe("/imports");
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("keeps the no-findings state discreet", () => {
    vi.mocked(getPortfolioDiagnostics).mockReturnValue([]);
    render(<PortfolioDiagnostics {...props} />);
    expect(
      screen.getByText("Sem pontos de revisão nos dados disponíveis."),
    ).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("distinguishes missing data, attention and information with relevant actions and counts", async () => {
    vi.mocked(getPortfolioDiagnostics).mockReturnValue(rows);
    const onReviewClassification = vi.fn();
    render(
      <PortfolioDiagnostics
        {...props}
        onReviewClassification={onReviewClassification}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Revisão da carteira" }),
    ).toBeTruthy();
    expect(screen.getAllByText("Dados incompletos")).toHaveLength(3);
    expect(screen.getByText("Atenção")).toBeTruthy();
    expect(screen.getAllByText("Informação")).toHaveLength(2);
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Ver estratégia/ }).getAttribute("href"),
    ).toBe("/strategy");
    expect(
      screen.getByRole("link", { name: /Ver reserva/ }).getAttribute("href"),
    ).toBe("/portfolio?panel=objectives&objective=reserve");
    expect(screen.getAllByRole("link", { name: /Ver posições/ })).toHaveLength(
      3,
    );
    fireEvent.click(screen.getByRole("button", { name: "Revisar classes" }));
    expect(onReviewClassification).toHaveBeenCalledOnce();
    expect(onReviewClassification).toHaveBeenCalledWith(
      expect.any(HTMLElement),
    );
    expect(screen.queryByText(rows[0].detail)).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Entender: Valores ausentes" }),
    );
    expect(await screen.findByText(rows[0].detail)).toBeTruthy();
  });

  it("links to the classification panel when no callback is provided", () => {
    vi.mocked(getPortfolioDiagnostics).mockReturnValue([rows[2]]);
    render(<PortfolioDiagnostics {...props} />);
    expect(
      screen
        .getByRole("link", { name: /Revisar classes/ })
        .getAttribute("href"),
    ).toBe("/portfolio?panel=classification");
  });
});
