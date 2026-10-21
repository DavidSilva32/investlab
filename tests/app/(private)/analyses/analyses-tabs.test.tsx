// @vitest-environment jsdom
import { cleanup, render as rtlRender, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalysesTabs } from "@/app/(private)/analyses/_components/analyses-tabs";
import { QueryClientWrapper } from "../../../utils/query-client-wrapper";

vi.mock(
  "@/app/(private)/analyses/_components/stock-analysis-dashboard",
  () => ({
    StockAnalysisDashboard: ({ initialTicker }: { initialTicker?: string }) => (
      <section>Análise individual {initialTicker || "sem ticker"}</section>
    ),
  }),
);
vi.mock("@/app/(private)/analyses/_components/company-comparison", () => ({
  CompanyComparison: ({ initialTicker }: { initialTicker?: string }) => (
    <section>Comparação {initialTicker || "sem ticker"}</section>
  ),
}));

afterEach(cleanup);

const render = (ui: Parameters<typeof rtlRender>[0]) =>
  rtlRender(ui, { wrapper: QueryClientWrapper });

describe("AnalysesTabs", () => {
  it("starts on individual analysis and keeps company comparison available", async () => {
    render(<AnalysesTabs />);
    expect(
      screen
        .getByRole("tab", { name: "Análise individual" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    await userEvent.click(
      screen.getByRole("tab", { name: "Comparar empresas" }),
    );
    expect(
      screen
        .getByRole("tab", { name: "Comparar empresas" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByText("Comparação sem ticker")).toBeTruthy();
  });

  it("keeps only individual analysis and comparison, seeding comparison with the ticker", async () => {
    render(<AnalysesTabs initialTicker="PETR4" />);
    expect(
      screen.getByRole("tab", { name: "Análise individual" }),
    ).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Minha carteira" })).toBeNull();
    await userEvent.click(
      screen.getByRole("tab", { name: "Comparar empresas" }),
    );
    expect(screen.getByText("Comparação PETR4")).toBeTruthy();
  });
});
