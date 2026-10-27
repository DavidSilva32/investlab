// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ request: vi.fn(), response: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/api-client", () => ({
  apiRequest: api.request,
  apiRequestWithResponse: api.response,
}));
vi.mock("sonner", () => ({ toast }));

import { FinancialCategoryManager } from "@/app/(private)/financas/_components/financial-category-manager";

const categories = [
  {
    id: "default-expense",
    kind: "EXPENSE",
    name: "Moradia",
    originalName: "Moradia",
    isDefault: true,
    active: true,
  },
  {
    id: "custom-expense",
    kind: "EXPENSE",
    name: "Pets",
    originalName: "Pets",
    isDefault: false,
    active: true,
  },
  {
    id: "default-income",
    kind: "INCOME",
    name: "Salário",
    originalName: "Salário",
    isDefault: true,
    active: true,
  },
];

function renderManager() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <FinancialCategoryManager open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.request.mockResolvedValue({ categories });
  api.response.mockResolvedValue({
    data: { message: "Categoria salva." },
    response: {},
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FinancialCategoryManager", () => {
  it("keeps category kinds separate and creates a user-owned category", async () => {
    const user = userEvent.setup();
    renderManager();
    expect(await screen.findByText("Moradia")).toBeTruthy();
    expect(
      screen.getByRole("list", { name: "Categorias de saída" }),
    ).toBeTruthy();

    await user.type(screen.getByLabelText("Nova categoria"), "Saúde");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(api.response).toHaveBeenCalledWith(
      "/api/financial-categories",
      {
        method: "POST",
        body: JSON.stringify({ kind: "EXPENSE", name: "Saúde" }),
      },
      "Não foi possível cadastrar a categoria.",
    );
    await user.click(
      screen.getByRole("combobox", { name: "Tipo de categoria" }),
    );
    await user.click(await screen.findByRole("option", { name: "Entradas" }));
    expect(await screen.findByText("Salário")).toBeTruthy();
    expect(screen.queryByText("Moradia")).toBeNull();
  });

  it("renames and hides default categories through user-scoped preference updates", async () => {
    const user = userEvent.setup();
    renderManager();
    await screen.findByText("Moradia");

    await user.click(screen.getByRole("button", { name: "Renomear Moradia" }));
    await user.clear(screen.getByLabelText("Nome da categoria"));
    await user.type(screen.getByLabelText("Nome da categoria"), "Casa");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(api.response).toHaveBeenCalledWith(
        "/api/financial-categories",
        {
          method: "PATCH",
          body: JSON.stringify({ id: "default-expense", name: "Casa" }),
        },
        "Não foi possível atualizar a categoria.",
      ),
    );

    await user.click(screen.getByRole("button", { name: "Ocultar Moradia" }));
    await waitFor(() =>
      expect(api.response).toHaveBeenCalledWith(
        "/api/financial-categories",
        {
          method: "PATCH",
          body: JSON.stringify({ id: "default-expense", active: false }),
        },
        "Não foi possível atualizar a categoria.",
      ),
    );
  });

  it("renames and hides a custom category", async () => {
    const user = userEvent.setup();
    renderManager();
    await screen.findByText("Pets");

    await user.click(screen.getByRole("button", { name: "Renomear Pets" }));
    await user.clear(screen.getByLabelText("Nome da categoria"));
    await user.type(screen.getByLabelText("Nome da categoria"), "Veterinário");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(api.response).toHaveBeenCalledWith(
        "/api/financial-categories",
        {
          method: "PATCH",
          body: JSON.stringify({ id: "custom-expense", name: "Veterinário" }),
        },
        "Não foi possível atualizar a categoria.",
      ),
    );

    await user.click(screen.getByRole("button", { name: "Ocultar Pets" }));
    await waitFor(() =>
      expect(api.response).toHaveBeenCalledWith(
        "/api/financial-categories",
        {
          method: "PATCH",
          body: JSON.stringify({ id: "custom-expense", active: false }),
        },
        "Não foi possível atualizar a categoria.",
      ),
    );
  });

  it("shows a load failure and retries the category request", async () => {
    const user = userEvent.setup();
    api.request.mockRejectedValueOnce(new Error("Falha temporária."));
    api.request.mockResolvedValueOnce({ categories });
    renderManager();

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Falha temporária.",
    );
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(await screen.findByText("Moradia")).toBeTruthy();
    expect(api.request).toHaveBeenCalledTimes(2);
  });

  it("offers reactivation for hidden categories and lets the user cancel editing", async () => {
    const user = userEvent.setup();
    api.request.mockResolvedValue({
      categories: [{ ...categories[1], active: false }],
    });
    renderManager();
    await screen.findByText("Pets");

    await user.click(screen.getByRole("button", { name: "Renomear Pets" }));
    await user.type(screen.getByLabelText("Nome da categoria"), " nova");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByLabelText("Nome da categoria")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Reativar Pets" }));

    await waitFor(() =>
      expect(api.response).toHaveBeenCalledWith(
        "/api/financial-categories",
        {
          method: "PATCH",
          body: JSON.stringify({ id: "custom-expense", active: true }),
        },
        "Não foi possível atualizar a categoria.",
      ),
    );
    expect(toast.success).toHaveBeenCalledWith("Categoria salva.");
  });

  it("shows an empty state and reports category creation errors", async () => {
    const user = userEvent.setup();
    api.request.mockResolvedValue({ categories: [] });
    api.response.mockRejectedValue(new Error("Não foi possível salvar."));
    renderManager();
    expect(
      await screen.findByText("Nenhuma categoria para esse tipo."),
    ).toBeTruthy();

    await user.type(screen.getByLabelText("Nova categoria"), "Saúde");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(toast.error).toHaveBeenCalledWith("Não foi possível salvar.");
    expect(
      (screen.getByLabelText("Nova categoria") as HTMLInputElement).value,
    ).toBe("Saúde");
  });
});
