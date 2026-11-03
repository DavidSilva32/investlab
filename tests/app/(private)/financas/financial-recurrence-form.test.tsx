// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
import { FinancialRecurrenceForm } from "@/app/(private)/financas/_components/financial-recurrence-form";

afterEach(cleanup);

describe("FinancialRecurrenceForm", () => {
  it("shows essential only for expenses and submits an income template without it", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <FinancialRecurrenceForm
        month="2026-10"
        categories={[]}
        editing={null}
        onSave={onSave}
        onCancelEdit={() => {}}
      />,
    );

    expect(screen.getByText("Despesa essencial")).toBeTruthy();
    await user.click(
      screen.getByRole("combobox", { name: "Tipo de recorrência" }),
    );
    await user.click(await screen.findByRole("option", { name: "Entrada" }));
    expect(screen.queryByText("Despesa essencial")).toBeNull();
    await user.click(
      screen.getByRole("combobox", { name: "Tipo de recorrência" }),
    );
    await user.click(await screen.findByRole("option", { name: "Saída" }));
    expect(screen.getByText("Despesa essencial")).toBeTruthy();
    await user.click(
      screen.getByRole("combobox", { name: "Tipo de recorrência" }),
    );
    await user.click(await screen.findByRole("option", { name: "Entrada" }));
    await user.type(screen.getByLabelText("Descrição"), "Salário");
    await user.type(screen.getByLabelText("Valor esperado (R$)"), "320000");
    await user.click(
      screen.getByRole("button", { name: "Adicionar recorrência" }),
    );

    expect(onSave).toHaveBeenCalledWith({
      kind: "INCOME",
      description: "Salário",
      categoryId: null,
      amount: 3200,
      frequency: "MONTHLY",
      firstDueDate: "2026-10-01",
      essential: false,
    });
  });

  it("formats recurring values as Brazilian currency and parses cents when saving", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <FinancialRecurrenceForm
        month="2026-10"
        categories={[]}
        editing={null}
        onSave={onSave}
        onCancelEdit={() => {}}
      />,
    );

    const amount = screen.getByLabelText(
      "Valor esperado (R$)",
    ) as HTMLInputElement;
    await user.type(amount, "960000");
    expect(amount.value).toBe("R$ 9.600,00");
    await user.type(screen.getByLabelText("Descrição"), "Aluguel");
    await user.click(
      screen.getByRole("button", { name: "Adicionar recorrência" }),
    );

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 9600 }),
    );
  });

  it("blocks a zero recurring amount with feedback beside the field", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <FinancialRecurrenceForm
        month="2026-10"
        categories={[]}
        editing={null}
        onSave={onSave}
        onCancelEdit={() => {}}
      />,
    );

    await user.type(screen.getByLabelText("Descrição"), "Aluguel");
    await user.type(screen.getByLabelText("Valor esperado (R$)"), "0");

    expect(screen.getByText("Informe um valor maior que zero.")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Adicionar recorrência" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("uses the end of the text when the input cannot report a caret position", () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <FinancialRecurrenceForm
        month="2026-10"
        categories={[]}
        editing={null}
        onSave={onSave}
        onCancelEdit={() => {}}
      />,
    );
    const amount = screen.getByLabelText("Valor esperado (R$)");
    Object.defineProperty(amount, "selectionStart", {
      configurable: true,
      get: () => null,
    });
    Object.defineProperty(amount, "selectionEnd", {
      configurable: true,
      get: () => null,
    });

    fireEvent.change(amount, { target: { value: "123" } });

    expect((amount as HTMLInputElement).value).toBe("R$ 1,23");
  });

  it("submits an essential expense with only active expense categories", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <FinancialRecurrenceForm
        month="2026-10"
        categories={[
          { id: "expense", kind: "EXPENSE", name: "Moradia", active: true },
          { id: "income", kind: "INCOME", name: "Salário", active: true },
          { id: "hidden", kind: "EXPENSE", name: "Oculta", active: false },
        ]}
        editing={null}
        onSave={onSave}
        onCancelEdit={() => {}}
      />,
    );

    await user.click(
      screen.getByRole("combobox", { name: "Categoria da recorrência" }),
    );
    expect(await screen.findByRole("option", { name: "Moradia" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Salário" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Oculta" })).toBeNull();
    await user.click(screen.getByRole("option", { name: "Moradia" }));
    await user.type(screen.getByLabelText("Descrição"), "Aluguel");
    await user.type(screen.getByLabelText("Valor esperado (R$)"), "55000");
    await user.click(screen.getByText("Despesa essencial"));
    await user.click(
      screen.getByRole("button", { name: "Adicionar recorrência" }),
    );

    expect(onSave).toHaveBeenCalledWith({
      kind: "EXPENSE",
      description: "Aluguel",
      categoryId: "expense",
      amount: 550,
      frequency: "MONTHLY",
      firstDueDate: "2026-10-01",
      essential: true,
    });
  });

  it("keeps the form available and reports a client-safe save failure", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error("Falha ao salvar."));
    render(
      <FinancialRecurrenceForm
        month="2026-10"
        categories={[]}
        editing={null}
        onSave={onSave}
        onCancelEdit={() => {}}
      />,
    );

    await user.type(screen.getByLabelText("Descrição"), "Internet");
    await user.type(screen.getByLabelText("Valor esperado (R$)"), "12000");
    await user.click(
      screen.getByRole("button", { name: "Adicionar recorrência" }),
    );

    expect(onSave).toHaveBeenCalledOnce();
    expect(toast.error).toHaveBeenCalledWith("Falha ao salvar.");
    expect((screen.getByLabelText("Descrição") as HTMLInputElement).value).toBe(
      "Internet",
    );
  });

  it("preserves edited identity and active state when saving a recurrence", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <FinancialRecurrenceForm
        month="2026-10"
        categories={[]}
        editing={{
          id: "recurrence-1",
          kind: "EXPENSE",
          description: "Internet",
          categoryId: null,
          amount: "120.00",
          frequency: "MONTHLY",
          firstDueDate: "2026-10-12",
          essential: false,
          active: false,
        }}
        onSave={onSave}
        onCancelEdit={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(onSave).toHaveBeenCalledWith({
      id: "recurrence-1",
      active: false,
      kind: "EXPENSE",
      description: "Internet",
      categoryId: null,
      amount: 120,
      frequency: "MONTHLY",
      firstDueDate: "2026-10-12",
      essential: false,
    });
  });

  it("shows the localized fallback for a non-Error save failure", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue("offline");
    render(
      <FinancialRecurrenceForm
        month="2026-10"
        categories={[]}
        editing={null}
        onSave={onSave}
        onCancelEdit={() => {}}
      />,
    );

    await user.type(screen.getByLabelText("Descrição"), "Internet");
    await user.type(screen.getByLabelText("Valor esperado (R$)"), "120");
    await user.click(
      screen.getByRole("button", { name: "Adicionar recorrência" }),
    );
    expect(toast.error).toHaveBeenCalledWith(
      "Não foi possível salvar a recorrência.",
    );
  });
});
