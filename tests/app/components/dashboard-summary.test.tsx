// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardSummary as DashboardSummaryComponent } from "@/app/_components/dashboard-summary";
import { getPortfolioInsights } from "@/lib/portfolio-insights";
import type { DashboardDestinationSummary } from "@/app/_components/dashboard-destinations-overview";

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: class {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.callback(
        [
          {
            target,
            contentRect: { width: 500, height: 220 },
          } as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  },
});

type SummaryProps = Omit<
  Parameters<typeof DashboardSummaryComponent>[0],
  "insights"
>;
function DashboardSummary(props: SummaryProps) {
  return (
    <DashboardSummaryComponent
      {...props}
      insights={getPortfolioInsights(
        props.positions,
        new Date("2026-09-30T12:00:00-03:00"),
      )}
    />
  );
}

const positions = [
  {
    product: "CDB Banco A",
    institution: "Banco A",
    maturityAt: "2030-01-01",
    totalValue: "100",
    referenceDate: "2026-09-01",
  },
  {
    product: "Tesouro Selic",
    institution: "Tesouro",
    maturityAt: null,
    totalValue: "300",
    referenceDate: "2026-09-01",
  },
];
const destinations: DashboardDestinationSummary = {
  categories: [
    { key: "reserve", value: 200, percentage: 50 },
    { key: "unassigned", value: 200, percentage: 50 },
  ],
  knownTotal: 400,
  missingPositionCount: 0,
  unvaluedPositionCount: 0,
};

const reserve = {
  monthlyExpenses: 100,
  targetMonths: 3,
  selectedValue: 200,
  selectedGroups: 1,
  unvaluedGroups: 0,
  referenceDate: "2026-09-01",
  targetValue: 300,
  coveredMonths: 2,
  difference: 100,
  progressPercentage: 66.7,
  status: "below_target" as const,
};

describe("DashboardSummary", () => {
  afterEach(cleanup);

  it("prioritizes current wealth and exposes the approved quick actions", () => {
    const html = renderToStaticMarkup(
      <DashboardSummary
        positions={positions}
        destinationSummary={destinations}
      />,
    );

    expect(html).toContain("Patrimônio conhecido");
    expect(html).toMatch(/R\$\s400,00/);
    expect(html).toContain("2 de 2");
    expect(html).toContain("Dados de 01/09/2026");
    expect(html).toContain("Ações rápidas");
    expect(html).toContain("Adicionar posição");
    expect(html).not.toContain('href="/portfolio#manual-positions"');
    expect(html).toContain("Importar e conciliar");
    expect(html).toContain("Ver objetivos");
    expect(html).not.toContain('href="/portfolio?panel=objectives"');
  });

  it("keeps the destinations donut and reserve summary together", () => {
    const html = renderToStaticMarkup(
      <DashboardSummary
        positions={positions}
        destinationSummary={destinations}
        emergencyReserve={reserve}
      />,
    );

    expect(html).toContain("Destinos da carteira");
    expect(html).toContain("Reserva");
    expect(html).toContain("Sem destino");
    expect(html).toContain("Distribuição dos valores conhecidos por destino");
    expect(html).toContain("Reserva de emergência");
    expect(html).toContain("2 meses de despesas");
    expect(html).toMatch(/Faltam R\$\s100,00 para a meta que você escolheu\./);
    expect(html).toContain("xl:grid-cols-2");
  });

  it("opens the dashboard objectives panel from both objective controls", () => {
    const onObjectivesOpenChange = vi.fn();
    render(
      <DashboardSummary
        positions={positions}
        destinationSummary={destinations}
        onObjectivesOpenChange={onObjectivesOpenChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Objetivos" }));
    expect(onObjectivesOpenChange).toHaveBeenCalledWith(true);
  });

  it("keeps the quick objective action safe when no panel controller is provided", () => {
    render(<DashboardSummary positions={positions} />);

    fireEvent.click(screen.getByRole("button", { name: "Ver objetivos" }));
    expect(screen.queryByText("Gerenciar objetivos")).toBeNull();
  });

  it("keeps the import action safe when no panel controller is provided", () => {
    render(<DashboardSummary positions={positions} />);

    const importButton = screen.getByRole("button", {
      name: "Importar e conciliar",
    });
    fireEvent.click(importButton);

    expect(importButton.getAttribute("aria-expanded")).toBe("false");
  });

  it("shows a concise review action only when positions have no current value", () => {
    const html = renderToStaticMarkup(
      <DashboardSummary
        positions={[
          {
            product: "Ativo sem valor",
            institution: null,
            maturityAt: null,
            totalValue: null,
          },
        ]}
      />,
    );

    expect(html).toContain("0 de 1");
    expect(html).toContain("Dados para revisar");
    expect(html).toContain("1 posição sem valor atual");
    expect(html).toContain('href="/portfolio?view=positions"');
    expect(html).not.toContain("Próxima ação");
  });

  it("shows recorded position and maturity facts with their values", () => {
    const html = renderToStaticMarkup(
      <DashboardSummary positions={positions} />,
    );

    expect(html).toContain("Fatos da carteira");
    expect(html).toContain("Tesouro Selic");
    expect(html).toMatch(/R\$\s300,00/);
    expect(html).toContain("75% do patrimônio conhecido");
    expect(html).toContain("Próximo vencimento");
    expect(html).toMatch(/R\$\s100,00/);
    expect(html).not.toContain("Como ler estes dados");
  });

  it("keeps destination failures visible and retries the objectives request", async () => {
    const user = userEvent.setup();
    const onRetryDestinations = vi.fn();
    render(
      <DashboardSummary
        positions={positions}
        destinationsUnavailable
        onRetryDestinations={onRetryDestinations}
      />,
    );

    expect(screen.getByText("Destinos indisponíveis")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(onRetryDestinations).toHaveBeenCalledOnce();
  });

  it("reports partial destination values without making missing data look like zero", () => {
    const summary = {
      ...destinations,
      unvaluedPositionCount: 1,
    };
    const html = renderToStaticMarkup(
      <DashboardSummary positions={positions} destinationSummary={summary} />,
    );

    expect(html).toContain("Distribuição parcial · valores conhecidos.");
  });

  it("does not fabricate facts or unvalued-position review when the portfolio has none", () => {
    const html = renderToStaticMarkup(<DashboardSummary positions={[]} />);

    expect(html).toContain("Ainda sem valores conhecidos");
    expect(html).not.toContain("Dados para revisar");
    expect(html).not.toContain("Fatos da carteira");
  });
});
