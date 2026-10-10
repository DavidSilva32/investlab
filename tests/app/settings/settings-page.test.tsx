/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import SettingsPage from "@/app/settings/page";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ title, children }: { title: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));
vi.mock("@/app/settings/_components/screener-data-settings", () => ({
  ScreenerDataSettings: () => <section>Dados da CVM</section>,
}));
vi.mock("@/app/settings/_components/market-data-settings", () => ({
  MarketDataSettings: () => <section>Dados de mercado</section>,
}));

describe("SettingsPage", () => {
  it("groups both independent data-source panels beneath one page heading", () => {
    const { container } = render(<SettingsPage />);
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
});
