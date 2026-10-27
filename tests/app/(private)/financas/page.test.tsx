// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => <main aria-label={title}>{children}</main>,
}));
vi.mock("@/app/(private)/financas/_components/financial-overview", () => ({
  FinancialOverview: () => (
    <section>
      <h2>Fluxo do mês</h2>
    </section>
  ),
}));

import FinancesPage from "@/app/(private)/financas/page";

describe("FinancesPage", () => {
  it("places the financial overview inside the shared application shell", () => {
    render(<FinancesPage />);

    expect(screen.getByRole("main", { name: "Finanças" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Fluxo do mês" })).toBeTruthy();
  });
});
