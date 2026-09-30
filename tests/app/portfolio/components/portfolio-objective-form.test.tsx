// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PortfolioObjectiveForm } from "@/app/portfolio/_components/portfolio-objective-form";
import type { PortfolioObjective } from "@/app/portfolio/_components/portfolio-objective-card";

const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

describe("PortfolioObjectiveForm", () => {
  afterEach(() => {
    cleanup();
    toast.error.mockReset();
  });

  it("validates before saving and sends masked values as numbers", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<PortfolioObjectiveForm saving={false} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("Nome"), {
      target: { value: "  Viagem  " },
    });
    fireEvent.change(screen.getByLabelText("Meta em reais (opcional)"), {
      target: { value: "R$ 2.500,00" },
    });
    fireEvent.change(
      screen.getByLabelText("Aporte mensal planejado (opcional)"),
      { target: { value: "R$ 250,00" } },
    );
    await user.click(screen.getByRole("button", { name: "Criar objetivo" }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        name: "Viagem",
        targetAmount: 2500,
        monthlyPlannedAmount: 250,
      }),
    );
    expect(
      (screen.getByLabelText("Meta em reais (opcional)") as HTMLInputElement)
        .value,
    ).toBe("");
  });

  it("shows a safe fallback toast for save failures and supports canceling an edit", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onSave = vi.fn().mockRejectedValue(new Error("Falha ao salvar"));
    render(
      <PortfolioObjectiveForm
        objective={
          {
            id: "trip",
            name: "Viagem",
            targetAmount: 500,
            monthlyPlannedAmount: null,
          } as never
        }
        saving={false}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível salvar o objetivo.",
      ),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Cancelar edição" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("creates a destination without a financial target", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<PortfolioObjectiveForm saving={false} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("Nome"), {
      target: { value: "Longo prazo" },
    });

    await user.click(screen.getByRole("button", { name: "Criar objetivo" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        name: "Longo prazo",
        targetAmount: null,
        monthlyPlannedAmount: null,
      }),
    );
    expect(
      screen.getByText(
        "Sem meta, o objetivo acompanha o valor destinado sem calcular progresso ou valor restante.",
      ),
    ).toBeTruthy();
  });

  it("accepts a missing target and rejects a non-positive target", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<PortfolioObjectiveForm saving={false} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText("Nome"), {
      target: { value: "Viagem" },
    });
    fireEvent.change(screen.getByLabelText("Meta em reais (opcional)"), {
      target: { value: "R$ 0,00" },
    });
    await user.click(screen.getByRole("button", { name: "Criar objetivo" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Informe um nome e revise a meta em reais, se preenchida.",
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it("rejects a monthly plan that exceeds the supported numeric range", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<PortfolioObjectiveForm saving={false} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("Nome"), {
      target: { value: "Viagem" },
    });
    fireEvent.change(screen.getByLabelText("Meta em reais (opcional)"), {
      target: { value: "R$ 1.000,00" },
    });
    fireEvent.change(
      screen.getByLabelText("Aporte mensal planejado (opcional)"),
      { target: { value: "R$ " + "9".repeat(400) } },
    );

    await user.click(screen.getByRole("button", { name: "Criar objetivo" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Revise o valor do aporte mensal planejado.",
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it("prefills monthly plans and handles a non-Error save failure", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue("offline");
    render(
      <PortfolioObjectiveForm
        objective={
          {
            id: "trip",
            kind: "CUSTOM",
            name: "Viagem",
            targetAmount: 500,
            monthlyPlannedAmount: 125.5,
            currentValue: 0,
            knownValue: 0,
            remainingAmount: 500,
            progressPercent: 0,
            assignedPositionCount: 0,
            missingPositionCount: 0,
            unvaluedPositionCount: 0,
            assignedAssetKeys: [],
            canEditAssignments: true,
          } satisfies PortfolioObjective
        }
        saving={false}
        onSave={onSave}
      />,
    );

    expect(
      (
        screen.getByLabelText(
          "Aporte mensal planejado (opcional)",
        ) as HTMLInputElement
      ).value,
    ).toBe("R$ 125,50");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(toast.error).toHaveBeenCalledWith(
      "Não foi possível salvar o objetivo.",
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
