// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/components/logout-button", () => ({
  LogoutButton: () => <button>Sair</button>,
}));
import PortfolioPage from "@/app/portfolio/page";
describe("PortfolioPage", () => {
  it("renders the API-backed portfolio shell and selected navigation", async () => {
    const html = renderToStaticMarkup(
      await PortfolioPage({
        searchParams: Promise.resolve({ view: "positions" }),
      }),
    );
    expect(html).toContain("atualizada pela API");
    expect(html).toContain("Carregando carteira");
    expect(html).toContain("Posições");
    expect(html).not.toContain("importRepository");
  });
});
