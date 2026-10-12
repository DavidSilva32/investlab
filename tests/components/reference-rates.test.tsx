// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReferenceRates } from "@/components/reference-rates";

describe("ReferenceRates", () => {
  it("renders official rates and their dates", () => {
    const html = renderToStaticMarkup(
      <ReferenceRates
        rates={{
          selic: { annualRate: "15", date: "2026-09-18" },
          cdi: { annualRate: "14.9", date: "2026-09-17" },
          ipca: {
            monthlyRate: "0.5",
            rollingAnnualRate: "6.17",
            date: "2025-12-01",
          },
        }}
      />,
    );
    expect(html).toContain("Indicadores");
    expect(html).toContain("rounded-xl border bg-card");
    expect(html).toContain("sm:grid-cols-2 sm:gap-4");
    expect(html).toContain(
      "lg:grid-cols-[minmax(8rem,0.45fr)_repeat(3,minmax(0,1fr))]",
    );
    expect(html).toContain("Selic");
    expect(html).toContain("15%");
    expect(html).toContain("18/09/2026");
    expect(html).toContain("CDI");
    expect(html).toContain("IPCA");
    expect(html).toContain("6,17%");
    expect(html).toContain("Referência: 01/12/2025");
    expect(html).not.toContain("mensal");
    expect(html).not.toContain("Fonte: Banco Central");
  });
  it("explains unavailable rates", () => {
    expect(
      renderToStaticMarkup(
        <ReferenceRates rates={{ selic: null, cdi: null, ipca: null }} />,
      ),
    ).toContain("Indicadores oficiais indisponíveis");
  });

  it("keeps available indicators visible when IPCA is unavailable", () => {
    const html = renderToStaticMarkup(
      <ReferenceRates
        rates={{
          selic: { annualRate: "15", date: "2026-09-18" },
          cdi: null,
          ipca: null,
        }}
      />,
    );

    expect(html).toContain("Selic");
    expect(html).not.toContain("Indicadores oficiais indisponíveis");
    expect(html).toContain("IPCA");
    expect(html).not.toContain("Variação mensal");
  });
});
