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

const baseline = (
  month = "2099-01",
  income: string | null = "800000",
  expenses: string | null = "600000",
) => ({
  month,
  baselineIncomeCents: income,
  baselineExpenseCents: expenses,
  baseBalanceCents:
    income === null || expenses === null
      ? null
      : (BigInt(income) - BigInt(expenses)).toString(),
  incomeCents: null,
  expenseCents: null,
  simulatedBalanceCents: null,
  status: "unavailable",
  completeness: "recorded_only",
  canSimulateStrategy: false,
});

const simulation = (
  month = "2099-01",
  income = "787475",
  expenses = "630010",
) => ({
  ...baseline(month),
  incomeCents: income,
  expenseCents: expenses,
  simulatedBalanceCents: (BigInt(income) - BigInt(expenses)).toString(),
  status:
    BigInt(income) - BigInt(expenses) > 0n
      ? "positive"
      : BigInt(income) - BigInt(expenses) < 0n
        ? "negative"
        : "zero",
  canSimulateStrategy: BigInt(income) > BigInt(expenses),
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FinancialCapacitySimulator", () => {
  it("starts collapsed and loads known monthly totals when opened", async () => {
    const user = userEvent.setup();
    api.request.mockResolvedValueOnce(baseline());
    render(<FinancialCapacitySimulator month="2099-01" />);

    expect(screen.queryByLabelText("Renda do mês")).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Simular mudança no mês" }),
    );

    expect(screen.getByLabelText("Renda do mês")).toBeTruthy();
    expect(screen.getByLabelText("Despesas do mês")).toBeTruthy();
    expect(
      screen.getByLabelText("Renda do mês").getAttribute("value"),
    ).toContain("8.000,00");
    expect(
      screen.getByLabelText("Despesas do mês").getAttribute("value"),
    ).toContain("6.000,00");
    expect(screen.getByText(/não altera seus registros/)).toBeTruthy();
    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        "/api/finance-capacity",
        { method: "POST", body: JSON.stringify({ month: "2099-01" }) },
        "Não foi possível carregar os valores do mês.",
      ),
    );
  });

  it("submits masked absolute monthly totals and exposes a positive Strategy prefill", async () => {
    const user = userEvent.setup();
    api.request
      .mockResolvedValueOnce(baseline())
      .mockResolvedValueOnce(simulation());
    render(<FinancialCapacitySimulator month="2099-01" />);
    await user.click(
      screen.getByRole("button", { name: "Simular mudança no mês" }),
    );
    const income = await screen.findByLabelText("Renda do mês");
    const expenses = screen.getByLabelText("Despesas do mês");
    await user.clear(income);
    await user.type(income, "787475");
    await user.clear(expenses);
    await user.type(expenses, "630010");
    await user.click(screen.getByRole("button", { name: "Simular" }));

    await waitFor(() =>
      expect(api.request).toHaveBeenLastCalledWith(
        "/api/finance-capacity",
        {
          method: "POST",
          body: JSON.stringify({
            month: "2099-01",
            incomeCents: "787475",
            expenseCents: "630010",
          }),
        },
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

  it("refreshes the monthly baseline and clears a previous result on re-open", async () => {
    const user = userEvent.setup();
    api.request
      .mockResolvedValueOnce(baseline("2099-01", "11100", "1000"))
      .mockResolvedValueOnce(simulation("2099-01", "30000", "10000"))
      .mockResolvedValueOnce(baseline("2099-01", "22200", "3000"));
    render(<FinancialCapacitySimulator month="2099-01" />);
    const trigger = screen.getByRole("button", {
      name: "Simular mudança no mês",
    });
    await user.click(trigger);
    const income = await screen.findByLabelText("Renda do mês");
    expect(income).toHaveProperty("value", "R$ 111,00");

    await user.clear(income);
    await user.type(income, "30000");
    await user.clear(screen.getByLabelText("Despesas do mês"));
    await user.type(screen.getByLabelText("Despesas do mês"), "10000");
    await user.click(screen.getByRole("button", { name: "Simular" }));
    expect(
      await screen.findByRole("link", { name: /Estratégia/ }),
    ).toBeTruthy();

    await user.click(trigger);
    await user.click(trigger);

    await waitFor(() => expect(api.request).toHaveBeenCalledTimes(3));
    expect(await screen.findByLabelText("Renda do mês")).toHaveProperty(
      "value",
      "R$ 222,00",
    );
    expect(screen.getByLabelText("Despesas do mês")).toHaveProperty(
      "value",
      "R$ 30,00",
    );
    expect(screen.queryByRole("link", { name: /Estratégia/ })).toBeNull();
  });

  it("leaves unknown baseline fields blank and disables simulation until entered", async () => {
    const user = userEvent.setup();
    api.request.mockResolvedValueOnce(baseline("2099-01", null, null));
    render(<FinancialCapacitySimulator month="2099-01" />);
    await user.click(
      screen.getByRole("button", { name: "Simular mudança no mês" }),
    );

    expect(await screen.findByLabelText("Renda do mês")).toHaveProperty(
      "value",
      "",
    );
    expect(screen.getByLabelText("Despesas do mês")).toHaveProperty(
      "value",
      "",
    );
    expect(
      screen.getByRole("button", { name: "Simular" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.queryByRole("link", { name: /Estratégia/ })).toBeNull();
  });

  it("preserves pasted digits beyond the limit and blocks the simulation", async () => {
    const user = userEvent.setup();
    api.request.mockResolvedValueOnce(baseline());
    render(<FinancialCapacitySimulator month="2099-01" />);
    await user.click(
      screen.getByRole("button", { name: "Simular mudança no mês" }),
    );
    const income = await screen.findByLabelText("Renda do mês");

    fireEvent.change(income, { target: { value: "123456789012345" } });

    expect(income).toHaveProperty("value", "R$ 1.234.567.890.123,45");
    expect(screen.getByRole("alert").textContent).toContain(
      "Informe até R$ 999.999.999.999,99.",
    );
    expect(
      screen.getByRole("button", { name: "Simular" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(api.request).toHaveBeenCalledTimes(1);
  });

  it("preserves the digit-based caret during a middle edit", async () => {
    const user = userEvent.setup();
    api.request.mockResolvedValueOnce(baseline());
    render(<FinancialCapacitySimulator month="2099-01" />);
    await user.click(
      screen.getByRole("button", { name: "Simular mudança no mês" }),
    );
    const income = (await screen.findByLabelText(
      "Renda do mês",
    )) as HTMLInputElement;

    income.focus();
    income.setSelectionRange(5, 5, "forward");
    await user.keyboard("{Backspace}");

    expect(income.value).toBe("R$ 8.000,00");
    expect(income.selectionStart).toBe(4);
  });

  it("does not offer a Strategy link for a negative simulated balance", async () => {
    const user = userEvent.setup();
    api.request
      .mockResolvedValueOnce(baseline())
      .mockResolvedValueOnce(simulation("2099-01", "5000", "7000"));
    render(<FinancialCapacitySimulator month="2099-01" />);
    await user.click(
      screen.getByRole("button", { name: "Simular mudança no mês" }),
    );
    await screen.findByLabelText("Renda do mês");
    await user.clear(screen.getByLabelText("Renda do mês"));
    await user.type(screen.getByLabelText("Renda do mês"), "5000");
    await user.clear(screen.getByLabelText("Despesas do mês"));
    await user.type(screen.getByLabelText("Despesas do mês"), "7000");
    await user.click(screen.getByRole("button", { name: "Simular" }));

    expect(
      await screen.findByText(/despesas superam a renda informada/),
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
    expect(screen.queryByLabelText("Renda do mês")).toBeNull();
  });

  it("reports baseline API failures through the existing toast", async () => {
    const user = userEvent.setup();
    api.request.mockRejectedValue(new Error("Falha conhecida."));
    render(<FinancialCapacitySimulator month="2099-01" />);
    await user.click(
      screen.getByRole("button", { name: "Simular mudança no mês" }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Falha conhecida."),
    );
  });

  it("disables the action while the calculation is pending", async () => {
    const user = userEvent.setup();
    let resolveSimulation: ((value: unknown) => void) | undefined;
    api.request.mockResolvedValueOnce(baseline()).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSimulation = resolve;
        }),
    );
    render(<FinancialCapacitySimulator month="2099-01" />);
    await user.click(
      screen.getByRole("button", { name: "Simular mudança no mês" }),
    );
    await screen.findByLabelText("Renda do mês");
    fireEvent.click(screen.getByRole("button", { name: "Simular" }));

    expect(
      screen
        .getByRole("button", { name: "Calculando…" })
        .hasAttribute("disabled"),
    ).toBe(true);
    resolveSimulation?.(simulation());
  });

  it("ignores a late simulation after close and reopen refreshes the baseline", async () => {
    const user = userEvent.setup();
    const pending: { resolve?: (value: unknown) => void } = {};
    api.request
      .mockResolvedValueOnce(baseline("2099-01", "11100", "1000"))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            pending.resolve = resolve;
          }),
      )
      .mockResolvedValueOnce(baseline("2099-01", "22200", "3000"));
    render(<FinancialCapacitySimulator month="2099-01" />);
    const trigger = screen.getByRole("button", {
      name: "Simular mudança no mês",
    });
    await user.click(trigger);
    const income = await screen.findByLabelText("Renda do mês");
    await user.click(screen.getByRole("button", { name: "Simular" }));
    expect(
      await screen.findByRole("button", { name: "Calculando…" }),
    ).toBeTruthy();
    expect(income.hasAttribute("disabled")).toBe(true);

    await user.click(trigger);
    await user.click(trigger);
    expect(await screen.findByLabelText("Renda do mês")).toHaveProperty(
      "value",
      "R$ 222,00",
    );
    expect(screen.getByLabelText("Despesas do mês")).toHaveProperty(
      "value",
      "R$ 30,00",
    );

    pending.resolve?.(simulation("2099-01", "30000", "10000"));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Calculando…" })).toBeNull(),
    );
    expect(screen.queryByText("Saldo com esses valores")).toBeNull();
    expect(screen.queryByRole("link", { name: /Estratégia/ })).toBeNull();
    expect(screen.getByLabelText("Renda do mês")).toHaveProperty(
      "value",
      "R$ 222,00",
    );
  });
});
