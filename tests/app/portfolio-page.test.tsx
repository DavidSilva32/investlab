// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/logout-button", () => ({
  LogoutButton: () => <button>Sair</button>,
}));

import PortfolioPage from "@/app/portfolio/page";

describe("PortfolioPage", () => {
  it.each([
    [undefined, "Visão geral"],
    ["positions", "Posições"],
    ["movements", "Movimentações"],
    ["other", "Visão geral"],
  ])("selects %s as the matching portfolio view", async (view, label) => {
    const html = renderToStaticMarkup(
      await PortfolioPage({ searchParams: Promise.resolve({ view }) }),
    );
    expect(html).toContain("atualizada pela API");
    expect(html).toContain("Carregando carteira");
    expect(html).toContain(label);
    expect(html).not.toContain("importRepository");
  });
});
