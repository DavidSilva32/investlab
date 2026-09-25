/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import AnalysesPage from "@/app/analyses/page";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ title, children }: { title: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));
vi.mock("@/app/analyses/_components/analysis-experience-nav", () => ({
  AnalysisExperienceNav: ({ active }: { active: string }) => (
    <nav>{active}</nav>
  ),
}));
vi.mock("@/app/analyses/_components/discover-dashboard", () => ({
  DiscoverDashboard: () => <section>Discovery panel</section>,
}));
vi.mock("@/app/analyses/_components/stock-analysis-dashboard", () => ({
  StockAnalysisDashboard: ({ initialTicker }: { initialTicker: string }) => (
    <section>Analysis {initialTicker}</section>
  ),
}));

describe("AnalysesPage", () => {
  it("opens Descobrir by default", async () => {
    const page = await AnalysesPage({ searchParams: Promise.resolve({}) });
    render(page);
    expect(screen.getByRole("heading", { name: "Descobrir" })).toBeTruthy();
    expect(screen.getByText("discover")).toBeTruthy();
    expect(screen.getByText("Discovery panel")).toBeTruthy();
  });
  it("preserves individual analysis by ticker query", async () => {
    const page = await AnalysesPage({
      searchParams: Promise.resolve({ ticker: "petr4" }),
    });
    render(page);
    expect(screen.getByRole("heading", { name: "Analisar" })).toBeTruthy();
    expect(screen.getByText("analysis")).toBeTruthy();
    expect(screen.getByText("Analysis PETR4")).toBeTruthy();
  });
});
