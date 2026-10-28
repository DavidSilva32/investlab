// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ request: vi.fn() }));
const supportView = vi.hoisted(() => ({ active: false }));
vi.mock("@/lib/api-client", () => ({ apiRequest: api.request }));
vi.mock("@/components/app-shell", () => ({
  useAdminSupportView: () => supportView.active,
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

import { DashboardFinancesCard } from "@/app/(private)/_components/dashboard-finances-card";

function renderCard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DashboardFinancesCard />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  supportView.active = false;
});

describe("DashboardFinancesCard", () => {
  it("loads a compact summary independently and links to Finanças", async () => {
    api.request.mockResolvedValue({
      summary: {
        expectedIncome: null,
        realizedIncome: "3400.00",
        expectedExpenses: null,
        realizedExpenses: "1200.00",
        recordedBalance: "-2200.00",
        completeness: "recorded_only",
      },
    });
    renderCard();

    expect(await screen.findByText(/Entradas/)).toBeTruthy();
    expect(
      screen.getByText("Saldo registrado").parentElement?.textContent,
    ).toContain("2.200,00");
    expect(screen.getByText(/2\.200,00/).className).toContain(
      "text-status-danger",
    );
    expect(
      screen.getByRole("link", { name: "Abrir Finanças" }).getAttribute("href"),
    ).toBe("/financas");
    expect(api.request).toHaveBeenCalledWith(
      expect.stringMatching(/^\/api\/finance-overview\?month=\d{4}-\d{2}$/),
      undefined,
      "Não foi possível carregar o resumo financeiro.",
    );
  });

  it("shows an inline retry when the independent overview request fails", async () => {
    const user = userEvent.setup();
    api.request.mockRejectedValueOnce(new Error("Resumo indisponível"));
    api.request.mockResolvedValueOnce({
      summary: {
        expectedIncome: null,
        realizedIncome: "900.00",
        expectedExpenses: null,
        realizedExpenses: null,
        recordedBalance: null,
        completeness: "recorded_only",
      },
    });
    renderCard();

    expect(await screen.findByText("Resumo indisponível")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Tentar novamente/ }));
    await waitFor(() => expect(api.request).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/Entradas/)).toBeTruthy();
  });

  it("explains a new financial profile and support-mode read-only access", async () => {
    supportView.active = true;
    api.request.mockResolvedValue({
      summary: {
        expectedIncome: null,
        realizedIncome: null,
        expectedExpenses: null,
        realizedExpenses: null,
        recordedBalance: null,
        completeness: "no_data",
      },
    });
    renderCard();

    expect(await screen.findByText("Comece por aqui")).toBeTruthy();
    expect(
      screen.queryByText("Registre entradas e saídas para acompanhar o mês."),
    ).toBeNull();
    expect(
      screen.getByText("Visualização de suporte: somente leitura."),
    ).toBeTruthy();
    expect(screen.queryByText("R$ 0,00")).toBeNull();
  });

  it("keeps missing realized values unavailable for an existing profile", async () => {
    api.request.mockRejectedValueOnce("network failure");
    api.request.mockResolvedValueOnce({
      summary: {
        expectedIncome: "3000.00",
        realizedIncome: null,
        expectedExpenses: "1200.00",
        realizedExpenses: null,
        recordedBalance: null,
        completeness: "recorded_only",
      },
    });
    const user = userEvent.setup();
    renderCard();

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível carregar o resumo financeiro.",
    );
    await user.click(screen.getByRole("button", { name: /Tentar novamente/ }));
    expect(await screen.findAllByText("Sem registro")).toHaveLength(3);
  });
});
