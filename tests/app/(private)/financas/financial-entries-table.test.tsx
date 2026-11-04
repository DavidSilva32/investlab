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
        occurrences={[]}
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

  it("keeps Previsto and Realizado as Situação values, not filter columns", async () => {
    const user = userEvent.setup();
    render(
      <FinancialEntriesTable
        entries={[entry]}
        occurrences={[]}
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

  it("combines manual and recurring items and opens only manual entries for editing", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(
      <FinancialEntriesTable
        entries={[entry]}
        occurrences={[
          {
            id: "rec-1:2026-10-12",
            recurrenceId: "rec-1",
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

  it("shows a launch linked to a recurrence as recurring and keeps launch actions", async () => {
    const user = userEvent.setup();
    render(
      <FinancialEntriesTable
        entries={[{ ...entry, recurrenceId: "rec-1" }]}
        occurrences={[]}
        readOnly={false}
        onEdit={() => {}}
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
  });

  it("renders a generic icon for a personalized category", () => {
    render(
      <FinancialEntriesTable
        entries={[{ ...entry, categoryName: "Veterinário" }]}
        occurrences={[]}
        readOnly
        onEdit={() => {}}
      />,
    );

    const categoryCell = screen.getByRole("cell", { name: "Veterinário" });
    expect(categoryCell.querySelector("svg")).toBeTruthy();
  });

  it("labels and filters occurrences without a category", async () => {
    const user = userEvent.setup();
    render(
      <FinancialEntriesTable
        entries={[]}
        occurrences={[
          {
            id: "rec-1:2026-10-12",
            recurrenceId: "rec-1",
            kind: "INCOME",
            description: "Receita sem categoria",
            category: null,
            dueDate: "2026-10-12",
            expectedAmount: "3000.00",
            actualAmount: null,
            actualDate: null,
            status: "planned",
          },
        ]}
        readOnly
        onEdit={() => {}}
      />,
    );

    expect(
      screen.getByRole("row", { name: /Receita sem categoria/ }).textContent,
    ).toContain("Sem categoria");
    await user.click(screen.getByRole("button", { name: "Filtros" }));
    await user.click(screen.getByRole("combobox", { name: "Coluna 1" }));
    await user.click(await screen.findByRole("option", { name: "Categoria" }));
    await user.click(screen.getByRole("combobox", { name: "Valor 1" }));
    await user.click(
      await screen.findByRole("option", { name: "Sem categoria" }),
    );
    await user.click(screen.getByRole("button", { name: "Filtrar" }));
    expect(screen.getByText("Receita sem categoria")).toBeTruthy();
  });

  it("opens the recurrence model editor from a recurring occurrence", async () => {
    const user = userEvent.setup();
    const onEditRecurrence = vi.fn();
    render(
      <FinancialEntriesTable
        entries={[]}
        occurrences={[
          {
            id: "rec-1:2026-10-10",
            recurrenceId: "rec-1",
            kind: "EXPENSE",
            description: "Aluguel",
            category: "Moradia",
            dueDate: "2026-10-10",
            expectedAmount: "550.00",
            actualAmount: null,
            actualDate: null,
            status: "planned",
          },
        ]}
        readOnly={false}
        onEdit={() => {}}
        onEditRecurrence={onEditRecurrence}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Ações para Aluguel em 10/10/2026",
      }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Editar recorrência" }),
    );

    expect(onEditRecurrence).toHaveBeenCalledWith("rec-1");
  });

  it("quickly records a recurring realization from its table row", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    api.request.mockResolvedValue({});
    render(
      <FinancialEntriesTable
        entries={[]}
        occurrences={[
          {
            id: "rec-1:2026-10-10",
            recurrenceId: "rec-1",
            kind: "EXPENSE",
            description: "Aluguel",
            category: "Moradia",
            dueDate: "2026-10-10",
            expectedAmount: "550.00",
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

    await user.click(
      screen.getByRole("button", {
        name: "Ações para Aluguel em 10/10/2026",
      }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Registrar realizado" }),
    );
    expect(screen.getByLabelText("Valor realizado (R$)")).toHaveProperty(
      "value",
      "R$ 550,00",
    );
    await user.click(screen.getByRole("button", { name: "Salvar realização" }));

    await waitFor(() => expect(api.request).toHaveBeenCalledOnce());
    const [, request] = api.request.mock.calls[0];
    expect(request.method).toBe("PUT");
    expect(JSON.parse(request.body)).toEqual({
      recurrenceId: "rec-1",
      dueDate: "2026-10-10",
      actualDate: expect.any(String),
      actualAmount: 550,
    });
    expect(onSaved).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledWith("Realização registrada.");
  });

  it("keeps the amount mask usable when the cursor position is unavailable", async () => {
    const user = userEvent.setup();
    render(
      <FinancialEntriesTable
        entries={[]}
        occurrences={[
          {
            id: "rec-1:2026-10-10",
            recurrenceId: "rec-1",
            kind: "EXPENSE",
            description: "Aluguel",
            category: "Moradia",
            dueDate: "2026-10-10",
            expectedAmount: "550.00",
            actualAmount: null,
            actualDate: null,
            status: "planned",
          },
        ]}
        readOnly={false}
        onEdit={() => {}}
      />,
    );
    await user.click(
      screen.getByRole("button", {
        name: "Ações para Aluguel em 10/10/2026",
      }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Registrar realizado" }),
    );
    const amount = screen.getByLabelText("Valor realizado (R$)");
    Object.defineProperty(amount, "selectionStart", {
      configurable: true,
      get: () => null,
    });
    Object.defineProperty(amount, "selectionEnd", {
      configurable: true,
      get: () => null,
    });
    fireEvent.change(amount, { target: { value: "R$ 123,45" } });

    expect((amount as HTMLInputElement).value).toBe("R$ 123,45");
  });

  it("closes the realization form and cancels ending a recurring model", async () => {
    const user = userEvent.setup();
    render(
      <FinancialEntriesTable
        entries={[]}
        occurrences={[
          {
            id: "rec-1:2026-10-10",
            recurrenceId: "rec-1",
            kind: "EXPENSE",
            description: "Aluguel",
            category: "Moradia",
            dueDate: "2026-10-10",
            expectedAmount: "550.00",
            actualAmount: null,
            actualDate: null,
            status: "planned",
          },
        ]}
        readOnly={false}
        onEdit={() => {}}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Ações para Aluguel em 10/10/2026",
      }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Registrar realizado" }),
    );
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Registrar realização" }),
      ).toBeNull(),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Ações para Aluguel em 10/10/2026",
      }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Registrar realizado" }),
    );
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(
      screen.queryByRole("dialog", { name: "Registrar realização" }),
    ).toBeNull();

    await user.click(
      screen.getByRole("button", {
        name: "Ações para Aluguel em 10/10/2026",
      }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Excluir recorrência" }),
    );
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("alertdialog", { name: "Excluir recorrência?" }),
      ).toBeNull(),
    );
  });

  it("reports a safe fallback when a recurring model cannot be ended", async () => {
    const user = userEvent.setup();
    api.request.mockRejectedValue("offline");
    render(
      <FinancialEntriesTable
        entries={[]}
        occurrences={[
          {
            id: "rec-1:2026-10-10",
            recurrenceId: "rec-1",
            kind: "EXPENSE",
            description: "Aluguel",
            category: "Moradia",
            dueDate: "2026-10-10",
            expectedAmount: "550.00",
            actualAmount: null,
            actualDate: null,
            status: "planned",
          },
        ]}
        readOnly={false}
        onEdit={() => {}}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Ações para Aluguel em 10/10/2026",
      }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Excluir recorrência" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Excluir recorrência" }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível encerrar a recorrência.",
      ),
    );
  });

  it("shows API messages when ending a model or recording a realization fails", async () => {
    const user = userEvent.setup();
    api.request.mockRejectedValue(new Error("Falha temporária."));
    render(
      <FinancialEntriesTable
        entries={[]}
        occurrences={[
          {
            id: "rec-1:2026-10-10",
            recurrenceId: "rec-1",
            kind: "EXPENSE",
            description: "Aluguel",
            category: "Moradia",
            dueDate: "2026-10-10",
            expectedAmount: "550.00",
            actualAmount: null,
            actualDate: null,
            status: "planned",
          },
        ]}
        readOnly={false}
        onEdit={() => {}}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Ações para Aluguel em 10/10/2026",
      }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Excluir recorrência" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Excluir recorrência" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Falha temporária."),
    );
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    await user.click(
      screen.getByRole("button", {
        name: "Ações para Aluguel em 10/10/2026",
      }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Registrar realizado" }),
    );
    await user.click(screen.getByRole("button", { name: "Salvar realização" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenLastCalledWith("Falha temporária."),
    );
  });

  it("shows the outcome when a recurring occurrence ends its model", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    api.request.mockResolvedValue({ action: "ended" });
    render(
      <FinancialEntriesTable
        entries={[]}
        occurrences={[
          {
            id: "rec-1:2026-10-10",
            recurrenceId: "rec-1",
            kind: "EXPENSE",
            description: "Aluguel",
            category: "Moradia",
            dueDate: "2026-10-10",
            expectedAmount: "550.00",
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

    await user.click(
      screen.getByRole("button", {
        name: "Ações para Aluguel em 10/10/2026",
      }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Excluir recorrência" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Excluir recorrência" }),
    );

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Recorrência encerrada. O histórico foi mantido.",
      ),
    );
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("reports the result of deleting a single recurring model", async () => {
    const user = userEvent.setup();
    api.request.mockResolvedValue({ action: "deleted" });
    render(
      <FinancialEntriesTable
        entries={[]}
        occurrences={[
          {
            id: "rec-1:2026-10-10",
            recurrenceId: "rec-1",
            kind: "EXPENSE",
            description: "Aluguel",
            category: "Moradia",
            dueDate: "2026-10-10",
            expectedAmount: "550.00",
            actualAmount: null,
            actualDate: null,
            status: "planned",
          },
        ]}
        readOnly={false}
        onEdit={() => {}}
      />,
    );

    await user.click(
      screen.getByRole("checkbox", { name: "Selecionar Aluguel" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Remover selecionados (1)" }),
    );
    await user.click(screen.getByRole("button", { name: "Confirmar remoção" }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Recorrência excluída."),
    );
  });

  it("reports a partial result when deleting selected rows has mixed outcomes", async () => {
    const user = userEvent.setup();
    api.request.mockImplementation((url: string) =>
      url.startsWith("/api/financial-entries")
        ? Promise.resolve({})
        : Promise.reject("offline"),
    );
    render(
      <FinancialEntriesTable
        entries={[entry]}
        occurrences={[
          {
            id: "rec-1:2026-10-10",
            recurrenceId: "rec-1",
            kind: "EXPENSE",
            description: "Internet",
            category: "Contas e serviços",
            dueDate: "2026-10-10",
            expectedAmount: "100.00",
            actualAmount: null,
            actualDate: null,
            status: "planned",
          },
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
      screen.getByRole("button", { name: "Remover selecionados (2)" }),
    );
    await user.click(screen.getByRole("button", { name: "Confirmar remoção" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "1 ação concluída; 1 registro não pôde ser removido. Tente novamente.",
      ),
    );
  });

  it("uses the recurrence-specific fallback for a rejected recurring deletion", async () => {
    const user = userEvent.setup();
    api.request.mockRejectedValue("offline");
    render(
      <FinancialEntriesTable
        entries={[]}
        occurrences={[
          {
            id: "rec-1:2026-10-10",
            recurrenceId: "rec-1",
            kind: "EXPENSE",
            description: "Aluguel",
            category: "Moradia",
            dueDate: "2026-10-10",
            expectedAmount: "550.00",
            actualAmount: null,
            actualDate: null,
            status: "planned",
          },
        ]}
        readOnly={false}
        onEdit={() => {}}
      />,
    );

    await user.click(
      screen.getByRole("checkbox", { name: "Selecionar Aluguel" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Remover selecionados (1)" }),
    );
    await user.click(screen.getByRole("button", { name: "Confirmar remoção" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível remover a recorrência. Tente novamente.",
      ),
    );
  });

  it("uses the safe fallback when recording a recurring realization fails", async () => {
    const user = userEvent.setup();
    api.request.mockRejectedValue("offline");
    render(
      <FinancialEntriesTable
        entries={[]}
        occurrences={[
          {
            id: "rec-1:2026-10-10",
            recurrenceId: "rec-1",
            kind: "EXPENSE",
            description: "Aluguel",
            category: "Moradia",
            dueDate: "2026-10-10",
            expectedAmount: "550.00",
            actualAmount: null,
            actualDate: null,
            status: "planned",
          },
        ]}
        readOnly={false}
        onEdit={() => {}}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Ações para Aluguel em 10/10/2026",
      }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Registrar realizado" }),
    );
    await user.click(screen.getByRole("button", { name: "Salvar realização" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível registrar a realização.",
      ),
    );
  });

  it("records an avulso realization without changing its forecast", async () => {
    const user = userEvent.setup();
    api.request.mockResolvedValue({});
    const plannedEntry = { ...entry, actualAmount: null, actualDate: null };
    render(
      <FinancialEntriesTable
        entries={[plannedEntry]}
        occurrences={[]}
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
        occurrences={[]}
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
      <FinancialEntriesTable
        entries={[entry]}
        occurrences={[
          {
            id: "rec-income",
            recurrenceId: "rec-income",
            kind: "INCOME",
            description: "Salário",
            category: "Salário",
            dueDate: "2026-10-12",
            expectedAmount: "3000.00",
            actualAmount: null,
            actualDate: null,
            status: "planned",
          },
        ]}
        readOnly
        onEdit={() => {}}
      />,
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

  it("deletes or ends a recurrence from its row action and keeps history copy clear", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    api.request.mockResolvedValue({ action: "ended" });
    render(
      <FinancialEntriesTable
        entries={[]}
        occurrences={[
          {
            id: "rec-1:2026-10-10",
            recurrenceId: "rec-1",
            kind: "EXPENSE",
            description: "Aluguel",
            category: "Moradia",
            dueDate: "2026-10-10",
            expectedAmount: "550.00",
            actualAmount: "550.00",
            actualDate: "2026-10-10",
            status: "realized",
          },
        ]}
        readOnly={false}
        onEdit={() => {}}
        onSaved={onSaved}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Ações para Aluguel em 10/10/2026",
      }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Excluir recorrência" }),
    );
    expect(
      screen.getByText(/histórico realizado, ela será encerrada/),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Excluir recorrência" }),
    );

    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        "/api/financial-recurrences?id=rec-1",
        { method: "DELETE" },
        "Não foi possível encerrar a recorrência.",
      ),
    );
    expect(toast.success).toHaveBeenCalledWith(
      "Recorrência encerrada. O histórico foi mantido.",
    );
    expect(onSaved).toHaveBeenCalledOnce();
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
            recurrenceId: "rec-2",
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
            recurrenceId: "rec-3",
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
    expect(screen.getByRole("columnheader", { name: "Origem" })).toBeTruthy();
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
            recurrenceId: "rec-income",
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

  it("selects every row in the month and removes the matching entries and recurring models", async () => {
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
            recurrenceId: "rec-1",
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
    expect(recurringCheckbox.disabled).toBe(false);
    await user.click(
      screen.getByRole("checkbox", {
        name: "Selecionar todos os registros do mês",
      }),
    );
    expect(
      screen
        .getByRole("checkbox", { name: "Selecionar Aluguel" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    await user.click(
      screen.getByRole("checkbox", {
        name: "Desmarcar todos os registros do mês",
      }),
    );
    expect(
      screen
        .getByRole("checkbox", { name: "Selecionar Aluguel" })
        .getAttribute("aria-checked"),
    ).toBe("false");
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
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Selecionar Internet",
        }) as HTMLButtonElement
      ).getAttribute("aria-checked"),
    ).toBe("true");
    expect(recurringCheckbox.getAttribute("aria-checked")).toBe("true");
    await user.click(
      screen.getByRole("button", { name: "Remover selecionados (3)" }),
    );
    expect(
      screen.getByRole("alertdialog", {
        name: "Remover 3 registros selecionados?",
      }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Confirmar remoção" }));
    await waitFor(() => expect(api.request).toHaveBeenCalledTimes(3));
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
    expect(api.request).toHaveBeenNthCalledWith(
      3,
      "/api/financial-recurrences?id=rec-1",
      { method: "DELETE" },
      "Não foi possível remover a recorrência.",
    );
    expect(onSaved).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledWith(
      "3 ações concluídas. O histórico realizado das recorrências foi mantido.",
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
        occurrences={[]}
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
        occurrences={[]}
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
        occurrences={[]}
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

  it("shows direct recurrence deletion when no realized history exists", async () => {
    const user = userEvent.setup();
    api.request.mockResolvedValue({ action: "deleted" });
    render(
      <FinancialEntriesTable
        entries={[]}
        occurrences={[
          {
            id: "rec-1:2026-10-10",
            recurrenceId: "rec-1",
            kind: "EXPENSE",
            description: "Aluguel",
            category: "Moradia",
            dueDate: "2026-10-10",
            expectedAmount: "550.00",
            actualAmount: null,
            actualDate: null,
            status: "planned",
          },
        ]}
        readOnly={false}
        onEdit={() => {}}
      />,
    );
    await user.click(
      screen.getByRole("button", {
        name: "Ações para Aluguel em 10/10/2026",
      }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Excluir recorrência" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Excluir recorrência" }),
    );

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Recorrência excluída."),
    );
  });

  it.each([
    [null, "Recorrência excluída."],
    [{ action: "deleted" }, "Recorrência excluída."],
    [{ action: "ended" }, "Recorrência encerrada. O histórico foi mantido."],
  ])(
    "shows the recurrence removal result when deleting a selected occurrence",
    async (result, message) => {
      const user = userEvent.setup();
      api.request.mockResolvedValue(result);
      render(
        <FinancialEntriesTable
          entries={[]}
          occurrences={[
            {
              id: "rec-1:2026-10-10",
              recurrenceId: "rec-1",
              kind: "EXPENSE",
              description: "Aluguel",
              category: "Moradia",
              dueDate: "2026-10-10",
              expectedAmount: "550.00",
              actualAmount: null,
              actualDate: null,
              status: "planned",
            },
          ]}
          readOnly={false}
          onEdit={() => {}}
        />,
      );
      await user.click(
        screen.getByRole("checkbox", { name: "Selecionar Aluguel" }),
      );
      await user.click(
        screen.getByRole("button", { name: "Remover selecionados (1)" }),
      );
      await user.click(
        screen.getByRole("button", { name: "Confirmar remoção" }),
      );

      await waitFor(() => expect(toast.success).toHaveBeenCalledWith(message));
    },
  );

  it("selects and deselects individual rows and reports multiple deletion failures", async () => {
    const user = userEvent.setup();
    api.request
      .mockRejectedValueOnce("offline")
      .mockRejectedValueOnce(new Error("Falha segura."));
    render(
      <FinancialEntriesTable
        entries={[entry, { ...entry, id: "entry-2", description: "Internet" }]}
        occurrences={[]}
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
        occurrences={[]}
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
