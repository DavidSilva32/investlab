// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DashboardContributionOverview } from "@/app/_components/dashboard-contribution-overview";
import type { ContributionGuidance } from "@/lib/next-contribution-guidance";

const gap: ContributionGuidance = {
  status: "target_gap",
  title: "Canonical title",
  explanation: "Canonical explanation",
  assetClass: "ETFs internacionais",
  currentPercentage: 20.45,
  targetPercentage: 60,
  allocationMode: "strategy",
};
describe("DashboardContributionOverview", () => {
  afterEach(cleanup);
  it("displays canonical allocation percentages without a simulator", () => {
    render(<DashboardContributionOverview guidance={gap} />);
    expect(screen.getByText("ETFs internacionais")).toBeTruthy();
    expect(screen.getByText("20,5%")).toBeTruthy();
    expect(screen.getByText("60%")).toBeTruthy();
    expect(screen.getByText("Investimentos de longo prazo")).toBeTruthy();
    expect(screen.getAllByRole("link")[0]!.getAttribute("href")).toBe(
      "/strategy#next-contribution",
    );
    expect(
      screen
        .getByRole("progressbar", { name: "Alocação atual" })
        .getAttribute("aria-valuenow"),
    ).toBe("20.45");
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });
  it("labels legacy scope and keeps an essential reserve setup warning", () => {
    render(
      <DashboardContributionOverview
        guidance={{
          ...gap,
          allocationMode: "legacy",
          reserveNote: "Reserve not configured",
        }}
      />,
    );
    expect(screen.getByText("Distribuição da carteira")).toBeTruthy();
    expect(screen.getAllByRole("link")[0]!.getAttribute("href")).toBe(
      "#legacy-contribution",
    );
    expect(
      screen.getByRole("link", { name: "Analisar ações" }).getAttribute("href"),
    ).toBe("/analyses");
    expect(
      screen.getByText("Reserva não considerada nesta comparação."),
    ).toBeTruthy();
  });
  it.each([
    ["reserve_below_target", "/portfolio?panel=objectives&objective=reserve"],
    ["reserve_incomplete", "/portfolio?panel=objectives&objective=reserve"],
    ["no_gap", "/strategy"],
    ["needs_targets", "/strategy"],
    ["needs_values", "/portfolio?panel=objectives"],
    ["incomplete_data", "/portfolio?view=positions"],
    ["tie", "/strategy"],
    ["unavailable", "/strategy"],
  ] as const)(
    "renders safe %s state without a fabricated comparison",
    (status, href) => {
      render(<DashboardContributionOverview guidance={{ ...gap, status }} />);
      expect(screen.getAllByRole("link")[0]!.getAttribute("href")).toBe(href);
      expect(screen.queryByRole("progressbar")).toBeNull();
      if (status === "incomplete_data")
        expect(
          screen.getByText("Há valores ou classificações pendentes."),
        ).toBeTruthy();
    },
  );
  it("handles missing guidance", () => {
    render(<DashboardContributionOverview />);
    expect(screen.getByText("Comparação indisponível")).toBeTruthy();
  });
  it.each([
    { ...gap, assetClass: undefined },
    { ...gap, currentPercentage: undefined },
    { ...gap, targetPercentage: undefined },
  ])("does not invent missing allocation percentages", (guidance) => {
    render(<DashboardContributionOverview guidance={guidance} />);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});
