/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));
vi.mock("@/app/analyses/_components/analysis-experience-nav", () => ({
  AnalysisExperienceNav: ({ active }: { active: string }) => (
    <nav aria-label="Navegação">{active}</nav>
  ),
}));
vi.mock("@/app/study-list/_components/study-list-dashboard", () => ({
  StudyListDashboard: () => <section aria-label="Lista" />,
}));

import StudyListPage from "@/app/study-list/page";

afterEach(cleanup);

describe("StudyListPage", () => {
  it("renders the app shell, list navigation and list dashboard", () => {
    render(StudyListPage());
    expect(
      screen.getByRole("heading", { name: "Lista de estudo" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("navigation", { name: "Navegação" }).textContent,
    ).toBe("study-list");
    expect(screen.getByRole("region", { name: "Lista" })).toBeTruthy();
  });
});
