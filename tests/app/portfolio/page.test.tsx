import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: React.PropsWithChildren) => <main>{children}</main>,
}));
vi.mock("@/app/portfolio/_components/portfolio-navigation", () => ({
  PortfolioNavigation: ({ activeView }: { activeView: string }) => (
    <p>navigation:{activeView}</p>
  ),
}));
vi.mock("@/app/portfolio/_components/portfolio-client", () => ({
  PortfolioClient: (props: Record<string, unknown>) => (
    <output>{JSON.stringify(props)}</output>
  ),
}));

import PortfolioPage from "@/app/portfolio/page";

describe("PortfolioPage navigation", () => {
  it("normalizes objective deep links to overview and passes their destination", async () => {
    const element = await PortfolioPage({
      searchParams: Promise.resolve({
        view: "positions",
        panel: "objectives",
        objective: "reserve",
        screen: "reserve-settings",
      }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("navigation:overview");
    expect(html).toContain("&quot;initialObjectivesOpen&quot;:true");
    expect(html).toContain("&quot;initialObjectiveId&quot;:&quot;reserve");
    expect(html).toContain(
      "&quot;initialObjectiveScreen&quot;:&quot;reserve-settings",
    );
  });

  it("opens the classification correction in overview even from a position deep link", async () => {
    const html = renderToStaticMarkup(
      await PortfolioPage({
        searchParams: Promise.resolve({
          view: "positions",
          panel: "classification",
        }),
      }),
    );
    expect(html).toContain("navigation:overview");
    expect(html).toContain("&quot;initialClassificationOpen&quot;:true");
    expect(html).toContain("&quot;initialObjectivesOpen&quot;:false");
  });

  it("keeps positions and movements deep views when no objectives panel is requested", async () => {
    const positions = renderToStaticMarkup(
      await PortfolioPage({
        searchParams: Promise.resolve({ view: "positions" }),
      }),
    );
    const movements = renderToStaticMarkup(
      await PortfolioPage({
        searchParams: Promise.resolve({ view: "movements" }),
      }),
    );
    const defaultView = renderToStaticMarkup(
      await PortfolioPage({
        searchParams: Promise.resolve({ view: "unknown" }),
      }),
    );

    expect(positions).toContain("navigation:positions");
    expect(movements).toContain("navigation:movements");
    expect(defaultView).toContain("navigation:overview");
  });
});
