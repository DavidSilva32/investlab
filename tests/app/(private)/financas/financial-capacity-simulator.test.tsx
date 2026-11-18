// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ request: vi.fn() }));
const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiRequest: api.request }));
vi.mock("sonner", () => ({ toast }));

import { FinancialCapacitySimulator } from "@/app/(private)/financas/_components/financial-capacity-simulator";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FinancialCapacitySimulator", () => {
  it("starts collapsed and explains the read-only scenario when opened", async () => {
    const user = userEvent.setup();
    render(<FinancialCapacitySimulator month="2099-01" />);

    expect(screen.queryByLabelText("Redução de renda (R$)")).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Simular mudança no mês" }),
    );

    expect(screen.getByLabelText("Redução de renda (R$)")).toBeTruthy();
    expect(screen.getByLabelText("Aumento de despesas (R$)")).toBeTruthy();
    expect(screen.getByText(/não altera seus registros/)).toBeTruthy();
  });

  it("sends the selected month and scenarios, then exposes a positive Strategy prefill", async () => {
    const user = userEvent.setup();
    api.request.mockResolvedValue({
      month: "2099-01",
      baseBalanceCents: "200000",
      incomeReductionCents: "12525",
      expenseIncreaseCents: "30010",
      simulatedBalanceCents: "157465",
      status: "positive",
      completeness: "recorded_only",
      canSimulateStrategy: true,
    });
    render(<FinancialCapacitySimulator month="2099-01" />);
    await user.click(
      screen.getByRole("button", { name: "Simular mudança no mês" }),
    );
    await user.clear(screen.getByLabelText("Redução de renda (R$)"));
    await user.type(screen.getByLabelText("Redução de renda (R$)"), "125.25");
    await user.clear(screen.getByLabelText("Aumento de despesas (R$)"));
    await user.type(
      screen.getByLabelText("Aumento de despesas (R$)"),
      "300.10",
    );
    await user.click(screen.getByRole("button", { name: "Simular" }));

    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        "/api/finance-capacity",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            month: "2099-01",
            incomeReduction: "125.25",
            expenseIncrease: "300.1",
          }),
        }),
        "Não foi possível simular a capacidade mensal.",
      ),
    );
    expect(
      await screen.findByText((content) => content.includes("1.574,65")),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", {
          name: "Levar este valor para simular na Estratégia",
        })
        .getAttribute("href"),
    ).toBe("/estrategia?aporteCents=157465");
  });

  it("shows missing data as unavailable and does not offer a Strategy link", async () => {
    const user = userEvent.setup();
    api.request.mockResolvedValue({
      month: "2099-01",
      baseBalanceCents: null,
      incomeReductionCents: "0",
      expenseIncreaseCents: "0",
      simulatedBalanceCents: null,
      status: "unavailable",
      completeness: "no_data",
      canSimulateStrategy: false,
    });
    render(<FinancialCapacitySimulator month="2099-01" />);
    await user.click(
      screen.getByRole("button", { name: "Simular mudança no mês" }),
    );
    await user.click(screen.getByRole("button", { name: "Simular" }));

    expect(
      await screen.findByText(/Cadastre previsão de receita e despesa/),
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Estratégia/ })).toBeNull();
    expect(screen.getByText("Sem dados suficientes")).toBeTruthy();
  });

  it("does not offer a Strategy link for a negative simulated balance", async () => {
    const user = userEvent.setup();
    api.request.mockResolvedValue({
      month: "2099-01",
      baseBalanceCents: "1000",
      incomeReductionCents: "2000",
      expenseIncreaseCents: "0",
      simulatedBalanceCents: "-1000",
      status: "negative",
      completeness: "recorded_only",
      canSimulateStrategy: false,
    });
    render(<FinancialCapacitySimulator month="2099-01" />);
    await user.click(
      screen.getByRole("button", { name: "Simular mudança no mês" }),
    );
    await user.click(screen.getByRole("button", { name: "Simular" }));

    expect(
      await screen.findByText(/as despesas superariam as receitas/),
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Estratégia/ })).toBeNull();
  });

  it("explains that historical months cannot be simulated", async () => {
    const user = userEvent.setup();
    render(<FinancialCapacitySimulator month="2026-10" />);
    await user.click(
      screen.getByRole("button", { name: "Simular mudança no mês" }),
    );

    expect(screen.getByText(/apenas para o mês atual ou futuros/)).toBeTruthy();
    expect(screen.queryByLabelText("Redução de renda (R$)")).toBeNull();
  });

  it("reports API failures through the existing toast", async () => {
    const user = userEvent.setup();
    api.request.mockRejectedValue(new Error("Falha conhecida."));
    render(<FinancialCapacitySimulator month="2099-01" />);
    await user.click(
      screen.getByRole("button", { name: "Simular mudança no mês" }),
    );
    await user.click(screen.getByRole("button", { name: "Simular" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Falha conhecida."),
    );
  });

  it("disables the action while the calculation is pending", async () => {
    const user = userEvent.setup();
    const pending: { resolve?: (value: unknown) => void } = {};
    api.request.mockImplementation(
      () =>
        new Promise((resolve) => {
          pending.resolve = resolve;
        }),
    );
    render(<FinancialCapacitySimulator month="2099-01" />);
    await user.click(
      screen.getByRole("button", { name: "Simular mudança no mês" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Simular" }));

    expect(
      screen
        .getByRole("button", { name: "Calculando…" })
        .hasAttribute("disabled"),
    ).toBe(true);
    pending.resolve?.({
      month: "2099-01",
      baseBalanceCents: null,
      incomeReductionCents: "0",
      expenseIncreaseCents: "0",
      simulatedBalanceCents: null,
      status: "unavailable",
      completeness: "no_data",
      canSimulateStrategy: false,
    });
  });
});
