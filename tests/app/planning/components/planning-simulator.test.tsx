// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  queryOptions: {} as Record<string, unknown>,
  apiRequest: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: Record<string, unknown>) => {
    state.queryOptions = options;
    return state.query;
  },
}));
vi.mock("@/lib/api-client", () => ({ apiRequest: state.apiRequest }));
vi.mock("@/app/portfolio/_components/portfolio-objective-projection", () => ({
  PortfolioObjectiveProjection: ({
    objective,
    startingBalance,
  }: {
    objective: { name: string } | null;
    startingBalance: { amount: number; source: string } | null;
  }) => (
    <div>
      {objective?.name ?? "Patrimônio total"} ·{" "}
      {startingBalance?.source ?? "sem saldo"} · {startingBalance?.amount ?? 0}
    </div>
  ),
}));

import { PlanningSimulator } from "@/app/planning/_components/planning-simulator";
import type { PortfolioObjective } from "@/app/portfolio/_components/portfolio-objective-card";
import type { ObjectivePosition } from "@/app/portfolio/_components/portfolio-objective-assignment";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";

const goal: PortfolioObjective = {
  id: "goal-a",
  kind: "PERSONAL",
  purpose: "PERSONAL_GOAL",
  name: "Viagem",
  targetAmount: 12_000,
  monthlyPlannedAmount: 500,
  currentValue: 1_200,
  knownValue: 1_200,
  remainingAmount: 10_800,
  progressPercent: 10,
  assignedPositionCount: 1,
  missingPositionCount: 0,
  unvaluedPositionCount: 0,
  assignedAssetKeys: ["goal-position"],
  canEditAssignments: true,
};
const position: ObjectivePosition = {
  assetKey: "goal-position",
  product: "Tesouro",
  assetCode: "SELIC",
  institution: "Custodiante",
  assetClass: "fixed_income",
  positionCount: 1,
  value: 1_200,
  referenceDate: "2026-10-01",
  unvaluedPositions: 0,
  objectiveId: "goal-a",
  objectiveName: "Viagem",
  objectivePurpose: "PERSONAL_GOAL",
};

function setQuery(overrides: Record<string, unknown> = {}) {
  state.query = {
    data: {
      objectives: [
        goal,
        {
          ...goal,
          id: reserveObjectiveId,
          kind: "RESERVE",
          purpose: "RESERVE",
          name: "Reserva",
          assignedAssetKeys: [],
        },
      ],
      positions: [position],
      destinationSummary: {
        knownTotal: 1_200,
        missingPositionCount: 0,
        unvaluedPositionCount: 0,
      },
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  };
}

describe("PlanningSimulator", () => {
  afterEach(() => {
    cleanup();
    state.query = {};
  });

  it("uses the complete total portfolio as the initial balance", () => {
    setQuery();
    render(<PlanningSimulator initialObjectiveId={null} />);
    expect(
      screen.getByRole("combobox", { name: "Base da simulação" }),
    ).toBeTruthy();
    expect(
      screen.getByText("Patrimônio total · portfolio · 1200"),
    ).toBeTruthy();
  });

  it("keeps an incomplete selected objective separate and offers an explicit total source action", async () => {
    setQuery({
      data: {
        objectives: [{ ...goal, assignedAssetKeys: [], currentValue: null }],
        positions: [position],
        destinationSummary: {
          knownTotal: 1_200,
          missingPositionCount: 0,
          unvaluedPositionCount: 0,
        },
      },
    });
    const user = userEvent.setup();
    render(<PlanningSimulator initialObjectiveId="goal-a" />);
    expect(screen.getByText("Viagem · sem saldo · 0")).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Usar patrimônio total" }),
    );
    expect(
      screen.getByText("Patrimônio total · portfolio · 1200"),
    ).toBeTruthy();
  });

  it("shows an unavailable state for an unknown objective deep link", () => {
    setQuery();
    render(<PlanningSimulator initialObjectiveId="missing-objective" />);

    expect(screen.getByRole("alert").textContent).toContain(
      "Este objetivo não está disponível para planejamento.",
    );
  });

  it("shows a retry action when the objective and portfolio data cannot load", () => {
    setQuery({
      isError: true,
      error: new Error("Falha segura"),
      data: undefined,
    });
    render(<PlanningSimulator initialObjectiveId={null} />);
    expect(screen.getByRole("alert").textContent).toContain("Falha segura");
    expect(
      screen.getByRole("button", { name: "Tentar novamente" }),
    ).toBeTruthy();
  });

  it("shows a loading state while the data request is pending", () => {
    setQuery({ isPending: true, data: undefined });
    render(<PlanningSimulator initialObjectiveId={null} />);

    expect(
      screen.getByRole("status", { name: "Carregando dados do planejamento" }),
    ).toBeTruthy();
  });

  it("loads objective data from the portfolio endpoint", async () => {
    setQuery();
    render(<PlanningSimulator initialObjectiveId={null} />);

    const queryFn = state.queryOptions.queryFn as () => Promise<unknown>;
    await queryFn();

    expect(state.apiRequest).toHaveBeenCalledWith(
      "/api/portfolio/objectives",
      undefined,
      expect.any(String),
    );
  });

  it("uses a safe fallback message when data is absent without an error object", () => {
    setQuery({ data: undefined, isError: false, error: undefined });
    render(<PlanningSimulator initialObjectiveId={null} />);

    expect(screen.getByRole("alert").textContent).toContain(
      "Não foi possível carregar os dados do planejamento.",
    );
  });

  it("retries a failed request when asked", async () => {
    const refetch = vi.fn();
    setQuery({ isError: true, error: new Error("Falha segura"), refetch });
    const user = userEvent.setup();
    render(<PlanningSimulator initialObjectiveId={null} />);

    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(refetch).toHaveBeenCalledOnce();
  });
});
