// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StrategyPage from "@/app/strategy/page";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({
    children,
    title,
  }: React.PropsWithChildren<{ title: string }>) => (
    <main aria-label={title}>{children}</main>
  ),
}));
vi.mock("@/app/strategy/_components/personal-investment-strategy", () => ({
  PersonalInvestmentStrategy: () => <div>Estratégia carregada</div>,
}));

describe("StrategyPage", () => {
  it("renders the personal strategy inside the application shell", () => {
    render(<StrategyPage />);

    expect(screen.getByRole("main", { name: "Estratégia" })).toBeTruthy();
    expect(screen.getByText("Estratégia carregada")).toBeTruthy();
  });
});
