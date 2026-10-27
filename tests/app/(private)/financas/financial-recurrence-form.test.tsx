// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    await user.type(screen.getByLabelText("Descrição"), "Salário");
    await user.type(screen.getByLabelText("Valor esperado (R$)"), "3200");
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
});
