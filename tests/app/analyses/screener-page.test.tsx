/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import ScreenerPage from "@/app/analyses/screener/page";

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
vi.mock("@/app/analyses/_components/screener-dashboard", () => ({
  ScreenerDashboard: () => <section>Local screener panel</section>,
}));

describe("ScreenerPage", () => {
  it("composes the exploration title, experience switcher and screener panel", () => {
    render(<ScreenerPage />);
    expect(screen.getByRole("heading", { name: "Explorar" })).toBeTruthy();
    expect(screen.getByText("explore")).toBeTruthy();
    expect(screen.getByText(/Ajuste filtros financeiros/)).toBeTruthy();
    expect(screen.getByText("Local screener panel")).toBeTruthy();
  });
});
