// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ request: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiRequest: api.request }));
vi.mock("sonner", () => ({ toast }));
import { FinancialEntryDialog } from "@/app/(private)/financas/_components/financial-entry-dialog";

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

  it("filters categories by movement and saves an actual-only income", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const onOpenChange = vi.fn();
    api.request.mockResolvedValue({});
    render(
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
      "5000",
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
    render(
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
      "550",
    );
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

  it("requires amount/date pairs and reports update or deletion failures", async () => {
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
    render(
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
      screen
        .getByRole("button", { name: "Salvar lançamento" })
        .hasAttribute("disabled"),
    ).toBe(true);
    await user.type(screen.getByLabelText("Data prevista"), "10/10/2026");
    await user.click(screen.getByRole("button", { name: "Salvar lançamento" }));
    expect(toast.error).toHaveBeenCalledWith("Falha segura.");
    expect(api.request).toHaveBeenLastCalledWith(
      "/api/financial-entries",
      expect.objectContaining({ method: "PATCH" }),
      "Não foi possível salvar o lançamento.",
    );

    api.request.mockRejectedValueOnce("offline");
    await user.click(screen.getByRole("button", { name: "Excluir" }));
    expect(toast.error).toHaveBeenLastCalledWith(
      "Não foi possível excluir o lançamento.",
    );
    expect(api.request).toHaveBeenLastCalledWith(
      "/api/financial-entries?id=entry-id",
      { method: "DELETE" },
      "Não foi possível excluir o lançamento.",
    );

    await user.click(screen.getByRole("button", { name: "Excluir" }));
    expect(toast.error).toHaveBeenLastCalledWith("Falha segura.");
  });

  it("closes on cancel and confirms deletion for an encoded entry ID", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const onOpenChange = vi.fn();
    api.request.mockResolvedValue({});
    render(
      <FinancialEntryDialog
        open
        onOpenChange={onOpenChange}
        categories={categories}
        entry={{
          id: "entry / 1",
          kind: "EXPENSE",
          description: "Conta",
          categoryId: categories[0].id,
          categoryName: "Moradia",
          expectedAmount: "100.00",
          expectedDate: "2026-10-10",
          actualAmount: null,
          actualDate: null,
        }}
        onSaved={onSaved}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await user.click(screen.getByRole("button", { name: "Excluir" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(api.request).toHaveBeenLastCalledWith(
      "/api/financial-entries?id=entry%20%2F%201",
      { method: "DELETE" },
      "Não foi possível excluir o lançamento.",
    );
    expect(toast.success).toHaveBeenCalledWith("Lançamento excluído.");
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("reports both incomplete date pairs and a safe fallback for save errors", async () => {
    const user = userEvent.setup();
    api.request.mockRejectedValue("offline");
    render(
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
      "120",
    );
    await user.click(screen.getByRole("button", { name: "Salvar lançamento" }));

    expect(toast.error).toHaveBeenCalledWith(
      "Não foi possível salvar o lançamento.",
    );
  });
});
