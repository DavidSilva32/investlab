// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinancialEntriesTable } from "@/app/(private)/financas/_components/financial-entries-table";

const entry = {
  id: "entry-1",
  kind: "EXPENSE" as const,
  description: "Aluguel",
  categoryId: "cat-1",
  categoryName: "Moradia",
  expectedAmount: "550.00",
  expectedDate: "2026-10-10",
  actualAmount: "560.00",
  actualDate: "2026-10-11",
};

afterEach(cleanup);

describe("FinancialEntriesTable", () => {
  it("combines manual and recurring items and opens only manual entries for editing", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(
      <FinancialEntriesTable
        entries={[entry]}
        occurrences={[
          {
            id: "rec-1:2026-10-12",
            kind: "INCOME",
            description: "Salário",
            category: "Renda",
            dueDate: "2026-10-12",
            expectedAmount: "3000.00",
            actualAmount: null,
            actualDate: null,
            status: "planned",
          },
        ]}
        readOnly={false}
        onEdit={onEdit}
      />,
    );

    expect(screen.getByText("Aluguel")).toBeTruthy();
    expect(screen.getByText("Salário")).toBeTruthy();
    expect(screen.getByRole("cell", { name: /R\$\s*560,00/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Editar" }));
    expect(onEdit).toHaveBeenCalledWith(entry);
  });

  it("keeps view-only rows free of edit controls", () => {
    render(
      <FinancialEntriesTable
        entries={[entry]}
        occurrences={[]}
        readOnly
        onEdit={() => {}}
      />,
    );
    expect(screen.getByText("Aluguel")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
  });
});
