/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AnalysesPage from "@/app/analyses/page";

afterEach(cleanup);

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ title, children }: { title: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));
describe("AnalysesPage", () => {
  it("opens the analysis search without selecting a default ticker", async () => {
    const page = await AnalysesPage({ searchParams: Promise.resolve({}) });
    render(page);
    expect(screen.getByRole("heading", { name: "Análises" })).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Pesquisar ação" }),
    ).toBeTruthy();
    expect(screen.getByText("Encontre uma empresa para analisar")).toBeTruthy();
  });
  it("preserves individual analysis by ticker query", async () => {
    const page = await AnalysesPage({
      searchParams: Promise.resolve({ ticker: "petr4" }),
    });
    render(page);
    expect(screen.getByRole("heading", { name: "Análises" })).toBeTruthy();
    expect(
      (
        screen.getByRole("combobox", {
          name: "Pesquisar ação",
        }) as HTMLInputElement
      ).value,
    ).toBe("PETR4");
  });
  it("does not pass an invalid ticker to the individual analysis", async () => {
    const page = await AnalysesPage({
      searchParams: Promise.resolve({ ticker: "not-a-ticker" }),
    });
    render(page);
    expect(
      (
        screen.getByRole("combobox", {
          name: "Pesquisar ação",
        }) as HTMLInputElement
      ).value,
    ).toBe("");
  });
});
