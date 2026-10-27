// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FinancialEntryDialog } from "@/app/(private)/financas/_components/financial-entry-dialog";

const categories = [
  {
    id: "24e0fa40-0563-4e4e-a52e-64fab0e6f79f",
    kind: "EXPENSE" as const,
    name: "Moradia",
    active: true,
  },
];

afterEach(cleanup);

describe("FinancialEntryDialog", () => {
  it("presents paired expected and actual amount/date fields with a selected category", () => {
    render(
      <FinancialEntryDialog
        open
        onOpenChange={() => {}}
        categories={categories}
        entry={null}
        onSaved={() => {}}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "Novo lançamento" }),
    ).toBeTruthy();
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
    expect(screen.getAllByLabelText("Valor (R$)")).toHaveLength(2);
    expect(screen.getByLabelText("Data prevista")).toBeTruthy();
    expect(screen.getByLabelText("Data realizada")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Salvar lançamento" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
});
