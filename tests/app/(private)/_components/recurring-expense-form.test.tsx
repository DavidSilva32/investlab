// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecurringExpenseForm } from "@/app/(private)/despesas-recorrentes/_components/recurring-expense-form";

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
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: () => undefined,
});

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});

afterEach(cleanup);

describe("RecurringExpenseForm", () => {
  it("renders accessible fields and the create action", () => {
    render(<RecurringExpenseForm saving={false} onSave={vi.fn()} />);
    expect(
      screen.getByRole("heading", { name: "Cadastrar despesa recorrente" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("Nome")).toBeTruthy();
    expect(screen.getByLabelText("Valor esperado")).toBeTruthy();
    expect(screen.getByLabelText("Próximo vencimento")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Salvar despesa" })).toBeTruthy();
  });

  it("shows the disabled saving state", () => {
    render(<RecurringExpenseForm saving={true} onSave={vi.fn()} />);
    const save = screen.getByRole("button", { name: "Salvando…" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
  });

  it("submits the entered amount as a number in reais", async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    render(<RecurringExpenseForm saving={false} onSave={onSave} />);

    await user.type(screen.getByLabelText("Nome"), "Internet");
    await user.type(screen.getByLabelText("Categoria (opcional)"), "Casa");
    await user.type(screen.getByLabelText("Valor esperado"), "10050");
    await user.click(screen.getByRole("combobox", { name: "Periodicidade" }));
    await user.click(screen.getByRole("option", { name: "Todo mês" }));
    await user.type(screen.getByLabelText("Próximo vencimento"), "10/10/2026");
    await user.click(screen.getByLabelText("Despesa essencial"));
    await user.click(screen.getByRole("button", { name: "Salvar despesa" }));

    expect(onSave).toHaveBeenCalledWith({
      description: "Internet",
      category: "Casa",
      amount: 100.5,
      frequency: "MONTHLY",
      firstDueDate: "2026-10-10",
      essential: true,
    });
    expect((screen.getByLabelText("Nome") as HTMLInputElement).value).toBe("");
    expect(
      (
        screen.getByLabelText("Despesa essencial") as HTMLButtonElement
      ).getAttribute("data-state"),
    ).toBe("unchecked");
  });

  it("keeps field errors local and does not call save for incomplete values", async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    const { container } = render(
      <RecurringExpenseForm saving={false} onSave={onSave} />,
    );
    const form = container.querySelector("form");
    if (!form) throw new Error("Expected the recurring expense form.");

    fireEvent.submit(form);
    expect(screen.getByRole("alert").textContent).toContain(
      "Informe nome, valor",
    );
    expect(onSave).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Nome"), "Internet");
    await user.type(screen.getByLabelText("Valor esperado"), "10050");
    fireEvent.submit(form);
    expect(screen.getByRole("alert").textContent).toContain(
      "Informe nome, valor",
    );
    expect(onSave).not.toHaveBeenCalled();

    await user.click(screen.getByRole("combobox", { name: "Periodicidade" }));
    await user.click(screen.getByRole("option", { name: "Todo mês" }));
    fireEvent.submit(form);
    expect(screen.getByRole("alert").textContent).toContain(
      "Informe nome, valor",
    );

    await user.type(screen.getByLabelText("Próximo vencimento"), "10/10/2026");
    fireEvent.change(screen.getByLabelText("Valor esperado"), {
      target: { value: "0" },
    });
    fireEvent.submit(form);
    expect(screen.getByRole("alert").textContent).toContain(
      "Informe nome, valor",
    );
  });

  it("retains a valid create form when the save callback fails", async () => {
    const onSave = vi.fn().mockResolvedValue(false);
    const user = userEvent.setup();
    render(<RecurringExpenseForm saving={false} onSave={onSave} />);

    await user.type(screen.getByLabelText("Nome"), "Internet");
    await user.type(screen.getByLabelText("Valor esperado"), "10050");
    await user.click(screen.getByRole("combobox", { name: "Periodicidade" }));
    await user.click(screen.getByRole("option", { name: "Todo mês" }));
    await user.type(screen.getByLabelText("Próximo vencimento"), "10/10/2026");
    await user.click(screen.getByRole("button", { name: "Salvar despesa" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 100.5, category: null }),
    );
    expect((screen.getByLabelText("Nome") as HTMLInputElement).value).toBe(
      "Internet",
    );
  });

  it("keeps edit values after saving and exposes the cancel callback", async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <RecurringExpenseForm
        expense={{
          id: "expense-1",
          description: "Internet",
          category: null,
          amount: "100.00",
          frequency: "MONTHLY",
          firstDueDate: "2026-10-10",
          essential: false,
          active: true,
        }}
        saving={false}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Editar despesa recorrente" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 100, category: null }),
    );
    expect((screen.getByLabelText("Nome") as HTMLInputElement).value).toBe(
      "Internet",
    );
    await user.click(screen.getByRole("button", { name: "Cancelar edição" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
