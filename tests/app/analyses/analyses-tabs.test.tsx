// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalysesTabs } from "@/app/analyses/_components/analyses-tabs";

vi.mock("@/app/analyses/_components/stock-analysis-dashboard", () => ({
  StockAnalysisDashboard: ({ initialTicker }: { initialTicker?: string }) => (
    <section>Análise individual {initialTicker || "sem ticker"}</section>
  ),
}));

afterEach(cleanup);

const opportunity = {
  ticker: "PETR4",
  name: "Petrobras PN",
  quantity: 12,
  positionDate: "2026-09-30",
  price: 30,
  priceAsOf: "2026-10-01T00:00:00.000Z",
  fundamentalsAsOf: "2025-12-31",
  financialPeriods: [{ referenceDate: "2025-12-31", sourceDocument: "DFP" }],
  automaticDividend: null,
  inputs: [
    {
      inputKey: "graham_eps",
      value: null,
      source: null,
      asOf: null,
    },
    {
      inputKey: "graham_book_value_per_share",
      value: null,
      source: null,
      asOf: null,
    },
    {
      inputKey: "bazin_dividend_per_share",
      value: null,
      source: null,
      asOf: null,
    },
  ],
  methods: {
    graham: {
      value: null,
      differencePercent: null,
      asOf: null,
      source: null,
      unavailableReason: "Informe LPA e VPA.",
    },
    bazin: {
      value: null,
      differencePercent: null,
      asOf: null,
      source: null,
      unavailableReason: "Informe dividendos por ação.",
    },
  },
};

function response() {
  return {
    ok: true,
    json: async () => ({
      opportunities: [opportunity],
      settings: { bazinTargetYield: 6 },
    }),
  };
}

describe("AnalysesTabs", () => {
  it("starts on the portfolio tab and keeps the individual analysis available", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response()));
    render(<AnalysesTabs />);
    expect(
      screen
        .getByRole("tab", { name: "Minha carteira" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(await screen.findByText("PETR4")).toBeTruthy();
    await userEvent.click(
      screen.getByRole("tab", { name: "Análise individual" }),
    );
    expect(
      screen
        .getByRole("tab", { name: "Análise individual" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByText("Análise individual sem ticker")).toBeTruthy();
    await userEvent.click(screen.getByRole("tab", { name: "Minha carteira" }));
    expect(screen.getByText("PETR4")).toBeTruthy();
  });

  it("defers the portfolio request until its tab is first opened", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response());
    vi.stubGlobal("fetch", fetchMock);
    render(<AnalysesTabs initialTicker="PETR4" />);
    expect(
      screen
        .getByRole("tab", { name: "Análise individual" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByText("Análise individual PETR4")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("tab", { name: "Minha carteira" }));
    expect(await screen.findByText("PETR4")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves unsaved value and Bazin yield drafts when switching tabs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response()));
    render(<AnalysesTabs />);
    const bazinYield = await screen.findByLabelText("Percentual anual");
    await userEvent.clear(bazinYield);
    await userEvent.type(bazinYield, "7.5");
    await userEvent.click(
      screen.getByRole("button", {
        name: "Informar ou atualizar dados manuais",
      }),
    );
    const eps = document.getElementById("PETR4-graham_eps-value")!;
    await userEvent.type(eps, "8");

    await userEvent.click(
      screen.getByRole("tab", { name: "Análise individual" }),
    );
    await waitFor(() =>
      expect(screen.getByText("Análise individual sem ticker")).toBeTruthy(),
    );
    await userEvent.click(screen.getByRole("tab", { name: "Minha carteira" }));

    expect(screen.getByLabelText("Percentual anual")).toHaveProperty(
      "value",
      "7.5",
    );
    expect(document.getElementById("PETR4-graham_eps-value")).toHaveProperty(
      "value",
      "8",
    );
  });
});
