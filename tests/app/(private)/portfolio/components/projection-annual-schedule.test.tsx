// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectionAnnualSchedule } from "@/app/(private)/portfolio/_components/projection-annual-schedule";
import { simulateObjectiveProjection } from "@/lib/objective-projection";

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: () => undefined,
});
Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
  configurable: true,
  value: () => false,
});
Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
  configurable: true,
  value: () => undefined,
});
Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
  configurable: true,
  value: () => undefined,
});

function result(horizonYears: number) {
  return simulateObjectiveProjection({
    mode: "project_balance",
    startingAmount: 1_000,
    horizonYears,
    annualReturnPercent: 0,
    annualInflationPercent: 10,
    monthlyContribution: 100,
    adjustContributionsForInflation: true,
  });
}

describe("ProjectionAnnualSchedule", () => {
  afterEach(cleanup);

  it("shows annual summaries, expands selected monthly details, and clamps the year when the horizon shrinks", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ProjectionAnnualSchedule result={result(2)} />,
    );

    expect(
      screen.getByRole("table", { name: "Evolução anual da projeção" }),
    ).toBeTruthy();
    expect(screen.getByRole("row", { name: /Ano 2/ })).toBeTruthy();

    await user.click(
      screen.getByRole("combobox", { name: "Ano para detalhamento mensal" }),
    );
    await user.click(screen.getByRole("option", { name: "Ano 2" }));
    await user.click(
      screen.getByRole("button", { name: "Ver evolução mensal" }),
    );

    const yearTwoTable = screen.getByRole("table", {
      name: "Evolução mensal do ano 2",
    });
    expect(
      within(yearTwoTable).getByText("Mês 1", { exact: true }),
    ).toBeTruthy();
    expect(
      within(yearTwoTable).getByText("Mês 12", { exact: true }),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Ocultar meses" }));
    expect(
      screen.queryByRole("table", { name: "Evolução mensal do ano 2" }),
    ).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Ver evolução mensal" }),
    );

    rerender(<ProjectionAnnualSchedule result={result(1)} />);

    expect(
      screen.getByRole("table", { name: "Evolução mensal do ano 1" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Ano para detalhamento mensal" })
        .textContent,
    ).toContain("Ano 1");
    expect(
      within(
        screen.getByRole("table", { name: "Evolução mensal do ano 1" }),
      ).queryByText("Mês 13", { exact: true }),
    ).toBeNull();
  });
});
