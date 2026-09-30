// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PortfolioObjectiveCard,
  type PortfolioObjective,
} from "@/app/portfolio/_components/portfolio-objective-card";
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

    expect(screen.getByText("Subtotal conhecido: R$ 400,00")).toBeTruthy();
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
});
