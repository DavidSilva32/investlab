// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PortfolioObjectiveCard,
  type PortfolioObjective,
} from "@/app/(private)/portfolio/_components/portfolio-objective-card";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";

const objective: PortfolioObjective = {
  id: "trip",
  kind: "CUSTOM",
  name: "Viagem",
  targetAmount: 1000,
  monthlyPlannedAmount: 100,
  currentValue: null,
  knownValue: 400,
  remainingAmount: null,
  progressPercent: null,
  assignedPositionCount: 2,
  missingPositionCount: 1,
  unvaluedPositionCount: 1,
  assignedAssetKeys: ["a"],
  canEditAssignments: true,
};

describe("PortfolioObjectiveCard", () => {
  afterEach(cleanup);

  it("opens objective detail and exposes edit/delete actions in a menu", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onEdit = vi.fn();
    const onDeleteOpenChange = vi.fn();
    render(
      <PortfolioObjectiveCard
        objective={objective}
        deleteDialogOpen={false}
        deleting={false}
        onOpen={onOpen}
        onEdit={onEdit}
        onDeleteOpenChange={onDeleteOpenChange}
        onDelete={vi.fn()}
      />,
    );

    expect(
      document.querySelector("[class*='grid-cols-[2.5rem_minmax(0,1fr)]']"),
    ).toBeTruthy();

    expect(
      screen.getByText("Subtotal conhecido das posições: R$ 400,00"),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Abrir objetivo Viagem" }),
    );
    expect(onOpen).toHaveBeenCalledWith(objective);

    await user.click(
      screen.getByRole("button", { name: "Ações do objetivo Viagem" }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Editar objetivo" }),
    );
    expect(onEdit).toHaveBeenCalledWith(objective);

    await user.click(
      screen.getByRole("button", { name: "Ações do objetivo Viagem" }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Excluir objetivo" }),
    );
    expect(onDeleteOpenChange).toHaveBeenCalledWith(true);
  });

  it("keeps Reserve read-only in the personal-goal actions menu", () => {
    const reserve = {
      ...objective,
      id: reserveObjectiveId,
      kind: "RESERVE",
      name: "Reserva",
    };
    render(
      <PortfolioObjectiveCard
        objective={reserve}
        deleteDialogOpen={false}
        deleting={false}
        onOpen={vi.fn()}
        onEdit={vi.fn()}
        onDeleteOpenChange={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Abrir objetivo Reserva" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Ações do objetivo/ }),
    ).toBeNull();
  });

  it("uses the observed reserve balance for progress without showing the position subtotal as another balance", () => {
    render(
      <PortfolioObjectiveCard
        objective={{
          ...objective,
          id: reserveObjectiveId,
          kind: "RESERVE",
          name: "Reserva",
          targetAmount: 55800,
          currentValue: 56042.48,
          knownValue: 50459.11,
          remainingAmount: 0,
          progressPercent: 100,
          missingPositionCount: 0,
          unvaluedPositionCount: 0,
          balanceTracking: {
            observedAmountCents: "5604248",
            observedOn: "2026-11-14",
            cdiPercentage: null,
            projection: null,
          },
        }}
        deleteDialogOpen={false}
        deleting={false}
        onOpen={vi.fn()}
        onEdit={vi.fn()}
        onDeleteOpenChange={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("Saldo atual da Reserva")).toBeTruthy();
    expect(screen.getByText(/R\$\s*56\.042,48/u)).toBeTruthy();
    expect(screen.getByText("Informado em 14/11/2026")).toBeTruthy();
    expect(screen.getByText("Meta atingida")).toBeTruthy();
    expect(screen.queryByText(/Falta R\$/)).toBeNull();
    expect(screen.queryByText(/Saldo observado:/)).toBeNull();
    expect(screen.queryByText(/R\$\s*50\.459,11/u)).toBeNull();
  });

  it("labels a goal without a configured target and hides unavailable progress", () => {
    render(
      <PortfolioObjectiveCard
        objective={{
          ...objective,
          targetAmount: null,
          remainingAmount: null,
          progressPercent: null,
        }}
        deleteDialogOpen={false}
        deleting={false}
        onOpen={vi.fn()}
        onEdit={vi.fn()}
        onDeleteOpenChange={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("destino sem meta financeira")).toBeTruthy();
    expect(
      screen.queryByText("Progresso indisponível com os dados atuais"),
    ).toBeNull();
  });

  it("labels long-term destinations and asks legacy goals to be classified", () => {
    const { rerender } = render(
      <PortfolioObjectiveCard
        objective={{ ...objective, purpose: "LONG_TERM_INVESTMENT" }}
        deleteDialogOpen={false}
        deleting={false}
        onOpen={vi.fn()}
        onEdit={vi.fn()}
        onDeleteOpenChange={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("Investimento de longo prazo")).toBeTruthy();
    expect(screen.queryByText(/Classifique este destino ao editar/)).toBeNull();

    rerender(
      <PortfolioObjectiveCard
        objective={objective}
        deleteDialogOpen={false}
        deleting={false}
        onOpen={vi.fn()}
        onEdit={vi.fn()}
        onDeleteOpenChange={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("Classificação pendente")).toBeTruthy();
    expect(screen.getByText(/Classifique este destino ao editar/)).toBeTruthy();
    rerender(
      <PortfolioObjectiveCard
        objective={{ ...objective, purpose: "PERSONAL_GOAL" }}
        deleteDialogOpen={false}
        deleting={false}
        onOpen={vi.fn()}
        onEdit={vi.fn()}
        onDeleteOpenChange={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("Objetivo pessoal")).toBeTruthy();
  });

  it("keeps the reserve target label when its personal target is not configured", () => {
    render(
      <PortfolioObjectiveCard
        objective={{
          ...objective,
          id: reserveObjectiveId,
          kind: "RESERVE",
          name: "Reserva",
          targetAmount: null,
          remainingAmount: null,
          progressPercent: null,
        }}
        deleteDialogOpen={false}
        deleting={false}
        onOpen={vi.fn()}
        onEdit={vi.fn()}
        onDeleteOpenChange={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("meta não configurada")).toBeTruthy();
    expect(screen.queryByText("destino sem meta financeira")).toBeNull();
  });

  it("compares the bank observation with linked positions without showing projection noise", () => {
    render(
      <PortfolioObjectiveCard
        objective={{
          ...objective,
          currentValue: 100,
          progressPercent: 10,
          remainingAmount: 900,
          missingPositionCount: 0,
          unvaluedPositionCount: 0,
          balanceTracking: {
            observedAmountCents: "25050",
            observedOn: "2026-10-01",
            cdiPercentage: "100.0000",
            projection: {
              projectedAmountCents: "25075",
              projectedOn: "2026-10-02",
              estimatedThrough: "2026-10-02",
              cdiPercentage: "100.0000",
              status: "projected",
            },
          },
        }}
        deleteDialogOpen={false}
        deleting={false}
        onOpen={vi.fn()}
        onEdit={vi.fn()}
        onDeleteOpenChange={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("Valor das posições vinculadas")).toBeTruthy();
    expect(
      screen.getByText(/Saldo informado no banco: R\$\s*250,50/u),
    ).toBeTruthy();
    expect(
      screen.getByText(/Diferença para as posições vinculadas: R\$\s*150,50/u),
    ).toBeTruthy();
    expect(screen.queryByText(/Projeção bruta/u)).toBeNull();
    expect(screen.queryByText("Projeção indisponível")).toBeNull();
    expect(screen.getByText("10% acompanhado")).toBeTruthy();
  });

  it("shows the bank observation against the known subtotal without requiring projection data", () => {
    render(
      <PortfolioObjectiveCard
        objective={{
          ...objective,
          balanceTracking: {
            observedAmountCents: "25050",
            observedOn: "data desconhecida",
            cdiPercentage: null,
            projection: null,
          },
        }}
        deleteDialogOpen={false}
        deleting={false}
        onOpen={vi.fn()}
        onEdit={vi.fn()}
        onDeleteOpenChange={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/Saldo informado no banco: R\$\s*250,50/u),
    ).toBeTruthy();
    expect(screen.getByText(/Em data desconhecida/)).toBeTruthy();
    expect(
      screen.getByText(/Diferença para o subtotal conhecido: R\$\s*149,50/u),
    ).toBeTruthy();
    expect(screen.queryByText(/Projeção indisponível/u)).toBeNull();
  });

  it("shows a zero difference when the bank balance matches linked positions", () => {
    render(
      <PortfolioObjectiveCard
        objective={{
          ...objective,
          currentValue: 250.5,
          balanceTracking: {
            observedAmountCents: "25050",
            observedOn: "2026-10-01",
            cdiPercentage: null,
            projection: null,
          },
        }}
        deleteDialogOpen={false}
        deleting={false}
        onOpen={vi.fn()}
        onEdit={vi.fn()}
        onDeleteOpenChange={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/Diferença para as posições vinculadas: R\$\s*0,00/u),
    ).toBeTruthy();
  });

  it("omits the difference when no linked-position value is known", () => {
    render(
      <PortfolioObjectiveCard
        objective={{
          ...objective,
          currentValue: null,
          knownValue: 0,
          balanceTracking: {
            observedAmountCents: "25050",
            observedOn: "2026-10-01",
            cdiPercentage: null,
            projection: null,
          },
        }}
        deleteDialogOpen={false}
        deleting={false}
        onOpen={vi.fn()}
        onEdit={vi.fn()}
        onDeleteOpenChange={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/Saldo informado no banco: R\$\s*250,50/u),
    ).toBeTruthy();
    expect(
      screen.queryByText(/Diferença para as posições vinculadas/u),
    ).toBeNull();
  });
});
