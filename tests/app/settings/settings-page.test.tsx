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
vi.mock("@/app/settings/_components/investor-context-settings", () => ({
  InvestorContextSettings: () => <section>Objetivo de investimento</section>,
}));
vi.mock("@/app/settings/_components/screener-data-settings", () => ({
  ScreenerDataSettings: () => <section>Dados da CVM</section>,
}));
vi.mock("@/app/settings/_components/market-data-settings", () => ({
  MarketDataSettings: () => <section>Dados de mercado</section>,
}));

describe("SettingsPage", () => {
  it("uses the page title and data sections without a repeated generic introduction", () => {
    const { container } = render(<SettingsPage />);
    expect(screen.getByRole("heading", { name: /Configura/ })).toBeTruthy();
    expect(container.querySelector("main > div")?.className).toBe(
      "w-full space-y-6",
    );
    expect(screen.getByText("Objetivo de investimento")).toBeTruthy();
    expect(screen.getByText("Dados da CVM")).toBeTruthy();
    expect(screen.getByText("Dados de mercado")).toBeTruthy();
    expect(screen.queryByText(/Veja quais fontes alimentam/)).toBeNull();
  });
});
