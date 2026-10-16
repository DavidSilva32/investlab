/** @vitest-environment jsdom */
vi.mock("@/infrastructure/auth/authorization", () => ({
  getAuthenticatedUser: vi.fn(async () => ({ id: "owner-1", role: "ADMIN" })),
  isLegacyPortfolioOwner: vi.fn(async () => true),
}));
const redirectMock = vi.hoisted(() =>
  vi.fn((path: string): never => {
    throw new Error(`redirect:${path}`);
  }),
);
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { getAuthenticatedUser } from "@/infrastructure/auth/authorization";
import SettingsPage from "@/app/(private)/settings/page";

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ title, children }: { title: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));
vi.mock("@/app/(private)/settings/_components/screener-data-settings", () => ({
  ScreenerDataSettings: () => <section>Dados da CVM</section>,
}));
vi.mock("@/app/(private)/settings/_components/market-data-settings", () => ({
  MarketDataSettings: () => <section>Dados de mercado</section>,
}));

describe("SettingsPage", () => {
  it("groups both independent data-source panels beneath one page heading", async () => {
    const { container } = render(await SettingsPage());
    expect(screen.getByRole("heading", { name: /Configura/ })).toBeTruthy();
    expect(container.querySelector("main > div")?.className).toBe(
      "w-full space-y-5",
    );
    expect(
      screen.getByRole("heading", { name: "Fontes das análises" }),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        "Consulte o estado e atualize as fontes que alimentam as análises.",
      ),
    ).toBeNull();
    const panels = container.querySelectorAll("main section");
    expect(panels).toHaveLength(2);
    expect(panels[0]?.parentElement?.className).toContain("space-y-5");
    expect(screen.getByText("Dados da CVM")).toBeTruthy();
    expect(screen.getByText("Dados de mercado")).toBeTruthy();
  });

  it("redirects anonymous users to login and non-admin users to home", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce(null);
    await expect(SettingsPage()).rejects.toThrow("redirect:/entrar");

    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce({
      id: "user-1",
      role: "USER",
    } as Awaited<ReturnType<typeof getAuthenticatedUser>>);
    await expect(SettingsPage()).rejects.toThrow("redirect:/");
    expect(redirectMock).toHaveBeenNthCalledWith(1, "/entrar");
    expect(redirectMock).toHaveBeenNthCalledWith(2, "/");
  });
});
