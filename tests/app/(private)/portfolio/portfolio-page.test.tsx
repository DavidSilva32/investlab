// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/carteira",
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/components/logout-button", () => ({
  LogoutButton: () => <button>Sair</button>,
}));

import PortfolioPage from "@/app/(private)/portfolio/page";
import { ShellUserProvider } from "@/components/app-shell";
import { QueryClientWrapper } from "../../../utils/query-client-wrapper";

describe("PortfolioPage", () => {
  it.each([
    [undefined, "Visão geral"],
    ["positions", "Posições"],
    ["movements", "Movimentações"],
    ["other", "Visão geral"],
  ])("selects %s as the matching portfolio view", async (view, label) => {
    const html = renderToStaticMarkup(
      <ShellUserProvider
        user={{
          name: "Test User",
          email: "user@example.com",
          role: "USER",
        }}
      >
        <QueryClientWrapper>
          {await PortfolioPage({ searchParams: Promise.resolve({ view }) })}
        </QueryClientWrapper>
      </ShellUserProvider>,
    );
    expect(html).toContain("atualizada pela API");
    expect(html).toContain("Carregando carteira");
    expect(html).toContain(label);
    expect(html).not.toContain("importRepository");
  });
});
