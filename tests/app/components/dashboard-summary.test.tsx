import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DashboardSummary } from "@/app/_components/dashboard-summary";

describe("DashboardSummary", () => {
  it("shows the current summary and route to the full portfolio", () => {
    const html = renderToStaticMarkup(
      <DashboardSummary
        positions={[
          {
            product: "CDB",
            institution: "Banco A",
            maturityAt: "2030-01-01",
            totalValue: "100",
          },
        ]}
      />,
    );
    expect(html).toContain("Patrimônio atual");
    expect(html).toContain("Maior exposição");
    expect(html).toContain("01/01/2030");
    expect(html).toContain('href="/portfolio"');
  });
});
