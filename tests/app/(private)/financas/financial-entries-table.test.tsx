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

  it("shows an empty state when the month has no manual or recurring items", () => {
    render(
      <FinancialEntriesTable
        entries={[]}
        occurrences={[]}
        readOnly={false}
        onEdit={() => {}}
      />,
    );

    expect(
      screen.getByText("Nenhum lançamento ou vencimento neste mês."),
    ).toBeTruthy();
  });

  it("renders undated entries and recurring items with missing values safely", () => {
    render(
      <FinancialEntriesTable
        entries={[
          {
            ...entry,
            id: "income-1",
            kind: "INCOME",
            description: "Bônus",
            categoryId: "cat-income",
            categoryName: "Renda",
            expectedAmount: null,
            expectedDate: null,
            actualAmount: "900.00",
            actualDate: null,
          },
          {
            ...entry,
            id: "bonus-2",
            kind: "INCOME",
            description: "Reembolso sem data",
            expectedDate: null,
            actualDate: null,
            expectedAmount: null,
            actualAmount: null,
          },
        ]}
        occurrences={[
          {
            id: "rec-2:2026-10-01",
            kind: "EXPENSE",
            description: "Conta variável",
            category: null,
            dueDate: "2026-10-01",
            expectedAmount: null,
            actualAmount: null,
            actualDate: null,
            status: "planned",
          },
          {
            id: "rec-3:2026-10-02",
            kind: "INCOME",
            description: "Salário recebido",
            category: "Renda",
            dueDate: "2026-10-02",
            expectedAmount: "3000.00",
            actualAmount: "3000.00",
            actualDate: "2026-10-02",
            status: "realized",
          },
        ]}
        readOnly={false}
        onEdit={() => {}}
      />,
    );

    expect(screen.getByText("Bônus")).toBeTruthy();
    expect(screen.getByText("Reembolso sem data")).toBeTruthy();
    expect(screen.getByText("Conta variável")).toBeTruthy();
    expect(screen.getByText("Salário recebido")).toBeTruthy();
    expect(screen.getByText(/Recorrente · Sem categoria/)).toBeTruthy();
    expect(screen.getAllByText("Sem registro").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Sem data").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Realizado").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Previsto").length).toBeGreaterThan(1);
  });

  it("sorts kind, expected amount, status, and realized amount columns", async () => {
    const user = userEvent.setup();
    render(
      <FinancialEntriesTable
        entries={[entry]}
        occurrences={[
          {
            id: "rec-income",
            kind: "INCOME",
            description: "Salário",
            category: null,
            dueDate: "2026-10-01",
            expectedAmount: null,
            actualAmount: null,
            actualDate: null,
            status: "planned",
          },
        ]}
        readOnly
        onEdit={() => {}}
      />,
    );

    for (const column of [
      "Lançamento",
      "Tipo",
      "Previsto",
      "Situação",
      "Realizado",
    ]) {
      await user.click(screen.getByRole("button", { name: column }));
      expect(screen.getByText("Aluguel")).toBeTruthy();
      expect(screen.getByText("Salário")).toBeTruthy();
    }
  });
});
