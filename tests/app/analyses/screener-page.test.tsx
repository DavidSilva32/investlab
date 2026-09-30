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
vi.mock("@/app/analyses/_components/screener-dashboard", () => ({
  ScreenerDashboard: () => <section>Local screener panel</section>,
}));

describe("ScreenerPage", () => {
  it("keeps the direct screener route outside the main navigation", () => {
    render(<ScreenerPage />);
    expect(screen.getByRole("heading", { name: "Explorar" })).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.getByText(/Ajuste filtros financeiros/)).toBeTruthy();
    expect(screen.getByText("Local screener panel")).toBeTruthy();
  });
});
