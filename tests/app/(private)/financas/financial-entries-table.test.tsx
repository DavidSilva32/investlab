// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ request: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiRequest: api.request }));
vi.mock("sonner", () => ({ toast }));
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
afterEach(() => {
  api.request.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
});

describe("FinancialEntriesTable", () => {
  it("uses compact accessible icon actions with tooltips for month selection", async () => {
    const user = userEvent.setup();
    render(
      <FinancialEntriesTable
        entries={[entry]}
        occurrences={[]}
        readOnly={false}
        onEdit={() => {}}
      />,
    );

    const selectAll = screen.getByRole("button", {
      name: "Selecionar todos os lançamentos avulsos do mês",
    });
    expect(selectAll.textContent).toBe("");
    await user.hover(selectAll);
    expect(
      await screen.findByRole("tooltip", {
        name: "Selecionar todos os lançamentos avulsos do mês",
      }),
    ).toBeTruthy();

    const deleteSelected = screen.getByRole("button", {
      name: "Excluir selecionados (0)",
    });
    expect(deleteSelected.textContent).toBe("");
    expect((deleteSelected as HTMLButtonElement).disabled).toBe(true);
  });

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
    await user.click(
      screen.getByRole("button", { name: "Ações para Aluguel" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: /Editar/ }));
    expect(onEdit).toHaveBeenCalledWith(entry);
  });

  it("keeps view-only rows free of action controls", () => {
    render(
      <FinancialEntriesTable
        entries={[entry]}
        occurrences={[]}
        readOnly
        onEdit={() => {}}
      />,
    );
    expect(screen.getByText("Aluguel")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Ações para Aluguel" }),
    ).toBeNull();
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Selecionar Aluguel",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
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

  it("uses positive and negative semantic colors with correctly directed arrows", () => {
    render(
      <FinancialEntriesTable
        entries={[
          { ...entry, kind: "INCOME", description: "Salário" },
          { ...entry, kind: "EXPENSE", description: "Aluguel" },
        ]}
        occurrences={[]}
        readOnly
        onEdit={() => {}}
      />,
    );
    const income = screen.getByText("Entrada");
    const expense = screen.getByText("Saída");
    expect(income.className).toContain("text-status-success");
    expect(expense.className).toContain("text-status-danger");
    expect(
      income.parentElement?.querySelector("svg")?.getAttribute("class"),
    ).toContain("text-status-success");
    expect(
      expense.parentElement?.querySelector("svg")?.getAttribute("class"),
    ).toContain("text-status-danger");
  });

  it("confirms deletion, refreshes the data, and reports API failures", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    api.request.mockResolvedValueOnce({});
    render(
      <FinancialEntriesTable
        entries={[entry]}
        occurrences={[]}
        readOnly={false}
        onEdit={() => {}}
        onSaved={onSaved}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Ações para Aluguel" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: /Excluir/ }));
    expect(
      screen.getByRole("alertdialog", { name: "Excluir lançamento?" }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Excluir lançamento" }),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(api.request).toHaveBeenCalledWith(
      "/api/financial-entries?id=entry-1",
      { method: "DELETE" },
      "Não foi possível excluir o lançamento.",
    );
    expect(toast.success).toHaveBeenCalledWith("Lançamento excluído.");

    api.request.mockRejectedValueOnce(new Error("Falha segura."));
    await user.click(
      screen.getByRole("button", { name: "Ações para Aluguel" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: /Excluir/ }));
    await user.click(
      screen.getByRole("button", { name: "Excluir lançamento" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Falha segura."),
    );
  });

  it("selects all manual entries for the month and excludes generated occurrences from batch deletion", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const secondEntry = { ...entry, id: "entry-2", description: "Internet" };
    api.request.mockResolvedValue({});
    render(
      <FinancialEntriesTable
        entries={[entry, secondEntry]}
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
        onEdit={() => {}}
        onSaved={onSaved}
      />,
    );

    const recurringCheckbox = screen.getByRole("checkbox", {
      name: "Selecionar Salário",
    }) as HTMLButtonElement;
    expect(recurringCheckbox.disabled).toBe(true);
    await user.click(
      screen.getByRole("button", {
        name: "Selecionar todos os lançamentos avulsos do mês",
      }),
    );
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Selecionar Aluguel",
        }) as HTMLButtonElement
      ).getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Selecionar Internet",
        }) as HTMLButtonElement
      ).getAttribute("aria-checked"),
    ).toBe("true");
    expect(recurringCheckbox.getAttribute("aria-checked")).toBe("false");
    await user.click(
      screen.getByRole("button", { name: "Excluir selecionados (2)" }),
    );
    expect(
      screen.getByRole("alertdialog", { name: "Excluir 2 lançamentos?" }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Excluir 2 lançamentos" }),
    );
    await waitFor(() => expect(api.request).toHaveBeenCalledTimes(2));
    expect(api.request).toHaveBeenNthCalledWith(
      1,
      "/api/financial-entries?id=entry-1",
      { method: "DELETE" },
      "Não foi possível excluir o lançamento.",
    );
    expect(api.request).toHaveBeenNthCalledWith(
      2,
      "/api/financial-entries?id=entry-2",
      { method: "DELETE" },
      "Não foi possível excluir o lançamento.",
    );
    expect(onSaved).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledWith("2 lançamentos excluídos.");
  });

  it("retains failed selections when only some batch deletions succeed", async () => {
    const user = userEvent.setup();
    api.request
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("Falha segura."));
    render(
      <FinancialEntriesTable
        entries={[entry, { ...entry, id: "entry-2", description: "Internet" }]}
        occurrences={[]}
        readOnly={false}
        onEdit={() => {}}
      />,
    );
    await user.click(
      screen.getByRole("button", {
        name: "Selecionar todos os lançamentos avulsos do mês",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Excluir selecionados (2)" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Excluir 2 lançamentos" }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "1 lançamento excluído; 1 não pôde ser excluído. Tente novamente.",
      ),
    );
    expect(
      screen.getByRole("alertdialog", { name: "Excluir lançamento?" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Selecionar Aluguel",
        }) as HTMLButtonElement
      ).getAttribute("aria-checked"),
    ).toBe("false");
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Selecionar Internet",
        }) as HTMLButtonElement
      ).getAttribute("aria-checked"),
    ).toBe("true");
  });
});
