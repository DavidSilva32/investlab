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
  remainingAmount: null,
  progressPercent: null,
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

    expect(screen.getByText("Saldo não informado")).toBeTruthy();
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
          remainingAmount: 0,
          progressPercent: 100,
          balanceTracking: {
            observedAmountCents: "5604248",
            observedOn: "2026-11-14",
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

  it("labels goal purpose without implying that purpose changes strategy inclusion", () => {
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
    expect(screen.queryByText(/Classifique este destino ao editar/)).toBeNull();
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

  it("uses the observed goal balance as the single progress value", () => {
    render(
      <PortfolioObjectiveCard
        objective={{
          ...objective,
          currentValue: 250.5,
          progressPercent: 25.05,
          remainingAmount: 749.5,
          balanceTracking: {
            observedAmountCents: "25050",
            observedOn: "2026-10-01",
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

    expect(screen.getByText("Saldo informado")).toBeTruthy();
    expect(screen.getByText("Informado em 01/10/2026")).toBeTruthy();
    expect(screen.getAllByText(/R\$\s*250,50/u)).toHaveLength(1);
    expect(screen.getByText("25% acompanhado")).toBeTruthy();
    expect(screen.queryByText("Valor das posições vinculadas")).toBeNull();
    expect(
      screen.queryByText(/Diferença para as posições vinculadas/u),
    ).toBeNull();
    expect(screen.queryByText(/Projeção bruta/u)).toBeNull();
    expect(screen.queryByText("Projeção indisponível")).toBeNull();
  });

  it("preserves an incomplete legacy observation date as entered", () => {
    render(
      <PortfolioObjectiveCard
        objective={{
          ...objective,
          balanceTracking: {
            observedAmountCents: "25050",
            observedOn: "2026-10",
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

    expect(screen.getByText("Informado em 2026-10")).toBeTruthy();
  });
});
