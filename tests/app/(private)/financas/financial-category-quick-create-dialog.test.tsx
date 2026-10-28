// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClientWrapper } from "../../../utils/query-client-wrapper";
import type { ReactNode } from "react";

const api = vi.hoisted(() => ({ request: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiRequestWithResponse: api.request }));
vi.mock("sonner", () => ({ toast }));
import { FinancialCategoryQuickCreateDialog } from "@/app/(private)/financas/_components/financial-category-quick-create-dialog";

const renderWithQuery = (ui: ReactNode) =>
  render(<QueryClientWrapper>{ui}</QueryClientWrapper>);

afterEach(() => {
  cleanup();
  api.request.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
});

describe("FinancialCategoryQuickCreateDialog", () => {
  it.each([
    ["INCOME", "Nova categoria de entrada"],
    ["EXPENSE", "Nova categoria de saída"],
  ] as const)("uses the %s category kind", (kind, title) => {
    renderWithQuery(
      <FinancialCategoryQuickCreateDialog
        open
        kind={kind}
        onOpenChange={() => {}}
        onCreated={() => {}}
      />,
    );

    expect(screen.getByRole("dialog", { name: title })).toBeTruthy();
  });

  it("creates and returns the new category to the launch form", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    const category = {
      id: "category-id",
      kind: "INCOME",
      name: "Benefícios",
      active: true,
      message: "Categoria cadastrada com sucesso.",
    };
    api.request.mockResolvedValue({ data: category });
    renderWithQuery(
      <FinancialCategoryQuickCreateDialog
        open
        kind="INCOME"
        onOpenChange={onOpenChange}
        onCreated={onCreated}
      />,
    );

    await user.type(screen.getByLabelText("Nome"), "  Benefícios  ");
    await user.click(screen.getByRole("button", { name: "Criar categoria" }));

    expect(api.request).toHaveBeenCalledWith(
      "/api/financial-categories",
      {
        method: "POST",
        body: JSON.stringify({ kind: "INCOME", name: "Benefícios" }),
      },
      "Não foi possível cadastrar a categoria.",
    );
    expect(onCreated).toHaveBeenCalledWith(category);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(toast.success).toHaveBeenCalledWith(
      "Categoria cadastrada com sucesso.",
    );
  });

  it("shows a safe fallback message when category creation fails", async () => {
    const user = userEvent.setup();
    api.request.mockRejectedValue("offline");
    renderWithQuery(
      <FinancialCategoryQuickCreateDialog
        open
        kind="EXPENSE"
        onOpenChange={() => {}}
        onCreated={() => {}}
      />,
    );

    await user.type(screen.getByLabelText("Nome"), "Saúde");
    await user.click(screen.getByRole("button", { name: "Criar categoria" }));

    expect(toast.error).toHaveBeenCalledWith(
      "Não foi possível cadastrar a categoria.",
    );
  });

  it("preserves a server error message and closes on cancel", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    api.request.mockRejectedValue(new Error("Categoria duplicada."));
    renderWithQuery(
      <FinancialCategoryQuickCreateDialog
        open
        kind="EXPENSE"
        onOpenChange={onOpenChange}
        onCreated={() => {}}
      />,
    );

    await user.type(screen.getByLabelText("Nome"), "Saúde");
    await user.click(screen.getByRole("button", { name: "Criar categoria" }));
    expect(toast.error).toHaveBeenCalledWith("Categoria duplicada.");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
