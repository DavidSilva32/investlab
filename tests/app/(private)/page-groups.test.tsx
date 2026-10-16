// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/infrastructure/auth/authorization", () => ({
  getAuthenticatedUser: vi.fn(async () => ({ id: "admin-1", role: "ADMIN" })),
  isLegacyPortfolioOwner: vi.fn(async () => true),
}));

import AnalysesPage from "@/app/(private)/analyses/page";
import SettingsPage from "@/app/(private)/settings/page";

function renderWithQueryClient(element: React.ReactNode) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      {element}
    </QueryClientProvider>,
  );
}

describe("secondary pages", () => {
  it("renders each planned area with its context", async () => {
    expect(
      renderWithQueryClient(
        await AnalysesPage({ searchParams: Promise.resolve({}) }),
      ),
    ).toContain("Minha carteira");
    expect(renderWithQueryClient(await SettingsPage())).toContain(
      "Fundamentos e cadastro",
    );
  });

  it("opens a shared analysis with the ticker from the query string", async () => {
    const markup = renderWithQueryClient(
      await AnalysesPage({
        searchParams: Promise.resolve({ ticker: "VALE3" }),
      }),
    );
    expect(markup).toContain('value="VALE3"');
  });
});
