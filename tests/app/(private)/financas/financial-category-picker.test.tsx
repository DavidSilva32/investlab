// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinancialCategoryPicker } from "@/app/(private)/financas/_components/financial-category-picker";

const categories = [
  { id: "food", name: "Alimentação" },
  { id: "card", name: "Fatura do cartão" },
];

afterEach(cleanup);

describe("FinancialCategoryPicker", () => {
  it("filters the fixed catalog and returns the selected category id", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <FinancialCategoryPicker
        categories={categories}
        value=""
        onValueChange={onValueChange}
        label="Categoria"
        required
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "Categoria" }));
    await user.type(screen.getByLabelText("Buscar categoria"), "cartao");

    expect(screen.queryByRole("option", { name: "Alimentação" })).toBeNull();
    await user.click(screen.getByRole("option", { name: "Fatura do cartão" }));
    expect(onValueChange).toHaveBeenCalledWith("card");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("supports opening, searching, and selecting with the keyboard", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <FinancialCategoryPicker
        categories={categories}
        value=""
        onValueChange={onValueChange}
        label="Categoria"
      />,
    );

    const trigger = screen.getByRole("combobox", { name: "Categoria" });
    await user.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    await user.type(screen.getByLabelText("Buscar categoria"), "cartao");
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onValueChange).toHaveBeenCalledWith("card");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("shows a useful empty state when search has no match", async () => {
    const user = userEvent.setup();
    render(
      <FinancialCategoryPicker
        categories={categories}
        value=""
        onValueChange={() => {}}
        label="Categoria"
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "Categoria" }));
    await user.type(screen.getByLabelText("Buscar categoria"), "inexistente");
    expect(
      await screen.findByText("Nenhuma categoria encontrada."),
    ).toBeTruthy();
  });

  it("keeps the picker disabled when editing a locked recurrence", () => {
    render(
      <FinancialCategoryPicker
        categories={categories}
        value="card"
        onValueChange={() => {}}
        label="Categoria"
        disabled
      />,
    );

    expect(
      screen
        .getByRole("combobox", { name: "Categoria" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByRole("combobox", { name: "Categoria" }).textContent,
    ).toContain("Fatura do cartão");
  });
});
