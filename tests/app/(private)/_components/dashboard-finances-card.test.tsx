// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiRequest: api.request }));
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
});

describe("DashboardFinancesCard", () => {
  it("loads a compact summary independently and links to Finanças", async () => {
    api.request.mockResolvedValue({
      summary: {
        expectedIncome: null,
        realizedIncome: "3400.00",
        expectedExpenses: null,
        realizedExpenses: "1200.00",
        recordedBalance: "2200.00",
        completeness: "recorded_only",
      },
    });
    renderCard();

    expect(await screen.findByText(/Entradas/)).toBeTruthy();
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
});
