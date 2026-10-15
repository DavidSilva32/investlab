// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardLongTermAllocation } from "@/app/_components/dashboard-long-term-allocation";

vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({
    children,
    config: _config,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div {...props}>{children}</div>
  ),
  ChartTooltip: ({ content }: { content: React.ReactNode }) => <>{content}</>,
  ChartTooltipContent: ({
    formatter,
  }: {
    formatter: (value: number) => string;
  }) => <span data-testid="tooltip-value">{formatter(1)}</span>,
}));
vi.mock("recharts", () => ({
  Cell: ({ fill }: { fill: string }) => <span data-fill={fill} />,
  Pie: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  PieChart: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href}>{children}</a>
  ),
}));

afterEach(cleanup);

describe("DashboardLongTermAllocation", () => {
  it("shows the class breakdown with provenance and returns to destinations", () => {
    const onBack = vi.fn();
    render(
      <DashboardLongTermAllocation
        positions={[]}
        missingPositionCount={1}
        onBack={onBack}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Voltar aos destinos" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Comparar com a estratégia/ }),
    ).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "Composição parcial",
    );
    expect(
      screen.getByText(
        "Ainda não há valores conhecidos nas posições de longo prazo.",
      ),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Voltar aos destinos" }),
    );
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("shows the known value, official class name and valuation date", () => {
    render(
      <DashboardLongTermAllocation
        positions={[
          {
            product: "CDB",
            assetClass: "Renda fixa",
            geography: "Brasil",
            positionCount: 1,
            unvaluedPositions: 0,
            knownValueCents: "125000",
            referenceDate: "2026-10-01",
          },
          {
            product: "Ativo sem classificação",
            assetClass: null,
            geography: null,
            positionCount: 2,
            unvaluedPositions: 0,
            knownValueCents: "50000",
            valueCents: "50000",
          },
        ]}
        missingPositionCount={0}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByRole("img").getAttribute("aria-label")).toContain(
      "Renda fixa",
    );
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain(
      "Classe não identificada",
    );
    expect(screen.getByText("Renda fixa")).toBeTruthy();
    expect(screen.getByText("R$ 1.250,00")).toBeTruthy();
    expect(screen.getByText("R$ 1.750,00")).toBeTruthy();
    expect(screen.getByText("Classe não identificada")).toBeTruthy();
    expect(screen.getByTestId("tooltip-value").textContent).toContain("1,00");
    expect(screen.getByText(/posição\(ões\) sem data/)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "sem classe identificada",
    );
  });

  it("preserves a known reference date that cannot be formatted", () => {
    render(
      <DashboardLongTermAllocation
        positions={[
          {
            product: "CDB",
            assetClass: "Renda fixa",
            geography: "Brasil",
            positionCount: 1,
            unvaluedPositions: 0,
            knownValueCents: "10000",
            referenceDate: "data inválida",
          },
        ]}
        missingPositionCount={0}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText("Valores em data inválida.")).toBeTruthy();
  });

  it("uses the available value field and explains unclassified positions without value", () => {
    render(
      <DashboardLongTermAllocation
        positions={[
          {
            product: "CDB",
            assetClass: "Renda fixa",
            geography: "Brasil",
            positionCount: 1,
            unvaluedPositions: 0,
            knownValueCents: null,
            valueCents: "10000",
            referenceDate: "2026-10-01",
          },
          {
            product: "Ativo sem classe nem valor",
            assetClass: null,
            geography: null,
            positionCount: 1,
            unvaluedPositions: 1,
          },
        ]}
        missingPositionCount={0}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getAllByText("R$ 100,00")).toHaveLength(2);
    expect(screen.getByText("Valores em 01/10/2026.")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "não têm classe identificada",
    );
  });

  it("distinguishes multiple dated values when no position is undated", () => {
    render(
      <DashboardLongTermAllocation
        positions={[
          {
            product: "CDB",
            assetClass: "Renda fixa",
            geography: "Brasil",
            positionCount: 1,
            unvaluedPositions: 0,
            knownValueCents: "10000",
            referenceDate: "2026-10-01",
          },
          {
            product: "Ação",
            assetClass: "Renda variável",
            geography: "Brasil",
            positionCount: 1,
            unvaluedPositions: 0,
            knownValueCents: "20000",
            referenceDate: "2026-10-02",
          },
        ]}
        missingPositionCount={0}
        onBack={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Valores com datas de referência diferentes."),
    ).toBeTruthy();
  });
});
