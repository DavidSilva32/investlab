// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PortfolioNavigation } from "@/app/(private)/portfolio/_components/portfolio-navigation";

describe("PortfolioNavigation", () => {
  it("links the three portfolio views and marks the current one", () => {
    const html = renderToStaticMarkup(
      <PortfolioNavigation activeView="movements" />,
    );
    expect(html).toContain('href="/carteira"');
    expect(html).toContain('href="/carteira?view=positions"');
    expect(html).toContain('href="/carteira?view=movements"');
    expect(html).toContain("Movimentações");
    expect(html).toContain("border-primary text-primary");
    expect(html).toContain('aria-current="page"');
  });
});
