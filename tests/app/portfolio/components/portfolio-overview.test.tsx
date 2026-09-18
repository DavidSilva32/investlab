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
  it("renders balanced multi-institution insights and missing maturity values", () => {
    const html = renderToStaticMarkup(
      <PortfolioOverview
        positions={[
          {
            id: "1",
            product: "A",
            assetCode: null,
            quantity: "1",
            institution: "Banco A",
            indexer: null,
            issuedAt: null,
            maturityAt: "2030-01-01",
            totalValue: "40",
          },
          {
            id: "2",
            product: "B",
            assetCode: null,
            quantity: "1",
            institution: "Banco B",
            indexer: null,
            issuedAt: null,
            maturityAt: "2030-02-01",
            totalValue: "30",
          },
          {
            id: "3",
            product: "C",
            assetCode: null,
            quantity: "1",
            institution: "Banco C",
            indexer: null,
            issuedAt: null,
            maturityAt: "2030-03-01",
            totalValue: "30",
          },
          {
            id: "4",
            product: "Sem valor",
            assetCode: null,
            quantity: "1",
            institution: null,
            indexer: null,
            issuedAt: null,
            maturityAt: "2030-04-01",
            totalValue: null,
          },
        ]}
      />,
    );
    expect(html).toContain("Maior exposição");
    expect(html).toContain("Diversificação institucional");
    expect(html).toContain("Valor não informado");
  });
});
