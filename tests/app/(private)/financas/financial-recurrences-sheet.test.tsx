// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ request: vi.fn() }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiRequest: api.request }));
vi.mock("sonner", () => ({ toast }));
import { FinancialRecurrencesSheet } from "@/app/(private)/financas/_components/financial-recurrences-sheet";
import { queryKeys } from "@/lib/query-keys";

const activeRecurrence = {
  id: "rent-id",
  kind: "EXPENSE" as const,
  description: "Aluguel",
  categoryId: null,
  amount: "550.00",
  frequency: "MONTHLY",
  firstDueDate: "2026-10-10",
  essential: true,
  active: true,
};
const endedRecurrence = { ...activeRecurrence, id: "ended-id", active: false };

function renderSheet({
  recurrences = [activeRecurrence],
  loading = false,
  error = null,
  readOnly = false,
  retry = vi.fn(),
  onSaved = vi.fn(),
}: {
  recurrences?: (typeof activeRecurrence)[];
  loading?: boolean;
  error?: string | null;
  readOnly?: boolean;
  retry?: () => void;
  onSaved?: () => void;
} = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={client}>
      <FinancialRecurrencesSheet
        open
        onOpenChange={() => {}}
        month="2026-10"
        data={{ recurrences }}
        loading={loading}
        error={error}
        retry={retry}
        categories={[]}
        onSaved={onSaved}
        readOnly={readOnly}
      />
    </QueryClientProvider>,
  );
  return { ...result, client, onSaved, retry };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FinancialRecurrencesSheet", () => {
  it("keeps the manager compact and provides access to ended templates", () => {
    renderSheet({ recurrences: [activeRecurrence, endedRecurrence] });
    expect(screen.getByText("Gerenciar recorrências")).toBeTruthy();
    const rentEntries = screen.getAllByText("Aluguel");
    expect(rentEntries).toHaveLength(2);
    expect(rentEntries[0].parentElement?.parentElement?.textContent).toContain(
      "Mensal · Essencial",
    );
    expect(screen.getByText(/Encerrada/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Novo" })).toBeNull();
    expect(screen.queryByText(/Ocorrências de/)).toBeNull();
    expect(screen.getByRole("button", { name: "Editar Aluguel" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Reativar Aluguel" }),
    ).toBeTruthy();
  });

  it("shows loading, retryable error, and empty states", async () => {
    const retry = vi.fn();
    const { rerender, client } = renderSheet({ loading: true });
    expect(screen.getByRole("status").textContent).toContain("Carregando");

    rerender(
      <QueryClientProvider client={client}>
        <FinancialRecurrencesSheet
          open
          onOpenChange={() => {}}
          month="2026-10"
          data={{ recurrences: [] }}
          loading={false}
          error="Falha ao carregar."
          retry={retry}
          categories={[]}
          onSaved={() => {}}
          readOnly={false}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Falha ao carregar.",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tentar novamente" }),
    );
    expect(retry).toHaveBeenCalledOnce();

    rerender(
      <QueryClientProvider client={client}>
        <FinancialRecurrencesSheet
          open
          onOpenChange={() => {}}
          month="2026-10"
          data={{ recurrences: [] }}
          loading={false}
          error={null}
          retry={() => {}}
          categories={[]}
          onSaved={() => {}}
          readOnly={false}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByText(/Nenhuma recorrência cadastrada/)).toBeTruthy();
  });

  it("edits an existing template using the established recurrence form", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    api.request.mockResolvedValue({});
    renderSheet({ onSaved });
    await user.click(screen.getByRole("button", { name: "Editar Aluguel" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Editar recorrência",
    });
    expect(dialog).toBeTruthy();
    expect(screen.getByLabelText("Descrição")).toHaveProperty(
      "value",
      "Aluguel",
    );
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() => expect(api.request).toHaveBeenCalledOnce());
    expect(api.request.mock.calls[0][0]).toBe("/api/financial-recurrences");
    expect(JSON.parse(api.request.mock.calls[0][1].body)).toMatchObject({
      id: "rent-id",
      description: "Aluguel",
      amount: 550,
    });
    expect(onSaved).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledWith("Recorrência atualizada.");
  });

  it("closes the edit form and cancels a pending recurrence removal", async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.click(screen.getByRole("button", { name: "Editar Aluguel" }));
    await screen.findByRole("dialog", { name: "Editar recorrência" });
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Editar recorrência" }),
      ).toBeNull(),
    );

    await user.click(screen.getByRole("button", { name: "Excluir Aluguel" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("confirms removal and preserves realized history when ending a template", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    api.request.mockResolvedValue({ action: "ended" });
    renderSheet({ onSaved });
    await user.click(screen.getByRole("button", { name: "Excluir Aluguel" }));
    expect(
      screen.getByRole("alertdialog", { name: "Excluir recorrência?" }),
    ).toBeTruthy();
    expect(
      screen.getByText(/histórico realizado, ele será encerrado/),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Excluir recorrência" }),
    );
    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        "/api/financial-recurrences?id=rent-id",
        { method: "DELETE" },
        "Não foi possível remover a recorrência.",
      ),
    );
    expect(toast.success).toHaveBeenCalledWith(
      "Recorrência encerrada. O histórico foi mantido.",
    );
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("reports a failed removal without closing the manager or losing the template", async () => {
    const user = userEvent.setup();
    api.request.mockRejectedValue(new Error("Ação indisponível."));
    renderSheet();
    await user.click(screen.getByRole("button", { name: "Excluir Aluguel" }));
    await user.click(
      screen.getByRole("button", { name: "Excluir recorrência" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Ação indisponível."),
    );
    expect(screen.getByText("Aluguel")).toBeTruthy();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });

  it("reactivates an ended template and refreshes recurrence data", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    api.request.mockResolvedValue({});
    const { client } = renderSheet({ recurrences: [endedRecurrence], onSaved });
    client.setQueryData(queryKeys.finances.recurrences("2026-10"), {});
    await user.click(screen.getByRole("button", { name: "Reativar Aluguel" }));
    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        "/api/financial-recurrences",
        {
          method: "PATCH",
          body: JSON.stringify({ ...endedRecurrence, active: true }),
        },
        "Não foi possível reativar a recorrência.",
      ),
    );
    expect(toast.success).toHaveBeenCalledWith("Recorrência reativada.");
    expect(onSaved).toHaveBeenCalledOnce();
    expect(client.getQueryCache().getAll()).toHaveLength(1);
  });

  it("hides edit and removal controls in read-only mode", () => {
    renderSheet({ readOnly: true });
    expect(screen.queryByRole("button", { name: "Editar Aluguel" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Excluir Aluguel" }),
    ).toBeNull();
  });
});
