// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { QueryClientWrapper } from "../../../utils/query-client-wrapper";
import type { ReactNode } from "react";

const api = vi.hoisted(() => ({ request: vi.fn(), withResponse: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/api-client", () => ({
  apiRequest: api.request,
  apiRequestWithResponse: api.withResponse,
}));
vi.mock("sonner", () => ({ toast }));
import { FinancialEntryDialog } from "@/app/(private)/financas/_components/financial-entry-dialog";

const renderDialog = (ui: ReactNode) =>
  render(<QueryClientWrapper>{ui}</QueryClientWrapper>);

function StatefulEntryDialog() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir lançamento
      </button>
      <FinancialEntryDialog
        open={open}
        onOpenChange={setOpen}
        categories={categories}
        entry={null}
        onSaved={() => {}}
      />
    </>
  );
}

const categories = [
  {
    id: "24e0fa40-0563-4e4e-a52e-64fab0e6f79f",
    kind: "EXPENSE" as const,
    name: "Moradia",
    active: true,
  },
  {
    id: "e9f0fa40-0563-4e4e-a52e-64fab0e6f79f",
    kind: "INCOME" as const,
    name: "Salário",
    active: true,
  },
  {
    id: "a9f0fa40-0563-4e4e-a52e-64fab0e6f79f",
    kind: "INCOME" as const,
    name: "Oculta",
    active: false,
  },
];

afterEach(() => {
  cleanup();
  api.request.mockReset();
  api.withResponse.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
});

describe("FinancialEntryDialog", () => {
  it("presents paired expected and actual amount/date fields with a selected category", () => {
    renderDialog(
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
      (
        screen.getByLabelText("Valor (R$)", {
          selector: "#expected-amount",
        }) as HTMLInputElement
      ).type,
    ).toBe("text");
    expect(
      screen.getByText(
        "Este lançamento será salvo agora. A próxima ocorrência seguirá a data e a periodicidade escolhidas abaixo.",
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Salvar lançamento" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("filters categories by movement and saves an actual-only income", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const onOpenChange = vi.fn();
    api.request.mockResolvedValue({});
    renderDialog(
      <FinancialEntryDialog
        open
        onOpenChange={onOpenChange}
        categories={categories}
        entry={null}
        onSaved={onSaved}
      />,
    );

    await user.click(
      screen.getByRole("combobox", { name: "Tipo de lançamento" }),
    );
    await user.click(await screen.findByRole("option", { name: "Entrada" }));
    await user.click(screen.getByRole("combobox", { name: "Categoria" }));
    expect(await screen.findByRole("option", { name: "Salário" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Moradia" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Oculta" })).toBeNull();
    await user.click(screen.getByRole("option", { name: "Salário" }));
    await user.type(screen.getByLabelText("Descrição"), "Salário mensal");
    await user.type(
      screen.getByLabelText("Valor (R$)", { selector: "#actual-amount" }),
      "500000",
    );
    await user.type(screen.getByLabelText("Data realizada"), "05/10/2026");
    await user.click(screen.getByRole("button", { name: "Salvar lançamento" }));

    await waitFor(() => expect(api.request).toHaveBeenCalledOnce());
    expect(api.request).toHaveBeenCalledWith(
      "/api/financial-entries",
      expect.objectContaining({ method: "POST" }),
      "Não foi possível salvar o lançamento.",
    );
    const [, options] = api.request.mock.calls[0];
    expect(JSON.parse(options.body as string)).toMatchObject({
      kind: "INCOME",
      description: "Salário mensal",
      categoryId: "e9f0fa40-0563-4e4e-a52e-64fab0e6f79f",
      expectedAmount: null,
      expectedDate: null,
      actualAmount: 5000,
      actualDate: "2026-10-05",
    });
    expect(onSaved).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("saves an expected-only expense with its due date", async () => {
    const user = userEvent.setup();
    api.request.mockResolvedValue({});
    renderDialog(
      <FinancialEntryDialog
        open
        onOpenChange={() => {}}
        categories={categories}
        entry={null}
        onSaved={() => {}}
      />,
    );

    await user.type(screen.getByLabelText("Descrição"), "Aluguel");
    await user.click(screen.getByRole("combobox", { name: "Categoria" }));
    await user.click(await screen.findByRole("option", { name: "Moradia" }));
    await user.type(
      screen.getByLabelText("Valor (R$)", { selector: "#expected-amount" }),
      "55000",
    );
    expect(
      (
        screen.getByLabelText("Valor (R$)", {
          selector: "#expected-amount",
        }) as HTMLInputElement
      ).value,
    ).toBe("R$ 550,00");
    await user.type(screen.getByLabelText("Data prevista"), "05/10/2026");
    await user.click(screen.getByRole("button", { name: "Salvar lançamento" }));

    const [, options] = api.request.mock.calls[0];
    expect(JSON.parse(options.body as string)).toMatchObject({
      description: "Aluguel",
      expectedAmount: 550,
      expectedDate: "2026-10-05",
      actualAmount: null,
      actualDate: null,
    });
  });

  it("formats and parses decimal monetary amounts", async () => {
    const user = userEvent.setup();
    api.request.mockResolvedValue({});
    renderDialog(
      <FinancialEntryDialog
        open
        onOpenChange={() => {}}
        categories={categories}
        entry={null}
        onSaved={() => {}}
      />,
    );

    await user.type(screen.getByLabelText("Descrição"), "Conta de luz");
    await user.click(screen.getByRole("combobox", { name: "Categoria" }));
    await user.click(await screen.findByRole("option", { name: "Moradia" }));
    const amountInput = screen.getByLabelText("Valor (R$)", {
      selector: "#expected-amount",
    }) as HTMLInputElement;
    await user.type(amountInput, "12345");
    expect(amountInput.value).toBe("R$ 123,45");
    await user.type(screen.getByLabelText("Data prevista"), "05/10/2026");
    await user.click(screen.getByRole("button", { name: "Salvar lançamento" }));

    await waitFor(() => expect(api.request).toHaveBeenCalledOnce());
    const [, options] = api.request.mock.calls[0];
    expect(JSON.parse(options.body as string).expectedAmount).toBe(123.45);
  });

  it("requires amount/date pairs and reports update failures", async () => {
    const user = userEvent.setup();
    const entry = {
      id: "entry-id",
      kind: "EXPENSE" as const,
      description: "Aluguel",
      categoryId: categories[0].id,
      categoryName: "Moradia",
      expectedAmount: "550.00",
      expectedDate: null,
      actualAmount: null,
      actualDate: null,
    };
    api.request.mockRejectedValue(new Error("Falha segura."));
    renderDialog(
      <FinancialEntryDialog
        open
        onOpenChange={() => {}}
        categories={categories}
        entry={entry}
        onSaved={() => {}}
      />,
    );

    expect(
      screen.getByText("Informe a data prevista para este valor."),
    ).toBeTruthy();
    expect(
      (
        screen.getByLabelText("Valor (R$)", {
          selector: "#expected-amount",
        }) as HTMLInputElement
      ).value,
    ).toBe("R$ 550,00");
    expect(
      screen
        .getByRole("button", { name: "Salvar lançamento" })
        .hasAttribute("disabled"),
    ).toBe(true);
    await user.type(screen.getByLabelText("Data prevista"), "10/10/2026");
    await user.click(screen.getByRole("button", { name: "Salvar lançamento" }));
    const [, options] = api.request.mock.calls[0];
    expect(JSON.parse(options.body as string).expectedAmount).toBe(550);
    expect(toast.error).toHaveBeenCalledWith("Falha segura.");
    expect(api.request).toHaveBeenLastCalledWith(
      "/api/financial-entries",
      expect.objectContaining({ method: "PATCH" }),
      "Não foi possível salvar o lançamento.",
    );
  });

  it("reports both incomplete date pairs and a safe fallback for save errors", async () => {
    const user = userEvent.setup();
    api.request.mockRejectedValue("offline");
    renderDialog(
      <FinancialEntryDialog
        open
        onOpenChange={() => {}}
        categories={categories}
        entry={null}
        onSaved={() => {}}
      />,
    );

    await user.type(screen.getByLabelText("Data prevista"), "10/10/2026");
    expect(
      screen.getByText("Informe o valor previsto para esta data."),
    ).toBeTruthy();
    await user.clear(screen.getByLabelText("Data prevista"));
    await user.type(screen.getByLabelText("Data realizada"), "11/10/2026");
    expect(
      screen.getByText("Informe o valor realizado para esta data."),
    ).toBeTruthy();

    await user.type(screen.getByLabelText("Descrição"), "Conta de luz");
    await user.click(screen.getByRole("combobox", { name: "Categoria" }));
    await user.click(await screen.findByRole("option", { name: "Moradia" }));
    await user.type(
      screen.getByLabelText("Valor (R$)", { selector: "#actual-amount" }),
      "12000",
    );
    await user.click(screen.getByRole("button", { name: "Salvar lançamento" }));

    expect(toast.error).toHaveBeenCalledWith(
      "Não foi possível salvar o lançamento.",
    );
  });

  it("creates and selects a category from the launch form", async () => {
    const user = userEvent.setup();
    api.withResponse.mockResolvedValue({
      data: {
        id: "cat-new",
        kind: "EXPENSE",
        name: "Saúde",
        active: true,
      },
    });
    api.request.mockResolvedValue({});
    renderDialog(
      <FinancialEntryDialog
        open
        onOpenChange={() => {}}
        categories={categories}
        entry={null}
        onSaved={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Criar categoria/ }));
    await user.type(screen.getByLabelText("Nome"), "Saúde");
    await user.click(screen.getByRole("button", { name: "Criar categoria" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Nova categoria de saída" }),
      ).toBeNull(),
    );
    await user.click(screen.getByRole("combobox", { name: "Categoria" }));
    await user.click(await screen.findByRole("option", { name: "Saúde" }));
    await user.type(screen.getByLabelText("Descrição"), "Consulta médica");
    await user.type(
      screen.getByLabelText("Valor (R$)", { selector: "#expected-amount" }),
      "18000",
    );
    await user.type(screen.getByLabelText("Data prevista"), "05/10/2026");
    await user.click(screen.getByRole("button", { name: "Salvar lançamento" }));
    await waitFor(() => expect(api.request).toHaveBeenCalledOnce());
    const [, entryOptions] = api.request.mock.calls[0];
    expect(JSON.parse(entryOptions.body as string).categoryId).toBe("cat-new");
  });

  it("explains essential expenses and resets the flag when recurrence is disabled or changed to income", async () => {
    const user = userEvent.setup();
    renderDialog(
      <FinancialEntryDialog
        open
        onOpenChange={() => {}}
        categories={categories}
        entry={null}
        onSaved={() => {}}
      />,
    );

    expect(
      screen.queryByRole("checkbox", {
        name: "Marcar recorrência como despesa essencial",
      }),
    ).toBeNull();
    const createRecurrence = screen.getByRole("checkbox", {
      name: "Criar recorrência para este lançamento",
    });
    await user.click(createRecurrence);

    const essential = screen.getByRole("checkbox", {
      name: "Marcar recorrência como despesa essencial",
    });
    expect(essential.getAttribute("aria-checked")).toBe("false");
    const help = screen.getByRole("button", {
      name: "Ajuda sobre despesa essencial",
    });
    await user.hover(help);
    expect((await screen.findByRole("tooltip")).textContent).toContain(
      "Marque gastos necessários para manter suas necessidades básicas. Eles compõem a base mensal da sua reserva de emergência.",
    );

    await user.click(essential);
    expect(essential.getAttribute("aria-checked")).toBe("true");
    await user.click(createRecurrence);
    expect(
      screen.queryByRole("checkbox", {
        name: "Marcar recorrência como despesa essencial",
      }),
    ).toBeNull();
    await user.click(createRecurrence);
    expect(
      screen
        .getByRole("checkbox", {
          name: "Marcar recorrência como despesa essencial",
        })
        .getAttribute("aria-checked"),
    ).toBe("false");

    await user.click(
      screen.getByRole("combobox", { name: "Tipo de lançamento" }),
    );
    await user.click(await screen.findByRole("option", { name: "Entrada" }));
    expect(
      screen.queryByRole("checkbox", {
        name: "Marcar recorrência como despesa essencial",
      }),
    ).toBeNull();
    await user.click(
      screen.getByRole("combobox", { name: "Tipo de lançamento" }),
    );
    await user.click(await screen.findByRole("option", { name: "Saída" }));
    expect(
      screen
        .getByRole("checkbox", {
          name: "Marcar recorrência como despesa essencial",
        })
        .getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("creates a recurrence after the current launch and warns about normalized duplicates", async () => {
    const user = userEvent.setup();
    api.request.mockResolvedValue({});
    renderDialog(
      <FinancialEntryDialog
        open
        onOpenChange={() => {}}
        categories={categories}
        entry={null}
        onSaved={() => {}}
        recurrences={[
          {
            id: "rec-1",
            kind: "EXPENSE",
            description: "ALUGUEL",
            categoryId: categories[0].id,
            amount: "550.00",
            frequency: "MONTHLY",
            firstDueDate: "2026-11-01",
            essential: true,
            active: true,
          },
        ]}
      />,
    );
    await user.type(screen.getByLabelText("Descrição"), "Aluguel");
    await user.click(screen.getByRole("combobox", { name: "Categoria" }));
    await user.click(await screen.findByRole("option", { name: "Moradia" }));
    await user.type(
      screen.getByLabelText("Valor (R$)", { selector: "#expected-amount" }),
      "55000",
    );
    await user.type(screen.getByLabelText("Data prevista"), "01/10/2026");
    await user.click(
      screen.getByRole("checkbox", {
        name: "Criar recorrência para este lançamento",
      }),
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: "Marcar recorrência como despesa essencial",
      }),
    );
    expect(
      screen.getByText(/Já existe uma recorrência ativa parecida/),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Salvar lançamento" }));
    await waitFor(() => expect(api.request).toHaveBeenCalledTimes(2));
    const [, recurrenceOptions] = api.request.mock.calls[1];
    expect(JSON.parse(recurrenceOptions.body as string)).toMatchObject({
      kind: "EXPENSE",
      description: "Aluguel",
      categoryId: categories[0].id,
      amount: 550,
      frequency: "MONTHLY",
      firstDueDate: expect.stringMatching(/^2026-11-01$/),
      essential: true,
    });
  });

  it("reports when the launch succeeds but recurrence creation fails", async () => {
    const user = userEvent.setup();
    api.request
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(
        new Error("Não foi possível criar a recorrência."),
      );
    renderDialog(
      <FinancialEntryDialog
        open
        onOpenChange={() => {}}
        categories={categories}
        entry={null}
        onSaved={() => {}}
      />,
    );
    await user.type(screen.getByLabelText("Descrição"), "Conta de luz");
    await user.click(screen.getByRole("combobox", { name: "Categoria" }));
    await user.click(await screen.findByRole("option", { name: "Moradia" }));
    await user.type(
      screen.getByLabelText("Valor (R$)", { selector: "#expected-amount" }),
      "20000",
    );
    await user.type(screen.getByLabelText("Data prevista"), "01/10/2026");
    await user.click(
      screen.getByRole("checkbox", {
        name: "Criar recorrência para este lançamento",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Salvar lançamento" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining(
          "O lançamento foi salvo, mas a recorrência não foi criada",
        ),
      ),
    );
  });

  it("resets recurrence selection and suggested date when closing and reopening a launch", async () => {
    const user = userEvent.setup();
    renderDialog(<StatefulEntryDialog />);
    const recurrenceCheckbox = screen.getByRole("checkbox", {
      name: "Criar recorrência para este lançamento",
    });

    await user.click(recurrenceCheckbox);
    expect(recurrenceCheckbox.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByLabelText("Próxima ocorrência")).toBeTruthy();
    const essentialCheckbox = screen.getByRole("checkbox", {
      name: "Marcar recorrência como despesa essencial",
    });
    await user.click(essentialCheckbox);
    expect(essentialCheckbox.getAttribute("aria-checked")).toBe("true");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await user.click(screen.getByRole("button", { name: "Abrir lançamento" }));

    const reopenedCheckbox = screen.getByRole("checkbox", {
      name: "Criar recorrência para este lançamento",
    });
    expect(reopenedCheckbox.getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByLabelText("Próxima ocorrência")).toBeNull();
    expect(
      screen.queryByRole("checkbox", {
        name: "Marcar recorrência como despesa essencial",
      }),
    ).toBeNull();
    await user.click(reopenedCheckbox);
    expect(
      screen
        .getByRole("checkbox", {
          name: "Marcar recorrência como despesa essencial",
        })
        .getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("updates the suggested recurrence date when launch dates change but preserves a manual override", async () => {
    const user = userEvent.setup();
    api.request.mockResolvedValue({});
    renderDialog(
      <FinancialEntryDialog
        open
        onOpenChange={() => {}}
        categories={categories}
        entry={null}
        onSaved={() => {}}
      />,
    );

    await user.click(
      screen.getByRole("checkbox", {
        name: "Criar recorrência para este lançamento",
      }),
    );
    await user.type(screen.getByLabelText("Descrição"), "Aluguel");
    await user.click(screen.getByRole("combobox", { name: "Categoria" }));
    await user.click(await screen.findByRole("option", { name: "Moradia" }));
    await user.type(
      screen.getByLabelText("Valor (R$)", { selector: "#expected-amount" }),
      "55000",
    );
    await user.type(screen.getByLabelText("Data prevista"), "10/10/2026");

    const nextOccurrence = screen.getByLabelText(
      "Próxima ocorrência",
    ) as HTMLInputElement;
    expect(nextOccurrence.value).toBe("10/11/2026");
    await user.click(
      screen.getByRole("combobox", {
        name: "Periodicidade da recorrência",
      }),
    );
    await user.click(await screen.findByRole("option", { name: "Trimestral" }));
    expect(nextOccurrence.value).toBe("10/01/2027");

    await user.clear(nextOccurrence);
    await user.type(nextOccurrence, "15/12/2026");
    const expectedDate = screen.getByLabelText(
      "Data prevista",
    ) as HTMLInputElement;
    await user.clear(expectedDate);
    await user.type(expectedDate, "11/11/2026");
    expect(nextOccurrence.value).toBe("15/12/2026");

    await user.click(screen.getByRole("button", { name: "Salvar lançamento" }));
    await waitFor(() => expect(api.request).toHaveBeenCalledTimes(2));
    const [, recurrenceOptions] = api.request.mock.calls[1];
    expect(JSON.parse(recurrenceOptions.body as string).firstDueDate).toBe(
      "2026-12-15",
    );
  });
});
