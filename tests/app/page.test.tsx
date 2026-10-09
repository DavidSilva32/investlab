// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/components/logout-button", () => ({
  LogoutButton: () => <button>Sair</button>,
}));
import HomePage, { dynamic } from "@/app/page";
import { QueryClientWrapper } from "../utils/query-client-wrapper";
describe("HomePage", () => {
  it("renders only the API-backed dashboard shell", () => {
    const html = renderToStaticMarkup(
      <QueryClientWrapper>
        <HomePage />
      </QueryClientWrapper>,
    );
    expect(dynamic).toBe("force-dynamic");
    expect(html).toContain("Dashboard");
    expect(html).toContain("Carregando dashboard");
    expect(html).toContain('href="/imports"');
  });
});
