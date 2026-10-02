// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PortfolioObjectiveDetail } from "@/app/portfolio/_components/portfolio-objective-detail";
import type { PortfolioObjective } from "@/app/portfolio/_components/portfolio-objective-card";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";

const objective: PortfolioObjective = {
  id: "trip",
  kind: "CUSTOM",
  name: "Viagem",
  targetAmount: 1000,
  monthlyPlannedAmount: 150,
  currentValue: null,
  knownValue: 200,
  remainingAmount: null,
  progressPercent: null,
  assignedPositionCount: 2,
  missingPositionCount: 1,
  unvaluedPositionCount: 1,
  assignedAssetKeys: [],
  canEditAssignments: true,
};

describe("PortfolioObjectiveDetail", () => {
  afterEach(cleanup);

  it("shows incomplete known values and opens personal objective actions", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onManagePositions = vi.fn();
    render(
      <PortfolioObjectiveDetail
        objective={objective}
        onEdit={onEdit}
        onManagePositions={onManagePositions}
        onConfigureReserve={vi.fn()}
      />,
    );

    expect(screen.getByText("Subtotal conhecido: R$ 200,00")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "1 vínculo(s) sem correspondência",
    );
    expect(
      screen.getByText(/intenção pessoal, não uma obrigação/),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Gerenciar posições" }),
    );
    await user.click(screen.getByRole("button", { name: "Editar objetivo" }));
    expect(onManagePositions).toHaveBeenCalledOnce();
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it("routes Reserve to its existing configuration flow", async () => {
    const user = userEvent.setup();
    const onConfigureReserve = vi.fn();
    render(
      <PortfolioObjectiveDetail
        objective={{
          ...objective,
          id: reserveObjectiveId,
          kind: "RESERVE",
          name: "Reserva",
          targetAmount: null,
          remainingAmount: null,
          progressPercent: null,
        }}
        onEdit={vi.fn()}
        onManagePositions={vi.fn()}
        onConfigureReserve={onConfigureReserve}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /Configurar reserva/ }),
    );
    expect(onConfigureReserve).toHaveBeenCalledOnce();
    expect(screen.getByText("Não configurada")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Editar objetivo" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Gerenciar posições" }),
    ).toBeNull();
  });

  it("explains when an objective has no configured financial target", () => {
    render(
      <PortfolioObjectiveDetail
        objective={{
          ...objective,
          targetAmount: null,
          remainingAmount: null,
          progressPercent: null,
        }}
        onEdit={vi.fn()}
        onManagePositions={vi.fn()}
        onConfigureReserve={vi.fn()}
      />,
    );

    expect(screen.getByText("Sem meta financeira")).toBeTruthy();
    expect(
      screen.getByText(
        "Acompanha o valor destinado, sem cálculo de progresso ou falta.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Falta/)).toBeNull();
  });

  it("supports the optional balance-save action when it is omitted", async () => {
    const user = userEvent.setup();
    render(
      <PortfolioObjectiveDetail
        objective={objective}
        onEdit={vi.fn()}
        onManagePositions={vi.fn()}
        onConfigureReserve={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Saldo observado de Viagem"), "50");
    await user.click(
      screen.getByRole("button", { name: "Salvar saldo observado" }),
    );

    expect(screen.getByLabelText("Saldo observado de Viagem")).toBeTruthy();
    expect(screen.queryByText(/Informe um valor entre/)).toBeNull();
  });
});
