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
        }}
      />,
    );
    expect(html).toContain("Indicadores");
    expect(html).toContain("Selic");
    expect(html).toContain("15%");
    expect(html).toContain("18/09/2026");
    expect(html).toContain("CDI");
  });
  it("explains unavailable rates", () => {
    expect(
      renderToStaticMarkup(
        <ReferenceRates rates={{ selic: null, cdi: null }} />,
      ),
    ).toContain("indisponíveis");
  });
});
