// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ request: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiRequest: api.request }));
vi.mock("sonner", () => ({ toast }));

import { FinancialMonthClose } from "@/app/(private)/financas/_components/financial-month-close";

const closed = {
  status: "closed" as const,
  closedAt: "2026-10-31T12:00:00.000Z",
  totals: {
    expectedIncome: "17600.00",
    realizedIncome: "17600.00",
    expectedExpenses: "4349.93",
    realizedExpenses: "4369.57",
    expectedBalance: "13250.07",
    recordedBalance: "13230.43",
  },
  history: [],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("FinancialMonthClose", () => {
  it("shows the open state and asks for confirmation before closing", async () => {
    const user = userEvent.setup();
    const onClosed = vi.fn();
    api.request.mockResolvedValue(closed);
    render(
      <FinancialMonthClose
        month="2026-10"
        close={null}
        readOnly={false}
        onClosed={onClosed}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Fechar mês" }));
    expect(
      screen.getByText(/Se você alterar ou adicionar lançamentos depois/),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Confirmar fechamento" }),
    );

    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        "/api/finance-close",
        {
          method: "POST",
          body: JSON.stringify({ month: "2026-10" }),
        },
        "Não foi possível fechar o mês.",
      ),
    );
    expect(onClosed).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledWith(
      "Mês fechado com os dados registrados.",
    );
  });

  it("explains that a changed month keeps the old close until explicit review", async () => {
    const user = userEvent.setup();
    render(
      <FinancialMonthClose
        month="2026-10"
        close={{
          ...closed,
          status: "needs_review",
          history: [
            {
              closedAt: "2026-10-31T12:00:00.000Z",
              totals: {
                expectedBalance: "12800.00",
                recordedBalance: "12700.00",
              },
            },
          ],
        }}
        readOnly={false}
        onClosed={vi.fn()}
      />,
    );

    expect(screen.getByText("Fechamento precisa de revisão")).toBeTruthy();
    expect(screen.getByText(/O registro fechado foi preservado/)).toBeTruthy();
    expect(screen.getByText(/Realizado R\$ 13\.230,43/)).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Ver 1 fechamentos anteriores" }),
    );
    expect(screen.getByText(/Previsto R\$ 12\.800,00/)).toBeTruthy();
    expect(screen.getByText(/Realizado R\$ 12\.700,00/)).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Revisar fechamento" }),
    );
    expect(
      screen.getByText(/fechamentos anteriores continuarão disponíveis/),
    ).toBeTruthy();
  });

  it("keeps the current month open and hides the action for future months", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-18T12:00:00-03:00"));
    const { rerender } = render(
      <FinancialMonthClose
        month="2026-11"
        close={null}
        readOnly={false}
        onClosed={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        /O mês está em andamento.*retrato, sem bloquear novos lançamentos/,
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Fechar mês" })).toBeNull();

    rerender(
      <FinancialMonthClose
        month="2099-01"
        close={null}
        readOnly={false}
        onClosed={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Fechar mês" })).toBeNull();
    expect(screen.queryByText(/O mês está em andamento/)).toBeNull();
  });

  it("prevents closing from support view", () => {
    render(
      <FinancialMonthClose
        month="2026-10"
        close={null}
        readOnly
        onClosed={vi.fn()}
      />,
    );
    expect(
      screen
        .getByRole("button", { name: "Fechar mês" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
});
