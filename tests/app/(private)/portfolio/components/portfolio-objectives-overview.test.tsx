// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PortfolioObjectivesOverview } from "@/app/(private)/portfolio/_components/portfolio-objectives-overview";
import type { PortfolioObjective } from "@/app/(private)/portfolio/_components/portfolio-objective-card";

const objectives: PortfolioObjective[] = [
  {
    id: "goal-1",
    kind: "CUSTOM",
    purpose: "PERSONAL_GOAL",
    name: "Viagem",
    targetAmount: 16000,
    monthlyPlannedAmount: 2000,
    currentValue: 14200.99,
    remainingAmount: 1799.01,
    progressPercent: 88.75,
    balanceTracking: {
      observedAmountCents: "1420099",
      observedOn: "2026-11-14",
    },
  },
  {
    id: "goal-2",
    kind: "CUSTOM",
    purpose: "PERSONAL_GOAL",
    name: "Casa",
    targetAmount: null,
    monthlyPlannedAmount: null,
    currentValue: null,
    remainingAmount: null,
    progressPercent: null,
  },
];

function renderOverview(input: { objectives?: PortfolioObjective[] } = {}) {
  const onOpen = vi.fn();
  const onCreate = vi.fn();
  render(
    <PortfolioObjectivesOverview
      data={{ objectives: input.objectives ?? objectives }}
      deleting={false}
      deleteObjectiveId={null}
      onOpen={onOpen}
      onEdit={vi.fn()}
      onDeleteOpenChange={vi.fn()}
      onDelete={vi.fn()}
      onCreate={onCreate}
    />,
  );
  return { onOpen, onCreate };
}

describe("PortfolioObjectivesOverview", () => {
  afterEach(cleanup);

  it("shows each observed balance and an explicit missing-balance state", () => {
    renderOverview();
    expect(screen.getByText("R$ 14.200,99")).toBeTruthy();
    expect(screen.getByText("Saldo não informado")).toBeTruthy();
    expect(
      screen.getByText(/A carteira B3 é calculada separadamente/u),
    ).toBeTruthy();
  });

  it("opens the selected objective and starts objective creation", () => {
    const { onOpen, onCreate } = renderOverview();
    fireEvent.click(
      screen.getByRole("button", { name: "Abrir objetivo Viagem" }),
    );
    expect(onOpen).toHaveBeenCalledWith(objectives[0]);
    fireEvent.click(screen.getByRole("button", { name: "Novo objetivo" }));
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it("shows the empty state when no objectives exist", () => {
    renderOverview({ objectives: [] });
    expect(screen.getByText(/Ainda não há objetivos/u)).toBeTruthy();
  });
});
