// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PortfolioOverview } from "@/app/portfolio/_components/portfolio-overview";

describe("PortfolioOverview", () => {
  it("renders allocation, concentration and maturity signals", () => {
    const html = renderToStaticMarkup(
      <PortfolioOverview
        positions={[
          {
            id: "1",
            product: "CDB",
            assetCode: "CDB1",
            quantity: "1",
            institution: "Banco A",
            indexer: null,
            issuedAt: null,
            maturityAt: "2030-01-01",
            totalValue: "100",
          },
        ]}
      />,
    );
    expect(html).toContain("Patrimônio atual");
    expect(html).toContain("Banco A");
    expect(html).toContain("Concentração relevante");
    expect(html).toContain("01/01/2030");
  });

  it("explains unavailable insights without position values", () => {
    const html = renderToStaticMarkup(<PortfolioOverview positions={[]} />);
    expect(html).toContain(
      "Ainda não há valores atuais para mostrar a alocação.",
    );
    expect(html).toContain(
      "Não há vencimentos futuros informados nas posições atuais.",
    );
  });
});
