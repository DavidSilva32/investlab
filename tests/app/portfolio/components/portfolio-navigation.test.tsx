import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PortfolioNavigation } from "@/app/portfolio/_components/portfolio-navigation";

describe("PortfolioNavigation", () => {
  it("links the three portfolio views and marks the current one", () => {
    const html = renderToStaticMarkup(
      <PortfolioNavigation activeView="movements" />,
    );
    expect(html).toContain('href="/portfolio"');
    expect(html).toContain('href="/portfolio?view=positions"');
    expect(html).toContain('href="/portfolio?view=movements"');
    expect(html).toContain("Movimentações");
    expect(html).toContain("border-primary text-primary");
  });
});
