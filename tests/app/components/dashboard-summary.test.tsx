// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardSummary as DashboardSummaryComponent } from "@/app/_components/dashboard-summary";
import { getPortfolioInsights } from "@/lib/portfolio-insights";

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

describe("DashboardSummary", () => {
  afterEach(cleanup);

  it("shows known wealth without a destination and links to objective overview", () => {
    const html = renderToStaticMarkup(
      <DashboardSummary
        positions={positions}
        unassignedSummary={{
          status: "loaded",
          knownValue: 1250,
          positionCount: 2,
          unvaluedPositionCount: 1,
        }}
      />,
    );

    expect(html).toContain("Patrimônio conhecido sem destino");
    expect(html).toContain("2 posições ainda não associadas a um objetivo");
    expect(html).toContain("1 sem valor atual");
    expect(html).toContain("R$");
    expect(html).toContain('href="/portfolio?panel=objectives"');
    expect(html).toContain("Ver objetivos");
  });

  it("shows canonical destinations and guidance without duplicating unassigned totals or a simulator", () => {
    const html = renderToStaticMarkup(
      <DashboardSummary
        positions={positions}
        nextContributionGuidance={{
          status: "target_gap",
          title: "Classe abaixo da meta",
          explanation: "Comparação pessoal",
          assetClass: "ETFs internacionais",
          currentPercentage: 10,
          targetPercentage: 60,
          allocationMode: "strategy",
        }}
        destinationSummary={{
          categories: [{ key: "unassigned", value: 400, percentage: 100 }],
          knownTotal: 400,
          missingPositionCount: 0,
          unvaluedPositionCount: 0,
        }}
        unassignedSummary={{
          status: "loaded",
          knownValue: 400,
          positionCount: 2,
          unvaluedPositionCount: 0,
        }}
      />,
    );
    expect(html).toContain("Destinos da carteira");
    expect(html).toContain("ETFs internacionais");
    expect(html).toContain('href="/strategy#next-contribution"');
    expect(html).not.toContain("Patrimônio conhecido sem destino");
    expect(html).not.toContain("Valor disponível");
  });

  it("reports a destination failure once without a duplicate unassigned error", () => {
    const html = renderToStaticMarkup(
      <DashboardSummary
        positions={positions}
        destinationsUnavailable
        unassignedSummary={{ status: "unavailable" }}
      />,
    );
    expect(html).toContain("Destinos indisponíveis");
    expect(html).not.toContain("Patrimônio sem destino indisponível");
  });

  it.each(["reserve_below_target", "reserve_incomplete"] as const)(
    "avoids repeating the reserve next action for %s",
    (status) => {
      const html = renderToStaticMarkup(
        <DashboardSummary
          positions={positions}
          nextContributionGuidance={{
            status,
            title: "Revisar reserva",
            explanation: "Dados da reserva",
          }}
          emergencyReserve={{
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
            status: "below_target",
          }}
        />,
      );
      expect(html).toContain("Próximo aporte");
      expect(html).not.toContain(
        'aria-labelledby="dashboard-next-action-title"',
      );
    },
  );

  it("keeps the previous simulator accessible in a compact disclosure for legacy targets", async () => {
    const user = userEvent.setup();
    render(
      <DashboardSummary
        positions={positions}
        contributionAllocationMode="legacy"
      />,
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Simular com metas anteriores" }),
    );
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("uses a two-column layout when an unassigned summary and next action are available", () => {
    render(
      <DashboardSummary
        positions={[]}
        unassignedSummary={{
          status: "loaded",
          knownValue: 0,
          positionCount: 0,
          unvaluedPositionCount: 0,
        }}
      />,
    );

    const unassignedSection = screen.getByRole("region", {
      name: "Patrimônio conhecido sem destino",
    });
    const nextActionSection = screen.getByRole("region", {
      name: "Próxima ação",
    });
    const summaryGrid = unassignedSection.parentElement;

    expect(summaryGrid).toBe(nextActionSection.parentElement);
    expect(summaryGrid?.className).toContain("xl:grid-cols-2");
    expect(summaryGrid?.children).toHaveLength(2);
  });

  it("shows an unavailable destination summary without a fabricated amount and retries", async () => {
    const user = userEvent.setup();
    const onRetryUnassigned = vi.fn();
    render(
      <DashboardSummary
        positions={positions}
        unassignedSummary={{ status: "unavailable" }}
        onRetryUnassigned={onRetryUnassigned}
      />,
    );

    expect(
      screen.getByText("Patrimônio sem destino indisponível"),
    ).toBeTruthy();
    expect(screen.getByText(/Nenhum valor foi presumido/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(onRetryUnassigned).toHaveBeenCalledOnce();
  });

  it("prioritizes known wealth and data quality before portfolio observations", () => {
    const html = renderToStaticMarkup(
      <DashboardSummary positions={positions} />,
    );

    expect(html).toContain("Patrimônio conhecido");
    expect(html).toContain("R$");
    expect(html).toContain("2 de 2");
    expect(html).toContain("Dados de 01/09/2026");
    expect(html).toContain("Fatos da carteira");
    expect(html).toContain("Tesouro Selic");
    expect(html).toContain("75.0%");
    expect(html).toContain("Distribuição não mede risco");
    expect(html).toContain("Próximo vencimento");
    expect(html).toContain("Como ler estes dados");
    expect(html).toContain(
      "lg:grid-cols-[minmax(0,1.5fr)_minmax(10rem,0.7fr)_minmax(12rem,0.8fr)]",
    );
    expect(html).toContain("xl:grid-cols-2");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("group-data-[state=open]:rotate-180");
    expect(html).toContain(
      'href="/portfolio?panel=objectives&amp;objective=reserve"',
    );
    expect(html).not.toContain('aria-labelledby="dashboard-next-action-title"');
  });

  it("provides an accessible, keyboard-focusable details disclosure", async () => {
    const user = userEvent.setup();
    render(<DashboardSummary positions={positions} />);

    const trigger = screen.getByRole("button", {
      name: "Como ler estes dados",
    });
    expect(trigger.className).toContain("focus-visible:ring-2");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true",
    );

    await user.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(
      screen.getByText(/O patrimônio soma os valores conhecidos/),
    ).toBeTruthy();
  });

  it("shows an attention from the user's personal reserve target without investment-target guidance", () => {
    const html = renderToStaticMarkup(
      <DashboardSummary
        positions={positions}
        emergencyReserve={{
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
          status: "below_target",
        }}
      />,
    );

    expect(html).toContain('aria-labelledby="dashboard-next-action-title"');
    expect(html).toContain("Acompanhe a evolução da reserva");
    expect(html).not.toContain("Defina sua estratégia de alocação");
  });

  it("does not infer an investment destination when no reserve target exists", () => {
    const html = renderToStaticMarkup(
      <DashboardSummary
        positions={positions}
        emergencyReserve={{
          monthlyExpenses: 100,
          targetMonths: null,
          selectedValue: 200,
          selectedGroups: 1,
          unvaluedGroups: 0,
          referenceDate: "2026-09-01",
          targetValue: null,
          coveredMonths: 2,
          difference: null,
          progressPercentage: null,
          status: "not_configured",
        }}
      />,
    );

    expect(html).toContain("2 meses de despesas");
    expect(html).toContain("Sem meta pessoal configurada");
    expect(html).toContain("Complete a configuração da reserva");
    expect(html).toContain('aria-labelledby="dashboard-next-action-title"');
  });

  it("does not show a redundant next action when the personal goal is met", () => {
    const html = renderToStaticMarkup(
      <DashboardSummary
        positions={positions}
        emergencyReserve={{
          monthlyExpenses: 100,
          targetMonths: 3,
          selectedValue: 300,
          selectedGroups: 1,
          unvaluedGroups: 0,
          referenceDate: "2026-09-01",
          targetValue: 300,
          coveredMonths: 3,
          difference: 0,
          progressPercentage: 100,
          status: "on_target",
        }}
      />,
    );

    expect(html).toContain("Sua meta pessoal está atingida.");
    expect(html).not.toContain('aria-labelledby="dashboard-next-action-title"');
  });

  it("offers reserve settings when monthly expenses are missing", () => {
    const html = renderToStaticMarkup(
      <DashboardSummary
        positions={positions}
        emergencyReserve={{
          monthlyExpenses: null,
          targetMonths: null,
          selectedValue: 200,
          selectedGroups: 1,
          unvaluedGroups: 0,
          referenceDate: "2026-09-01",
          targetValue: null,
          coveredMonths: null,
          difference: null,
          progressPercentage: null,
          status: "not_configured",
        }}
      />,
    );

    expect(html).toContain("Complete a configuração da reserva");
    expect(html).toContain("Informe suas despesas e defina sua meta pessoal");
    expect(html).toContain(
      'href="/portfolio?panel=objectives&amp;objective=reserve&amp;screen=reserve-settings"',
    );
    expect(html).toContain("Configurar reserva");
  });

  it("does not conclude the personal target is unmet when reserve data is incomplete", () => {
    const html = renderToStaticMarkup(
      <DashboardSummary
        positions={positions}
        emergencyReserve={{
          monthlyExpenses: 100,
          targetMonths: 3,
          selectedValue: 200,
          selectedGroups: 1,
          unvaluedGroups: 1,
          missingSelectionCount: 1,
          referenceDate: "2026-09-01",
          targetValue: 300,
          coveredMonths: 2,
          difference: 100,
          progressPercentage: 66.7,
          status: "below_target",
        }}
      />,
    );

    expect(html).not.toContain("A reserva está abaixo da sua meta pessoal");
    expect(html).toContain("Revise as posições selecionadas como reserva");
    expect(html).toContain('aria-labelledby="dashboard-next-action-title"');
    expect(html).toContain(
      'href="/portfolio?panel=objectives&amp;objective=reserve"',
    );
    expect(html).not.toContain("screen=reserve-settings");
  });

  it("offers import as the next action when no positions are known", () => {
    const html = renderToStaticMarkup(<DashboardSummary positions={[]} />);

    expect(html).toContain("Ainda sem valores conhecidos");
    expect(html).toContain("Adicione os dados da sua carteira");
    expect(html).toContain('href="/imports"');
    expect(html).toContain("Importar carteira");
    expect(html.match(/href="\/imports"/g)).toHaveLength(1);
  });

  it("flags positions without values and offers review", () => {
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
    expect(html).toContain("1 sem valor atual");
    expect(html).toContain("Revise as posições sem valor atual");
  });

  it("does not imply a single date when known positions have different dates", () => {
    const html = renderToStaticMarkup(
      <DashboardSummary
        positions={[
          { ...positions[0]!, referenceDate: "2026-09-01" },
          { ...positions[1]!, referenceDate: "2026-08-01" },
        ]}
      />,
    );

    expect(html).toContain("Datas-base variadas ou incompletas");
    expect(html).not.toContain("Dados de 01/09/2026");
  });
});
