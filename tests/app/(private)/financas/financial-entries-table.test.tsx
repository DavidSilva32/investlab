// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
  it("places select-all in the selection column header and keeps delete action compact", async () => {
    render(
      <FinancialEntriesTable
        entries={[entry]}
        readOnly={false}
        onEdit={() => {}}
      />,
    );

    const selectAll = screen.getByRole("checkbox", {
      name: "Selecionar todos os registros do mês",
    });
    expect(selectAll.closest("th")).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: "Selecionar todos os registros do mês",
      }),
    ).toBeNull();

    const deleteSelected = screen.getByRole("button", {
      name: "Remover selecionados (0)",
    });
    expect(deleteSelected.textContent).toBe("");
    expect((deleteSelected as HTMLButtonElement).disabled).toBe(true);
  });

  it("selects and clears the whole month from the header checkbox", async () => {
    const user = userEvent.setup();
    render(
      <FinancialEntriesTable
        entries={[entry]}
        readOnly={false}
        onEdit={() => {}}
      />,
    );

    await user.click(
      screen.getByRole("checkbox", {
        name: "Selecionar todos os registros do mês",
      }),
    );
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Selecionar Aluguel",
        }) as HTMLButtonElement
      ).getAttribute("aria-checked"),
    ).toBe("true");
    await user.click(
      screen.getByRole("checkbox", {
        name: "Desmarcar todos os registros do mês",
      }),
    );
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Selecionar Aluguel",
        }) as HTMLButtonElement
      ).getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("keeps Previsto and Realizado as Situação values, not filter columns", async () => {
    const user = userEvent.setup();
    render(
      <FinancialEntriesTable
        entries={[entry]}
        readOnly={false}
        onEdit={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Filtros" }));
    await user.click(screen.getByRole("combobox", { name: "Coluna 1" }));
    expect(screen.queryByRole("option", { name: "Previsto" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Realizado" })).toBeNull();
    await user.click(screen.getByRole("option", { name: "Situação" }));
    await user.click(screen.getByRole("combobox", { name: "Valor 1" }));
    expect(
      await screen.findByRole("option", { name: "Previsto" }),
    ).toBeTruthy();
    expect(screen.getByRole("option", { name: "Realizado" })).toBeTruthy();
  });

  it("renders only financial entries supplied for the month", () => {
    render(
      <FinancialEntriesTable
        entries={[entry]}
        readOnly={false}
        onEdit={() => {}}
      />,
    );

    expect(screen.getByText("Aluguel")).toBeTruthy();
  });

  it("shows an account invoice as an ordinary financial entry", () => {
    render(
      <FinancialEntriesTable
        entries={[{ ...entry, description: "Pagamento fatura Inter" }]}
        readOnly
        onEdit={() => {}}
      />,
    );

    expect(screen.getByText("Pagamento fatura Inter")).toBeTruthy();
    expect(screen.queryByText(/fatura vinculada às compras/i)).toBeNull();
    expect(screen.queryByText("Canal")).toBeNull();
  });

  it("shows a launch linked to a recurrence as recurring and keeps launch actions", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(
      <FinancialEntriesTable
        entries={[{ ...entry, recurrenceId: "rec-1" }]}
        readOnly={false}
        onEdit={onEdit}
      />,
    );

    const row = screen.getByRole("row", { name: /Aluguel/ });
    expect(within(row).getByRole("cell", { name: "Aluguel" })).toBeTruthy();
    expect(within(row).getByRole("cell", { name: "Recorrente" })).toBeTruthy();
    expect(
      within(row).getByRole("cell", { name: "Moradia" }).querySelector("svg"),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Ações para Aluguel" }),
    );
    expect(
      await screen.findByRole("menuitem", { name: "Editar" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("menuitem", { name: "Editar recorrência" }),
    ).toBeNull();
    await user.click(screen.getByRole("menuitem", { name: "Editar" }));
    expect(onEdit).toHaveBeenCalledWith({ ...entry, recurrenceId: "rec-1" });
  });

  it("renders a generic icon for a personalized category", () => {
    render(
      <FinancialEntriesTable
        entries={[{ ...entry, categoryName: "Veterinário" }]}
        readOnly
        onEdit={() => {}}
      />,
    );

    const categoryCell = screen.getByRole("cell", { name: "Veterinário" });
    expect(categoryCell.querySelector("svg")).toBeTruthy();
  });

  it("records an avulso realization without changing its forecast", async () => {
    const user = userEvent.setup();
    api.request.mockResolvedValue({});
    const plannedEntry = { ...entry, actualAmount: null, actualDate: null };
    render(
      <FinancialEntriesTable
        entries={[plannedEntry]}
        readOnly={false}
        onEdit={() => {}}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Ações para Aluguel" }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Registrar realizado" }),
    );
    await user.clear(screen.getByLabelText("Valor realizado (R$)"));
    await user.type(screen.getByLabelText("Valor realizado (R$)"), "60000");
    await user.click(screen.getByRole("button", { name: "Salvar realização" }));

    await waitFor(() => expect(api.request).toHaveBeenCalledOnce());
    const [url, request] = api.request.mock.calls[0];
    expect(url).toBe("/api/financial-entries");
    expect(request.method).toBe("PATCH");
    expect(JSON.parse(request.body)).toMatchObject({
      id: "entry-1",
      recurrenceId: null,
      expectedAmount: 550,
      expectedDate: "2026-10-10",
      actualAmount: 600,
      actualDate: expect.any(String),
    });
  });

  it("preserves the amount cursor while applying the Brazilian currency mask", async () => {
    const user = userEvent.setup();
    render(
      <FinancialEntriesTable
        entries={[{ ...entry, actualAmount: null, actualDate: null }]}
        readOnly={false}
        onEdit={() => {}}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Ações para Aluguel" }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Registrar realizado" }),
    );
    const amount = screen.getByLabelText("Valor realizado (R$)");
    Object.defineProperty(amount, "selectionStart", {
      configurable: true,
      get: () => 5,
    });
    Object.defineProperty(amount, "selectionEnd", {
      configurable: true,
      get: () => 5,
    });
    fireEvent.change(amount, { target: { value: "R$ 123,45" } });

    expect((amount as HTMLInputElement).value).toBe("R$ 123,45");
    expect((amount as HTMLInputElement).selectionStart).not.toBeNull();

    Object.defineProperty(amount, "selectionStart", {
      configurable: true,
      get: () => null,
    });
    Object.defineProperty(amount, "selectionEnd", {
      configurable: true,
      get: () => null,
    });
    fireEvent.change(amount, { target: { value: "R$ 234,56" } });
    expect((amount as HTMLInputElement).value).toBe("R$ 234,56");
  });

  it("allows updating a realized entry date and closes the form on cancel", async () => {
    const user = userEvent.setup();
    render(
      <FinancialEntriesTable
        entries={[{ ...entry, actualDate: null }]}
        readOnly={false}
        onEdit={() => {}}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Ações para Aluguel" }),
    );
    await user.click(
      await screen.findByRole("menuitem", {
        name: "Informar data realizada",
      }),
    );
    expect(
      (screen.getByLabelText("Valor realizado (R$)") as HTMLInputElement).value,
    ).toBe("R$ 560,00");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(
      screen.queryByRole("dialog", { name: "Registrar realização" }),
    ).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Ações para Aluguel" }),
    );
    await user.click(
      await screen.findByRole("menuitem", {
        name: "Informar data realizada",
      }),
    );
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Registrar realização" }),
      ).toBeNull(),
    );
  });

  it.each([
    [new Error("Falha temporária."), "Falha temporária."],
    ["offline", "Não foi possível registrar a realização."],
  ])(
    "reports a safe error when realization is rejected",
    async (error, message) => {
      const user = userEvent.setup();
      api.request.mockRejectedValueOnce(error);
      render(
        <FinancialEntriesTable
          entries={[{ ...entry, actualAmount: null, actualDate: null }]}
          readOnly={false}
          onEdit={() => {}}
        />,
      );

      await user.click(
        screen.getByRole("button", { name: "Ações para Aluguel" }),
      );
      await user.click(
        await screen.findByRole("menuitem", { name: "Registrar realizado" }),
      );
      await user.click(
        screen.getByRole("button", { name: "Salvar realização" }),
      );

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message));
      expect(
        screen.getByRole("dialog", { name: "Registrar realização" }),
      ).toBeTruthy();
    },
  );

  it("records a realized-only entry without a forecast amount", async () => {
    const user = userEvent.setup();
    api.request.mockResolvedValue({});
    render(
      <FinancialEntriesTable
        entries={[
          {
            ...entry,
            expectedAmount: null,
            expectedDate: null,
            actualAmount: null,
            actualDate: null,
          },
        ]}
        readOnly={false}
        onEdit={() => {}}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Ações para Aluguel" }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Registrar realizado" }),
    );
    await user.clear(screen.getByLabelText("Valor realizado (R$)"));
    await user.type(screen.getByLabelText("Valor realizado (R$)"), "60000");
    await user.click(screen.getByRole("button", { name: "Salvar realização" }));

    await waitFor(() => expect(api.request).toHaveBeenCalledOnce());
    expect(JSON.parse(api.request.mock.calls[0][1].body)).toMatchObject({
      expectedAmount: null,
      expectedDate: null,
      actualAmount: 600,
    });
  });

  it("uses option selectors for fixed type and origin filters", async () => {
    const user = userEvent.setup();
    render(
      <FinancialEntriesTable entries={[entry]} readOnly onEdit={() => {}} />,
    );

    await user.click(screen.getByRole("button", { name: "Filtros" }));
    await user.click(screen.getByRole("combobox", { name: "Coluna 1" }));
    await user.click(await screen.findByRole("option", { name: "Tipo" }));
    await user.click(screen.getByRole("combobox", { name: "Valor 1" }));
    expect(await screen.findByRole("option", { name: "Entrada" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Saída" })).toBeTruthy();
    await user.click(screen.getByRole("option", { name: "Saída" }));
    await user.click(
      screen.getByRole("button", { name: "Adicionar critério" }),
    );
    await user.click(screen.getByRole("combobox", { name: "Coluna 2" }));
    await user.click(await screen.findByRole("option", { name: "Origem" }));
    await user.click(screen.getByRole("combobox", { name: "Valor 2" }));
    expect(await screen.findByRole("option", { name: "Avulso" })).toBeTruthy();
    await user.click(screen.getByRole("option", { name: "Avulso" }));
    await user.click(
      screen.getByRole("button", { name: "Adicionar critério" }),
    );
    await user.click(screen.getByRole("combobox", { name: "Coluna 3" }));
    await user.click(await screen.findByRole("option", { name: "Situação" }));
    await user.click(screen.getByRole("combobox", { name: "Valor 3" }));
    expect(
      await screen.findByRole("option", { name: "Realizado" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("option", { name: "Realizado" }));
    await user.click(screen.getByRole("button", { name: "Filtrar" }));

    expect(screen.getByText("Aluguel")).toBeTruthy();
    expect(screen.queryByText("Salário")).toBeNull();
  });

  it("sorts launch details by description, category, and both amounts", async () => {
    const user = userEvent.setup();
    const salary = {
      ...entry,
      id: "entry-salary",
      kind: "INCOME" as const,
      description: "Salário",
      categoryName: "Renda",
      expectedAmount: "1000.00",
      actualAmount: "950.00",
    };
    const planned = {
      ...entry,
      id: "entry-planned",
      description: "Internet",
      categoryName: "Contas e serviços",
      expectedAmount: null,
      expectedDate: null,
      actualAmount: null,
      actualDate: null,
    };
    render(
      <FinancialEntriesTable
        entries={[entry, salary, planned]}
        readOnly
        onEdit={() => {}}
      />,
    );

    for (const column of [
      "Data",
      "Lançamento",
      "Categoria",
      "Previsto",
      "Realizado",
    ]) {
      await user.click(screen.getByRole("button", { name: column }));
      expect(screen.getByRole("cell", { name: "Aluguel" })).toBeTruthy();
      expect(screen.getByRole("cell", { name: "Salário" })).toBeTruthy();
      expect(screen.getByRole("cell", { name: "Internet" })).toBeTruthy();
    }
  });

  it("keeps entries without dates after dated entries", () => {
    render(
      <FinancialEntriesTable
        entries={[
          {
            ...entry,
            id: "entry-undated",
            description: "Sem data",
            expectedDate: null,
            actualDate: null,
          },
          entry,
        ]}
        readOnly
        onEdit={() => {}}
      />,
    );

    const rows = screen.getAllByRole("row");
    expect(within(rows[1]).getByText("Aluguel")).toBeTruthy();
    expect(rows[2].querySelectorAll("td")[1].textContent).toContain("Sem data");
  });

  it("keeps view-only rows free of action controls", () => {
    render(
      <FinancialEntriesTable entries={[entry]} readOnly onEdit={() => {}} />,
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

  it("shows an empty state when the month has no financial entries", () => {
    render(
      <FinancialEntriesTable entries={[]} readOnly={false} onEdit={() => {}} />,
    );

    expect(
      screen.getByText("Nenhum lançamento ou vencimento neste mês."),
    ).toBeTruthy();
  });

  it("uses positive and negative semantic colors with correctly directed arrows", () => {
    render(
      <FinancialEntriesTable
        entries={[
          {
            ...entry,
            id: "entry-income",
            kind: "INCOME",
            description: "Salário",
          },
          {
            ...entry,
            id: "entry-expense",
            kind: "EXPENSE",
            description: "Aluguel",
          },
        ]}
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
      screen.getByRole("alertdialog", {
        name: "Remover registro selecionado?",
      }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Confirmar remoção" }));
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
    await user.click(screen.getByRole("button", { name: "Confirmar remoção" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Falha segura."),
    );
  });

  it("retains failed selections when only some batch deletions succeed", async () => {
    const user = userEvent.setup();
    api.request
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("Falha segura."));
    render(
      <FinancialEntriesTable
        entries={[entry, { ...entry, id: "entry-2", description: "Internet" }]}
        readOnly={false}
        onEdit={() => {}}
      />,
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: "Selecionar todos os registros do mês",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Remover selecionados (2)" }),
    );
    await user.click(screen.getByRole("button", { name: "Confirmar remoção" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "1 ação concluída; 1 registro não pôde ser removido. Tente novamente.",
      ),
    );
    expect(
      screen.getByRole("alertdialog", {
        name: "Remover registro selecionado?",
      }),
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

  it("summarizes multiple successful actions when a batch removal is partial", async () => {
    const user = userEvent.setup();
    api.request
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("Falha segura."));
    render(
      <FinancialEntriesTable
        entries={[
          entry,
          { ...entry, id: "entry-2", description: "Internet" },
          { ...entry, id: "entry-3", description: "Mercado" },
        ]}
        readOnly={false}
        onEdit={() => {}}
      />,
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: "Selecionar todos os registros do mês",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Remover selecionados (3)" }),
    );
    await user.click(screen.getByRole("button", { name: "Confirmar remoção" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "2 ações concluídas; 1 registro não pôde ser removido. Tente novamente.",
      ),
    );
  });

  it("reports successful removal of selected one-off entries", async () => {
    const user = userEvent.setup();
    api.request.mockResolvedValue({});
    render(
      <FinancialEntriesTable
        entries={[entry, { ...entry, id: "entry-2", description: "Internet" }]}
        readOnly={false}
        onEdit={() => {}}
      />,
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: "Selecionar todos os registros do mês",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Remover selecionados (2)" }),
    );
    await user.click(screen.getByRole("button", { name: "Confirmar remoção" }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("2 lançamentos excluídos."),
    );
  });

  it("selects and deselects individual rows and reports multiple deletion failures", async () => {
    const user = userEvent.setup();
    api.request
      .mockRejectedValueOnce("offline")
      .mockRejectedValueOnce(new Error("Falha segura."));
    render(
      <FinancialEntriesTable
        entries={[entry, { ...entry, id: "entry-2", description: "Internet" }]}
        readOnly={false}
        onEdit={() => {}}
      />,
    );

    const checkbox = screen.getByRole("checkbox", {
      name: "Selecionar Aluguel",
    });
    await user.click(checkbox);
    expect(checkbox.getAttribute("aria-checked")).toBe("true");
    await user.click(checkbox);
    expect(checkbox.getAttribute("aria-checked")).toBe("false");
    await user.click(
      screen.getByRole("checkbox", {
        name: "Selecionar todos os registros do mês",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Remover selecionados (2)" }),
    );
    await user.click(screen.getByRole("button", { name: "Confirmar remoção" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível remover 2 registros selecionados. Tente novamente.",
      ),
    );
  });

  it("uses a safe fallback for one rejected deletion without an Error", async () => {
    const user = userEvent.setup();
    api.request.mockRejectedValue("offline");
    render(
      <FinancialEntriesTable
        entries={[entry]}
        readOnly={false}
        onEdit={() => {}}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Ações para Aluguel" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: /Excluir/ }));
    await user.click(screen.getByRole("button", { name: "Confirmar remoção" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível excluir o lançamento. Tente novamente.",
      ),
    );
  });
});
