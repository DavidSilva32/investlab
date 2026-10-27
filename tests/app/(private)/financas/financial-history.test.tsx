// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  FinancialHistory,
  formatFinancialHistoryTick,
} from "@/app/(private)/financas/_components/financial-history";

afterEach(cleanup);

describe("FinancialHistory", () => {
  it("includes the year in abbreviated month ticks", () => {
    expect(formatFinancialHistoryTick("2025-01")).not.toBe(
      formatFinancialHistoryTick("2026-01"),
    );
  });

  it("preserves missing months as unavailable and explains recorded-only history", () => {
    render(
      <FinancialHistory
        months={[
          {
            month: "2026-10",
            realizedIncome: null,
            realizedExpenses: null,
            recordedBalance: null,
          },
        ]}
        selectedMonth="2026-10"
        explanation="Os meses sem registros não representam valores zero."
      />,
    );

    expect(
      screen.getByText(
        "Ainda não há dados realizados para comparar no histórico.",
      ),
    ).toBeTruthy();
    expect(screen.getAllByText("Sem registro").length).toBe(3);
    expect(
      screen.getByText("Os meses sem registros não representam valores zero."),
    ).toBeTruthy();
    expect(screen.queryByText("R$ 0,00")).toBeNull();
  });
});
