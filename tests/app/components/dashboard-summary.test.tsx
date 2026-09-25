// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DashboardSummary } from "@/app/_components/dashboard-summary";

const positions = [
  {
    product: "CDB",
    institution: "Banco A",
    maturityAt: "2030-01-01",
    totalValue: "100",
  },
];

describe("DashboardSummary", () => {
  it("shows the current summary and route to the full portfolio", () => {
    const html = renderToStaticMarkup(
      <DashboardSummary positions={positions} />,
    );
    expect(html).toContain("Patrimônio atual");
    expect(html).toContain("Ativos acompanhados");
    expect(html).toContain("Maior exposição");
    expect(html).toContain("01/01/2030");
    expect(html).toContain('href="/portfolio"');
    expect(html).toContain("Próximos passos");
    expect(html).toContain("Reserva de emergência");
    expect(html).toContain('href="/analyses"');
  });

  it("includes the reference rates when the API has supplied them", () => {
    const html = renderToStaticMarkup(
      <DashboardSummary
        positions={positions}
        referenceRates={{
          selic: { annualRate: "15", date: "2026-09-18" },
          cdi: null,
        }}
      />,
    );
    expect(html).toContain("Indicadores");
  });
  it("shows the empty imported-data state", () => {
    const html = renderToStaticMarkup(<DashboardSummary positions={[]} />);
    expect(html).toContain("Nenhuma posição importada");
    expect(html).toContain('href="/imports"');
  });

  it("renders every empty summary state when no current data is available", () => {
    const html = renderToStaticMarkup(
      <DashboardSummary
        positions={[
          {
            product: "Sem valor",
            institution: null,
            maturityAt: null,
            totalValue: null,
          },
        ]}
      />,
    );
    expect(html).toContain("Importe uma posição para começar");
    expect(html).toContain("Ainda sem valores atuais");
    expect(html).toContain("Nenhum vencimento informado");
  });
  it("renders the contribution guidance supplied by the overview", () => {
    const html = renderToStaticMarkup(
      <DashboardSummary
        positions={positions}
        nextContributionGuidance={{
          status: "target_gap",
          title: "Class gap for next contribution",
          explanation: "Based on your saved allocation targets.",
        }}
      />,
    );
    expect(html).toContain("Class gap for next contribution");
  });
});
