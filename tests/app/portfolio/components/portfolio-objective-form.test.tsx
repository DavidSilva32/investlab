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

Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
  configurable: true,
  value: () => false,
});
Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
  configurable: true,
  value: () => {},
});
Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
  configurable: true,
  value: () => {},
});
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: () => {},
});
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
    const form = screen
      .getByRole("button", { name: "Criar objetivo" })
      .closest("form");
    expect(form?.className).toContain("grid gap-5");
    expect(form?.className).not.toContain("grid-cols");
    expect(form?.closest("section")?.className).toContain("rounded-xl border");
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
    await user.click(
      screen.getByRole("combobox", { name: "Finalidade deste destino" }),
    );
    await user.click(screen.getByRole("option", { name: "Objetivo pessoal" }));
    await user.click(screen.getByRole("button", { name: "Criar objetivo" }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        name: "Viagem",
        purpose: "PERSONAL_GOAL",
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
            purpose: "PERSONAL_GOAL",
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
    await user.click(
      screen.getByRole("combobox", { name: "Finalidade deste destino" }),
    );
    await user.click(
      screen.getByRole("option", { name: "Investimento de longo prazo" }),
    );

    await user.click(screen.getByRole("button", { name: "Criar objetivo" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        name: "Longo prazo",
        purpose: "LONG_TERM_INVESTMENT",
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
    await user.click(
      screen.getByRole("combobox", { name: "Finalidade deste destino" }),
    );
    await user.click(screen.getByRole("option", { name: "Objetivo pessoal" }));
    await user.click(screen.getByRole("button", { name: "Criar objetivo" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Informe um nome e revise a meta em reais, se preenchida.",
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it("requires an explicit destination purpose when creating a goal", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<PortfolioObjectiveForm saving={false} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("Nome"), {
      target: { value: "Investir no longo prazo" },
    });
    await user.click(screen.getByRole("button", { name: "Criar objetivo" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Escolha a finalidade deste destino para continuar.",
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it("preserves an unclassified legacy destination during unrelated edits", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const legacy = {
      id: "legacy",
      kind: "CUSTOM",
      name: "Longo prazo",
      purpose: null,
      targetAmount: 100000,
      monthlyPlannedAmount: 8000,
      currentValue: 0,
      knownValue: 0,
      remainingAmount: 100000,
      progressPercent: 0,
      assignedPositionCount: 1,
      missingPositionCount: 0,
      unvaluedPositionCount: 0,
      assignedAssetKeys: ["asset"],
      canEditAssignments: true,
    } satisfies PortfolioObjective;
    render(
      <PortfolioObjectiveForm
        objective={legacy}
        saving={false}
        onSave={onSave}
      />,
    );
    expect(
      screen.getByText(
        /a altera\u00e7\u00e3o preservar\u00e1 essa situa\u00e7\u00e3o/,
      ),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("combobox", {
          name: "Finalidade deste destino",
        }) as HTMLButtonElement
      ).textContent,
    ).toContain("Escolha uma finalidade");
    fireEvent.change(screen.getByLabelText("Nome"), {
      target: { value: "Longo prazo revisado" },
    });
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        name: "Longo prazo revisado",
        purpose: null,
        targetAmount: 100000,
        monthlyPlannedAmount: 8000,
      }),
    );
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
    await user.click(
      screen.getByRole("combobox", { name: "Finalidade deste destino" }),
    );
    await user.click(screen.getByRole("option", { name: "Objetivo pessoal" }));

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
            purpose: "PERSONAL_GOAL",
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
