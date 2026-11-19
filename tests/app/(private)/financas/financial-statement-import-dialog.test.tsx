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
vi.mock("@/lib/api-client", () => ({ apiRequest: api.request }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { FinancialStatementImportDialog } from "@/app/(private)/financas/_components/financial-statement-import-dialog";

const categories = [
  {
    id: "123e4567-e89b-42d3-a456-426614174000",
    kind: "EXPENSE" as const,
    name: "Alimentação",
    active: true,
  },
  {
    id: "223e4567-e89b-42d3-a456-426614174000",
    kind: "INCOME" as const,
    name: "Salário",
    active: true,
  },
  {
    id: "323e4567-e89b-42d3-a456-426614174000",
    kind: "EXPENSE" as const,
    name: "Investimentos",
    active: true,
  },
  {
    id: "423e4567-e89b-42d3-a456-426614174000",
    kind: "INCOME" as const,
    name: "Resgates de investimentos",
    active: true,
  },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const firstMatch = <Element extends HTMLElement>(matches: Element[]) =>
  matches[0];

function mappedPreview(description: string, hash: string) {
  return new Response(
    JSON.stringify({
      hash,
      headers: ["Data", "Descrição", "Valor"],
      mapping: {
        dateColumn: 0,
        descriptionColumn: 1,
        amountColumn: 2,
        dateFormat: "DMY",
        decimalSeparator: "COMMA",
      },
      rows: [
        {
          sourceRow: 2,
          kind: "EXPENSE",
          description,
          actualDate: "2026-11-14",
          amount: 10,
          errors: [],
          possibleDuplicate: false,
        },
      ],
    }),
    { status: 200 },
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  api.request.mockReset();
  toast.error.mockReset();
  toast.success.mockReset();
});

describe("FinancialStatementImportDialog", () => {
  it("shows review counts without cluttering rows with helper text", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          hash: "d".repeat(64),
          headers: ["Data", "Descrição", "Valor"],
          mapping: {
            dateColumn: 0,
            descriptionColumn: 1,
            amountColumn: 2,
            dateFormat: "DMY",
            decimalSeparator: "COMMA",
          },
          rows: [
            {
              sourceRow: 2,
              kind: "EXPENSE",
              description: "Aplicação CDB Porquinho",
              actualDate: "2026-11-14",
              amount: 2000,
              errors: [],
              categoryId: categories[2].id,
              categorySource: "suggested",
              possibleDuplicate: false,
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <FinancialStatementImportDialog
        open
        onOpenChange={() => {}}
        categories={categories}
        onImported={() => {}}
      />,
    );

    fireEvent.change(
      screen.getByLabelText("Selecionar extrato CSV, XLS ou XLSX"),
      {
        target: {
          files: [new File(["synthetic"], "extrato.csv", { type: "text/csv" })],
        },
      },
    );
    await screen.findAllByLabelText("Descrição da linha 2");
    expect(screen.getByRole("dialog").textContent).toContain(
      "1 classificada automaticamente · 0 pendentes",
    );
    expect(screen.queryByText("Alterar colunas")).toBeNull();
    expect(screen.queryByText("Sugestão automática — confira")).toBeNull();
    expect(screen.queryByText(/Descrições iguais/)).toBeNull();
    expect(
      screen.queryByText(/O arquivo é processado para criar a prévia/),
    ).toBeNull();
    expect(
      screen.queryByText(/contar as mesmas despesas duas vezes/),
    ).toBeNull();
  });

  it("shows the card double-count warning only when purchases and a bill payment appear", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          hash: "e".repeat(64),
          headers: ["Data", "Descrição", "Valor"],
          mapping: {
            dateColumn: 0,
            descriptionColumn: 1,
            amountColumn: 2,
            dateFormat: "DMY",
            decimalSeparator: "COMMA",
          },
          rows: [
            {
              sourceRow: 2,
              kind: "EXPENSE",
              description: "Compra no crédito: mercado",
              actualDate: "2026-11-14",
              amount: 10,
              errors: [],
              categoryId: categories[0].id,
              possibleDuplicate: false,
            },
            {
              sourceRow: 3,
              kind: "EXPENSE",
              description: "Pagamento fatura cartão",
              actualDate: "2026-11-14",
              amount: 10,
              errors: [],
              categoryId: categories[0].id,
              possibleDuplicate: false,
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <FinancialStatementImportDialog
        open
        onOpenChange={() => {}}
        categories={categories}
        onImported={() => {}}
      />,
    );

    fireEvent.change(
      screen.getByLabelText("Selecionar extrato CSV, XLS ou XLSX"),
      {
        target: {
          files: [new File(["synthetic"], "extrato.csv", { type: "text/csv" })],
        },
      },
    );

    expect(
      await screen.findByText(
        "O arquivo contém compras no cartão e pagamento de fatura. Revise para não contar as mesmas despesas duas vezes.",
      ),
    ).toBeTruthy();
  });

  it("maps an Inter-like statement, reviews categories, and confirms only after review", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          hash: "a".repeat(64),
          headers: ["Data Lançamento", "Descrição", "Valor", "Saldo"],
          mapping: {
            dateColumn: 0,
            descriptionColumn: 1,
            amountColumn: 2,
            dateFormat: "DMY",
            decimalSeparator: "COMMA",
          },
          rows: [
            {
              sourceRow: 7,
              kind: "EXPENSE",
              description: "Mercado",
              actualDate: "2026-11-14",
              amount: 10.5,
              errors: [],
              possibleDuplicate: false,
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    api.request.mockResolvedValue({
      importedCount: 1,
      alreadyImportedCount: 0,
      possibleDuplicateCount: 0,
    });
    render(
      <FinancialStatementImportDialog
        open
        onOpenChange={() => {}}
        categories={categories}
        onImported={() => {}}
      />,
    );

    const file = new File(["synthetic statement"], "extrato.csv", {
      type: "text/csv",
    });
    fireEvent.change(
      screen.getByLabelText("Selecionar extrato CSV, XLS ou XLSX"),
      { target: { files: [file] } },
    );
    await screen.findAllByRole("textbox", { name: "Descrição da linha 7" });
    expect(firstMatch(screen.getAllByDisplayValue("Mercado"))).toBeTruthy();
    expect(firstMatch(screen.getAllByDisplayValue("14/11/2026"))).toBeTruthy();
    expect(api.request).not.toHaveBeenCalled();
    fireEvent.change(firstMatch(screen.getAllByLabelText("Data da linha 7")), {
      target: { value: "15112026" },
    });
    expect(firstMatch(screen.getAllByDisplayValue("15/11/2026"))).toBeTruthy();

    await user.click(
      firstMatch(
        screen.getAllByRole("combobox", { name: "Categoria da linha 7" }),
      ),
    );
    await user.click(
      await screen.findByRole("option", { name: "Alimentação" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirmar importação" }),
    );

    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        "/api/financial-statement-import/confirm",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const confirmation = JSON.parse(api.request.mock.calls[0][1].body) as {
      rows: Array<{ actualDate: string }>;
    };
    expect(confirmation.rows[0]?.actualDate).toBe("2026-11-15");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("requires explicit acknowledgement before importing possible duplicates", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          hash: "b".repeat(64),
          headers: [],
          mapping: {
            dateColumn: 0,
            descriptionColumn: 1,
            amountColumn: 2,
            dateFormat: "DMY",
            decimalSeparator: "COMMA",
          },
          rows: [
            {
              sourceRow: 2,
              kind: "EXPENSE",
              description: "Compra",
              actualDate: "2026-11-14",
              amount: 10,
              errors: [],
              possibleDuplicate: true,
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <FinancialStatementImportDialog
        open
        onOpenChange={() => {}}
        categories={categories}
        onImported={() => {}}
      />,
    );
    const file = new File(["synthetic statement"], "extrato.xlsx");
    fireEvent.change(
      screen.getByLabelText("Selecionar extrato CSV, XLS ou XLSX"),
      { target: { files: [file] } },
    );
    await screen.findAllByText("Possível duplicidade");
    await user.click(
      firstMatch(
        screen.getAllByRole("combobox", { name: "Categoria da linha 2" }),
      ),
    );
    await user.click(
      await screen.findByRole("option", { name: "Alimentação" }),
    );
    expect(
      screen
        .getByRole("button", { name: "Confirmar importação" })
        .hasAttribute("disabled"),
    ).toBe(true);
    await user.click(
      screen.getByRole("checkbox", { name: /Revisei 1 possível/i }),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirmar importação" }),
    );
    expect(api.request).toHaveBeenCalledWith(
      "/api/financial-statement-import/confirm",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("does not submit included rows that still need a category", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mappedPreview("Mercado", "n".repeat(64))),
    );
    render(
      <FinancialStatementImportDialog
        open
        onOpenChange={() => {}}
        categories={categories}
        onImported={() => {}}
      />,
    );
    fireEvent.change(
      screen.getByLabelText("Selecionar extrato CSV, XLS ou XLSX"),
      {
        target: {
          files: [new File(["statement"], "extrato.csv", { type: "text/csv" })],
        },
      },
    );
    await screen.findAllByLabelText("Descrição da linha 2");
    const submit = screen.getByRole("button", {
      name: "Confirmar importação",
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    submit.removeAttribute("disabled");
    fireEvent.click(submit);

    expect(api.request).not.toHaveBeenCalled();
    expect(
      screen.getAllByText("Escolha uma categoria.").length,
    ).toBeGreaterThan(0);
  });

  it("keeps the narrow-screen review usable without horizontal table scrolling", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mappedPreview("Mercado", "d".repeat(64))),
    );
    render(
      <FinancialStatementImportDialog
        open
        onOpenChange={() => {}}
        categories={categories}
        onImported={() => {}}
      />,
    );

    fireEvent.change(
      screen.getByLabelText("Selecionar extrato CSV, XLS ou XLSX"),
      {
        target: {
          files: [new File(["statement"], "extrato.csv", { type: "text/csv" })],
        },
      },
    );

    const mobileRow = await screen.findByRole("article");
    expect(within(mobileRow).getByLabelText("Importar linha 2")).toBeTruthy();
    expect(
      within(mobileRow).getByLabelText("Descrição da linha 2"),
    ).toBeTruthy();
    expect(within(mobileRow).getByLabelText("Data da linha 2")).toBeTruthy();
    expect(within(mobileRow).getByLabelText("Valor da linha 2")).toBeTruthy();
    await user.click(
      within(mobileRow).getByRole("combobox", {
        name: "Categoria da linha 2",
      }),
    );
    await user.click(
      await screen.findByRole("option", { name: "Alimentação" }),
    );
    expect(
      within(mobileRow).getByRole("combobox", {
        name: "Categoria da linha 2",
      }).textContent,
    ).toContain("Alimentação");

    fireEvent.change(within(mobileRow).getByLabelText("Data da linha 2"), {
      target: { value: "3" },
    });
    expect(
      (within(mobileRow).getByLabelText("Data da linha 2") as HTMLInputElement)
        .value,
    ).toBe("3");
    await user.click(
      within(mobileRow).getByRole("combobox", { name: "Tipo da linha 2" }),
    );
    await user.click(await screen.findByRole("option", { name: "Entrada" }));
    expect(
      within(mobileRow).getByRole("combobox", {
        name: "Categoria da linha 2",
      }).textContent,
    ).toContain("Selecione");
    const mobileDescription = within(mobileRow).getByLabelText(
      "Descrição da linha 2",
    );
    fireEvent.change(mobileDescription, { target: { value: "" } });
    fireEvent.change(mobileDescription, {
      target: { value: "Renda mensal" },
    });
    fireEvent.change(within(mobileRow).getByLabelText("Valor da linha 2"), {
      target: { value: "abc" },
    });
    expect(
      (within(mobileRow).getByLabelText("Valor da linha 2") as HTMLInputElement)
        .value,
    ).toBe("");
    fireEvent.change(within(mobileRow).getByLabelText("Valor da linha 2"), {
      target: { value: "12,50" },
    });
    expect(
      (within(mobileRow).getByLabelText("Valor da linha 2") as HTMLInputElement)
        .value,
    ).toBe("12.5");
    await user.click(within(mobileRow).getByLabelText("Importar linha 2"));
    expect(
      (
        within(mobileRow).getByLabelText("Importar linha 2") as HTMLElement
      ).getAttribute("data-state"),
    ).toBe("unchecked");

    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("overflow-x-hidden");
    expect(dialog.className).toContain("w-[calc(100vw-2rem)]");
  });

  it("refreshes duplicate status after confirmation is rejected", async () => {
    const user = userEvent.setup();
    const initial = new Response(
      JSON.stringify({
        ...(await mappedPreview("Mercado", "h".repeat(64)).json()),
        rows: [
          {
            sourceRow: 2,
            kind: "EXPENSE",
            description: "Mercado",
            actualDate: "2026-11-14",
            amount: 10,
            errors: [],
            possibleDuplicate: false,
          },
          {
            sourceRow: 3,
            kind: "EXPENSE",
            description: "Mercado",
            actualDate: "2026-11-15",
            amount: 11,
            errors: [],
            possibleDuplicate: false,
          },
        ],
      }),
      { status: 200 },
    );
    const refreshed = new Response(
      JSON.stringify({
        hash: "h".repeat(64),
        rows: [
          {
            sourceRow: 2,
            kind: "EXPENSE",
            description: "Mercado",
            actualDate: "2026-11-14",
            amount: 10,
            errors: [],
            possibleDuplicate: true,
            alreadyImported: true,
          },
        ],
      }),
      { status: 200 },
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(refreshed),
    );
    api.request.mockRejectedValueOnce(
      new Error("Há possíveis duplicidades. Confira as linhas."),
    );
    render(
      <FinancialStatementImportDialog
        open
        onOpenChange={() => {}}
        categories={categories}
        onImported={() => {}}
      />,
    );
    fireEvent.change(
      screen.getByLabelText("Selecionar extrato CSV, XLS ou XLSX"),
      {
        target: {
          files: [new File(["statement"], "extrato.csv", { type: "text/csv" })],
        },
      },
    );
    await screen.findAllByLabelText("Descrição da linha 2");
    await user.click(
      firstMatch(
        screen.getAllByRole("combobox", { name: "Categoria da linha 2" }),
      ),
    );
    await user.click(
      await screen.findByRole("option", { name: "Alimentação" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirmar importação" }),
    );

    expect(toast.error).toHaveBeenCalledWith(
      "Há possíveis duplicidades. Confira as linhas.",
    );
    expect(await screen.findAllByText("Possível duplicidade")).toHaveLength(1);
    expect(
      screen.getAllByText(
        "Este arquivo já foi importado; a linha será ignorada.",
      ),
    ).toHaveLength(2);
    expect(
      screen.getByRole("checkbox", { name: /Revisei 1 possível/i }),
    ).toBeTruthy();
  });

  it("sends an invalid ISO date as unavailable instead of normalizing it", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            hash: "k".repeat(64),
            rows: [
              {
                sourceRow: 2,
                kind: "EXPENSE",
                description: "Mercado",
                actualDate: "2026-02-30",
                amount: 10,
                errors: [],
                possibleDuplicate: false,
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    api.request.mockResolvedValueOnce({});
    render(
      <FinancialStatementImportDialog
        open
        onOpenChange={() => {}}
        categories={categories}
        onImported={() => {}}
      />,
    );
    fireEvent.change(
      screen.getByLabelText("Selecionar extrato CSV, XLS ou XLSX"),
      {
        target: {
          files: [new File(["statement"], "extrato.csv", { type: "text/csv" })],
        },
      },
    );
    await screen.findAllByLabelText("Descrição da linha 2");
    expect(
      firstMatch(screen.getAllByLabelText("Data da linha 2")),
    ).toHaveProperty("value", "30/02/2026");
    await user.click(
      firstMatch(
        screen.getAllByRole("combobox", { name: "Categoria da linha 2" }),
      ),
    );
    await user.click(
      await screen.findByRole("option", { name: "Alimentação" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirmar importação" }),
    );

    await waitFor(() => expect(api.request).toHaveBeenCalledOnce());
    expect(
      JSON.parse(api.request.mock.calls[0]?.[1]?.body as string).rows[0],
    ).toMatchObject({ actualDate: null });
  });

  it("ignores a failed confirmation when its request becomes stale", async () => {
    const user = userEvent.setup();
    const pending = deferred<{ message?: string }>();
    const onOpenChange = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mappedPreview("Mercado", "l".repeat(64))),
    );
    api.request.mockImplementationOnce(() => pending.promise);
    render(
      <FinancialStatementImportDialog
        open
        onOpenChange={onOpenChange}
        categories={categories}
        onImported={() => {}}
      />,
    );
    fireEvent.change(
      screen.getByLabelText("Selecionar extrato CSV, XLS ou XLSX"),
      {
        target: {
          files: [new File(["statement"], "extrato.csv", { type: "text/csv" })],
        },
      },
    );
    await screen.findAllByLabelText("Descrição da linha 2");
    await user.click(
      firstMatch(
        screen.getAllByRole("combobox", { name: "Categoria da linha 2" }),
      ),
    );
    await user.click(
      await screen.findByRole("option", { name: "Alimentação" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirmar importação" }),
    );
    await user.keyboard("{Escape}");
    pending.reject(new Error("Falha após o fechamento"));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("keeps the review intact when duplicate refresh completes after closing", async () => {
    const user = userEvent.setup();
    const pendingRefresh = deferred<Response>();
    const onOpenChange = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(mappedPreview("Mercado", "m".repeat(64)))
        .mockImplementationOnce(() => pendingRefresh.promise),
    );
    api.request.mockRejectedValueOnce(
      new Error("Há possíveis duplicidades. Confira as linhas."),
    );
    render(
      <FinancialStatementImportDialog
        open
        onOpenChange={onOpenChange}
        categories={categories}
        onImported={() => {}}
      />,
    );
    fireEvent.change(
      screen.getByLabelText("Selecionar extrato CSV, XLS ou XLSX"),
      {
        target: {
          files: [new File(["statement"], "extrato.csv", { type: "text/csv" })],
        },
      },
    );
    await screen.findAllByLabelText("Descrição da linha 2");
    await user.click(
      firstMatch(
        screen.getAllByRole("combobox", { name: "Categoria da linha 2" }),
      ),
    );
    await user.click(
      await screen.findByRole("option", { name: "Alimentação" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirmar importação" }),
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalledOnce());
    await user.keyboard("{Escape}");
    pendingRefresh.resolve(
      new Response(JSON.stringify({ hash: "m".repeat(64), rows: [] }), {
        status: 200,
      }),
    );

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByDisplayValue("Mercado")).toBeNull();
  });

  it("validates and corrects row dates, amounts, type, and descriptions", async () => {
    const user = userEvent.setup();
    const row = {
      sourceRow: 2,
      kind: null,
      description: "Pagamento",
      actualDate: null,
      amount: 10,
      errors: [
        "Confira a data informada.",
        "Informe a descrição.",
        "A descrição deve ter até 120 caracteres.",
        "Informe débito ou crédito.",
        "Confira os valores de débito e crédito.",
        "Confira o valor informado.",
        "O valor precisa ser maior que zero.",
        "Esta linha requer revisão manual.",
      ],
      possibleDuplicate: false,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            hash: "g".repeat(64),
            headers: ["Data", "Descrição", "Valor"],
            mapping: {
              dateColumn: 0,
              descriptionColumn: 1,
              amountColumn: 2,
              dateFormat: "DMY",
              decimalSeparator: "COMMA",
            },
            rows: [row],
          }),
          { status: 200 },
        ),
      ),
    );
    render(
      <FinancialStatementImportDialog
        open
        onOpenChange={() => {}}
        categories={categories}
        onImported={() => {}}
      />,
    );
    fireEvent.change(
      screen.getByLabelText("Selecionar extrato CSV, XLS ou XLSX"),
      {
        target: {
          files: [new File(["statement"], "extrato.csv", { type: "text/csv" })],
        },
      },
    );
    await screen.findAllByLabelText("Descrição da linha 2");
    const date = firstMatch(screen.getAllByLabelText("Data da linha 2"));
    expect((date as HTMLInputElement).value).toBe("");
    fireEvent.change(date, { target: { value: "14112026" } });
    fireEvent.change(date, { target: { value: "" } });
    expect(screen.getAllByText("Confira a data informada.").length).toBe(2);

    fireEvent.change(date, { target: { value: "3" } });
    expect((date as HTMLInputElement).value).toBe("3");
    expect(screen.getAllByText("Confira a data informada.").length).toBe(2);
    fireEvent.change(date, { target: { value: "3102" } });
    expect((date as HTMLInputElement).value).toBe("31/02");
    fireEvent.change(date, { target: { value: "31022026" } });
    expect((date as HTMLInputElement).value).toBe("31/02/2026");
    expect(screen.getAllByText("Confira a data informada.").length).toBe(2);
    fireEvent.change(date, { target: { value: "15112026" } });
    expect((date as HTMLInputElement).value).toBe("15/11/2026");
    expect(screen.queryAllByText("Confira a data informada.")).toHaveLength(0);

    await user.click(
      firstMatch(screen.getAllByRole("combobox", { name: "Tipo da linha 2" })),
    );
    await user.click(await screen.findByRole("option", { name: "Entrada" }));
    expect(
      firstMatch(
        screen.getAllByRole("combobox", { name: "Categoria da linha 2" }),
      ).textContent,
    ).toContain("Selecione");
    await user.click(
      firstMatch(
        screen.getAllByRole("combobox", { name: "Categoria da linha 2" }),
      ),
    );
    await user.click(await screen.findByRole("option", { name: "Salário" }));
    const description = firstMatch(
      screen.getAllByLabelText("Descrição da linha 2"),
    );
    fireEvent.change(description, { target: { value: "" } });
    expect(screen.getAllByText("Informe a descrição.").length).toBeGreaterThan(
      0,
    );
    fireEvent.change(description, { target: { value: "Salário da empresa" } });
    expect(
      firstMatch(
        screen.getAllByRole("combobox", { name: "Categoria da linha 2" }),
      ).textContent,
    ).toContain("Selecione");
    await user.click(
      firstMatch(
        screen.getAllByRole("combobox", { name: "Categoria da linha 2" }),
      ),
    );
    await user.click(await screen.findByRole("option", { name: "Salário" }));

    const amount = firstMatch(screen.getAllByLabelText("Valor da linha 2"));
    fireEvent.change(amount, { target: { value: "" } });
    expect((amount as HTMLInputElement).value).toBe("");
    fireEvent.change(amount, { target: { value: "abc" } });
    expect((amount as HTMLInputElement).value).toBe("");
    expect(screen.getAllByText("Confira o valor informado.").length).toBe(2);
    fireEvent.change(amount, { target: { value: "12,50" } });
    expect((amount as HTMLInputElement).value).toBe("12.5");
    expect(screen.queryAllByText("Confira o valor informado.")).toHaveLength(0);
    expect(
      screen.getAllByText("Esta linha requer revisão manual."),
    ).toHaveLength(2);
  });

  it("reports unreadable previews and clears the selected file when cancelled", async () => {
    const onOpenChange = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue("offline"));
    const { rerender } = render(
      <FinancialStatementImportDialog
        open
        onOpenChange={onOpenChange}
        categories={categories}
        onImported={() => {}}
      />,
    );
    fireEvent.change(
      screen.getByLabelText("Selecionar extrato CSV, XLS ou XLSX"),
      {
        target: {
          files: [new File(["statement"], "extrato.csv", { type: "text/csv" })],
        },
      },
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível ler o extrato.",
      ),
    );
    expect(screen.getByText("extrato.csv")).toBeTruthy();

    fireEvent.change(
      screen.getByLabelText("Selecionar extrato CSV, XLS ou XLSX"),
      { target: { files: [] } },
    );
    expect(
      screen.getByText(
        "Escolha um arquivo CSV, XLS ou XLSX (até 5 MB e 500 linhas).",
      ),
    ).toBeTruthy();

    await userEvent.setup().keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Cancelar" }));
    rerender(
      <FinancialStatementImportDialog
        open={false}
        onOpenChange={onOpenChange}
        categories={categories}
        onImported={() => {}}
      />,
    );
    expect(screen.queryByText("extrato.csv")).toBeNull();
  });

  it("uses safe errors for malformed preview responses and non-Error confirmation failures", async () => {
    const user = userEvent.setup();
    const badResponse = {
      ok: false,
      json: vi.fn().mockRejectedValue(new Error("invalid json")),
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(badResponse));
    render(
      <FinancialStatementImportDialog
        open
        onOpenChange={() => {}}
        categories={categories}
        onImported={() => {}}
      />,
    );
    fireEvent.change(
      screen.getByLabelText("Selecionar extrato CSV, XLS ou XLSX"),
      {
        target: {
          files: [new File(["statement"], "erro.csv", { type: "text/csv" })],
        },
      },
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível ler o extrato.",
      ),
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mappedPreview("Mercado", "i".repeat(64))),
    );
    fireEvent.change(
      screen.getByLabelText("Selecionar extrato CSV, XLS ou XLSX"),
      {
        target: {
          files: [new File(["statement"], "valido.csv", { type: "text/csv" })],
        },
      },
    );
    await screen.findAllByLabelText("Descrição da linha 2");
    await user.click(
      firstMatch(
        screen.getAllByRole("combobox", { name: "Categoria da linha 2" }),
      ),
    );
    await user.click(
      await screen.findByRole("option", { name: "Alimentação" }),
    );
    api.request.mockRejectedValueOnce("offline");
    await user.click(
      screen.getByRole("button", { name: "Confirmar importação" }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível concluir a importação.",
      ),
    );
  });

  it("ignores a confirmation response that arrives after the dialog closes", async () => {
    const user = userEvent.setup();
    const pending = deferred<{ message?: string }>();
    const onImported = vi.fn();
    const onOpenChange = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mappedPreview("Mercado", "j".repeat(64))),
    );
    api.request.mockImplementationOnce(() => pending.promise);
    render(
      <FinancialStatementImportDialog
        open
        onOpenChange={onOpenChange}
        categories={categories}
        onImported={onImported}
      />,
    );
    fireEvent.change(
      screen.getByLabelText("Selecionar extrato CSV, XLS ou XLSX"),
      {
        target: {
          files: [new File(["statement"], "extrato.csv", { type: "text/csv" })],
        },
      },
    );
    await screen.findAllByLabelText("Descrição da linha 2");
    await user.click(
      firstMatch(
        screen.getAllByRole("combobox", { name: "Categoria da linha 2" }),
      ),
    );
    await user.click(
      await screen.findByRole("option", { name: "Alimentação" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirmar importação" }),
    );
    await user.keyboard("{Escape}");

    expect(onOpenChange).toHaveBeenCalledWith(false);
    pending.resolve({ message: "Importação concluída." });
    await waitFor(() => expect(onImported).not.toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("applies a category to exact same-description rows and can opt out of remembering", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          hash: "c".repeat(64),
          headers: ["Data", "Descrição", "Valor"],
          mapping: {
            dateColumn: 0,
            descriptionColumn: 1,
            amountColumn: 2,
            dateFormat: "DMY",
            decimalSeparator: "COMMA",
          },
          rows: [
            {
              sourceRow: 2,
              kind: "EXPENSE",
              description: "Mercado do Bairro",
              actualDate: "2026-11-14",
              amount: 10,
              errors: [],
              categoryId: categories[0].id,
              categorySource: "saved",
            },
            {
              sourceRow: 3,
              kind: "EXPENSE",
              description: " mercado   do bairro ",
              actualDate: "2026-11-14",
              amount: 20,
              errors: [],
            },
            {
              sourceRow: 4,
              kind: "INCOME",
              description: "Mercado do Bairro",
              actualDate: "2026-11-14",
              amount: 30,
              errors: [],
            },
            {
              sourceRow: 5,
              kind: "EXPENSE",
              description: "Padaria da Esquina",
              actualDate: "2026-11-14",
              amount: 12,
              errors: [],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    api.request.mockResolvedValue({
      importedCount: 3,
      alreadyImportedCount: 0,
      possibleDuplicateCount: 0,
    });
    render(
      <FinancialStatementImportDialog
        open
        onOpenChange={() => {}}
        categories={categories}
        onImported={() => {}}
      />,
    );
    fireEvent.change(
      screen.getByLabelText("Selecionar extrato CSV, XLS ou XLSX"),
      {
        target: {
          files: [new File(["synthetic"], "extrato.csv", { type: "text/csv" })],
        },
      },
    );
    await screen.findAllByRole("combobox", { name: "Categoria da linha 2" });
    expect(screen.getByRole("dialog").textContent).toContain(
      "1 classificada automaticamente · 3 pendentes",
    );

    await user.click(
      firstMatch(
        screen.getAllByRole("combobox", { name: "Categoria da linha 3" }),
      ),
    );
    await user.click(
      await screen.findByRole("option", { name: "Alimentação" }),
    );
    expect(
      firstMatch(
        screen.getAllByRole("combobox", { name: "Categoria da linha 2" }),
      ).textContent,
    ).toContain("Alimentação");
    expect(
      firstMatch(
        screen.getAllByRole("combobox", { name: "Categoria da linha 3" }),
      ).textContent,
    ).toContain("Alimentação");
    expect(
      firstMatch(
        screen.getAllByRole("combobox", { name: "Categoria da linha 4" }),
      ).textContent,
    ).toContain("Selecione");

    await user.click(
      firstMatch(
        screen.getAllByRole("combobox", { name: "Categoria da linha 4" }),
      ),
    );
    await user.click(await screen.findByRole("option", { name: "Salário" }));
    expect(
      firstMatch(
        screen.getAllByRole("combobox", { name: "Categoria da linha 5" }),
      ).textContent,
    ).toContain("Selecione");
    await user.click(
      firstMatch(screen.getAllByRole("checkbox", { name: "Importar linha 5" })),
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: /Lembrar minhas categorias para próximos extratos/,
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirmar importação" }),
    );
    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        "/api/financial-statement-import/confirm",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"rememberCategories":false'),
        }),
      ),
    );
    const confirmation = JSON.parse(api.request.mock.calls[0][1].body) as {
      rows: Array<{ sourceRow: number; kind: string; categoryId: string }>;
    };
    expect(confirmation.rows).toEqual([
      expect.objectContaining({
        sourceRow: 2,
        kind: "EXPENSE",
        categoryId: categories[0].id,
      }),
      expect.objectContaining({
        sourceRow: 3,
        kind: "EXPENSE",
        categoryId: categories[0].id,
      }),
      expect.objectContaining({
        sourceRow: 4,
        kind: "INCOME",
        categoryId: categories[1].id,
      }),
    ]);
  });

  it("ignores an older preview after the user switches files", async () => {
    const firstResponse = deferred<Response>();
    const secondResponse = deferred<Response>();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => firstResponse.promise)
      .mockImplementationOnce(() => secondResponse.promise);
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(
      <FinancialStatementImportDialog
        open
        onOpenChange={() => {}}
        categories={categories}
        onImported={() => {}}
      />,
    );
    const input = screen.getByLabelText("Selecionar extrato CSV, XLS ou XLSX");
    fireEvent.change(input, {
      target: { files: [new File(["a"], "a.csv", { type: "text/csv" })] },
    });
    fireEvent.change(input, {
      target: { files: [new File(["b"], "b.csv", { type: "text/csv" })] },
    });

    secondResponse.resolve(mappedPreview("Arquivo B", "b".repeat(64)));
    await screen.findAllByDisplayValue("Arquivo B");
    firstResponse.resolve(mappedPreview("Arquivo A", "a".repeat(64)));
    await waitFor(() =>
      expect(screen.queryByDisplayValue("Arquivo A")).toBeNull(),
    );
    expect(firstMatch(screen.getAllByDisplayValue("Arquivo B"))).toBeTruthy();
    rerender(
      <FinancialStatementImportDialog
        open
        onOpenChange={() => {}}
        categories={categories}
        onImported={() => {}}
      />,
    );
  });

  it("ignores a preview that resolves after the dialog closes and reopens", async () => {
    const pendingResponse = deferred<Response>();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => pendingResponse.promise);
    vi.stubGlobal("fetch", fetchMock);
    const props = {
      onOpenChange: () => {},
      categories,
      onImported: () => {},
    };
    const { rerender } = render(
      <FinancialStatementImportDialog open {...props} />,
    );
    fireEvent.change(
      screen.getByLabelText("Selecionar extrato CSV, XLS ou XLSX"),
      {
        target: { files: [new File(["a"], "a.csv", { type: "text/csv" })] },
      },
    );
    rerender(<FinancialStatementImportDialog open={false} {...props} />);
    rerender(<FinancialStatementImportDialog open {...props} />);
    pendingResponse.resolve(mappedPreview("Prévia antiga", "a".repeat(64)));

    await waitFor(() =>
      expect(screen.queryByDisplayValue("Prévia antiga")).toBeNull(),
    );
    expect(
      screen.queryByRole("textbox", { name: "Descrição da linha 2" }),
    ).toBeNull();
  });

  it("ignores a failed preview after the user switches to another file", async () => {
    const firstRequest = deferred<Response>();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => firstRequest.promise)
      .mockResolvedValueOnce(mappedPreview("Extrato atual", "z".repeat(64)));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <FinancialStatementImportDialog
        open
        onOpenChange={() => {}}
        categories={categories}
        onImported={() => {}}
      />,
    );
    const input = screen.getByLabelText("Selecionar extrato CSV, XLS ou XLSX");
    fireEvent.change(input, {
      target: { files: [new File(["a"], "a.csv", { type: "text/csv" })] },
    });
    fireEvent.change(input, {
      target: { files: [new File(["b"], "b.csv", { type: "text/csv" })] },
    });

    await screen.findAllByDisplayValue("Extrato atual");
    firstRequest.reject(new Error("A prévia antiga falhou."));
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(toast.error).not.toHaveBeenCalled();
    expect(
      firstMatch(screen.getAllByDisplayValue("Extrato atual")),
    ).toBeTruthy();
  });
});
