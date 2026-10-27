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

    await user.click(screen.getByRole("button", { name: "Excluir" }));
    expect(toast.error).toHaveBeenLastCalledWith("Falha segura.");
    expect(api.request).toHaveBeenLastCalledWith(
      "/api/financial-entries?id=entry-id",
      { method: "DELETE" },
      "Não foi possível excluir o lançamento.",
    );
  });
});
