// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PortfolioObjectiveDetail } from "@/app/(private)/portfolio/_components/portfolio-objective-detail";
import type { PortfolioObjective } from "@/app/(private)/portfolio/_components/portfolio-objective-card";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
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

  it("keeps manual position and target settings under advanced options", async () => {
    const user = userEvent.setup();
    const onManagePositions = vi.fn();
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
        onManagePositions={onManagePositions}
        onConfigureReserve={onConfigureReserve}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Gerenciar posições" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Editar despesas e meta" }),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "Opções avançadas" }));
    await user.click(
      screen.getByRole("button", { name: "Ajustar posições manualmente" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Editar despesas e meta" }),
    );
    expect(onManagePositions).toHaveBeenCalledOnce();
    expect(onConfigureReserve).toHaveBeenCalledOnce();
    expect(screen.getByText("Não configurada")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Editar objetivo" }),
    ).toBeNull();
  });

  it("shows the observed reserve balance as current and marks its meta as reached", () => {
    render(
      <PortfolioObjectiveDetail
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
        onEdit={vi.fn()}
        onManagePositions={vi.fn()}
        onConfigureReserve={vi.fn()}
      />,
    );

    expect(screen.getByText("Saldo atual da Reserva")).toBeTruthy();
    expect(screen.getByText(/R\$\s*56\.042,48/u)).toBeTruthy();
    expect(screen.getByText("Informado em 14/11/2026")).toBeTruthy();
    expect(screen.getByText("Meta atingida")).toBeTruthy();
    expect(screen.queryByText("Usado na meta")).toBeNull();
    expect(screen.queryByText(/Falta R\$/)).toBeNull();
    expect(screen.queryByText(/R\$\s*50\.459,11/u)).toBeNull();
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

  it("labels long-term and personal goals in their detail view", () => {
    const { rerender } = render(
      <PortfolioObjectiveDetail
        objective={{ ...objective, purpose: "LONG_TERM_INVESTMENT" }}
        onEdit={vi.fn()}
        onManagePositions={vi.fn()}
        onConfigureReserve={vi.fn()}
      />,
    );
    expect(screen.getByText("Investimento de longo prazo")).toBeTruthy();
    expect(
      screen.getByText(
        "Ativos da carteira separados pela sua estratégia de longo prazo.",
      ),
    ).toBeTruthy();

    rerender(
      <PortfolioObjectiveDetail
        objective={{ ...objective, purpose: "PERSONAL_GOAL" }}
        onEdit={vi.fn()}
        onManagePositions={vi.fn()}
        onConfigureReserve={vi.fn()}
      />,
    );
    expect(screen.getByText("Objetivo pessoal")).toBeTruthy();
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

  it("links a personal objective to its planning scenario", () => {
    render(
      <PortfolioObjectiveDetail
        objective={objective}
        onEdit={vi.fn()}
        onManagePositions={vi.fn()}
        onConfigureReserve={vi.fn()}
      />,
    );
    expect(
      screen
        .getByRole("link", { name: "Planejar este objetivo" })
        .getAttribute("href"),
    ).toBe("/planejamento?objective=trip");
  });
});
