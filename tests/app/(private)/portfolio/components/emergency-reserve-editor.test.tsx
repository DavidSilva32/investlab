// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmergencyReserveEditor } from "@/app/(private)/portfolio/_components/emergency-reserve-editor";
import { QueryClientWrapper } from "../../../../utils/query-client-wrapper";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

describe("EmergencyReserveEditor", () => {
  it("loads expense and month settings and saves only those settings", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (!init?.method)
          return Response.json({ monthlyExpenses: 4650, targetMonths: 12 });
        return Response.json({ message: "Reserva atualizada com sucesso." });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<EmergencyReserveEditor />, { wrapper: QueryClientWrapper });

    const expenses = await screen.findByLabelText("Despesas mensais (R$)");
    const months = screen.getByLabelText("Meta (meses)");
    expect((expenses as HTMLInputElement).value).toBe("R$ 4.650,00");
    expect((months as HTMLInputElement).value).toBe("12");
    expect(screen.getByText("R$ 55.800,00")).toBeTruthy();

    await user.clear(expenses);
    await user.type(expenses, "500000");
    await user.clear(months);
    await user.type(months, "10");
    await user.click(
      screen.getByRole("button", { name: "Salvar configuração" }),
    );

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Reserva atualizada com sucesso.",
      ),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/emergency-reserve",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ monthlyExpenses: 5000, targetMonths: 10 }),
      }),
    );
    const savedRequest = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "PUT",
    );
    expect(JSON.parse(String(savedRequest?.[1]?.body))).not.toHaveProperty(
      "selectedAssetKeys",
    );
  });

  it("keeps load errors inline with a retry action", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("Não foi possível carregar a configuração da reserva."),
      )
      .mockResolvedValueOnce(
        Response.json({ monthlyExpenses: 100, targetMonths: 6 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<EmergencyReserveEditor />, { wrapper: QueryClientWrapper });

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível carregar",
    );
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByLabelText("Despesas mensais (R$)")).toBeTruthy();
  });

  it("validates expenses and target months before sending a request", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ monthlyExpenses: 100, targetMonths: 6 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<EmergencyReserveEditor />, { wrapper: QueryClientWrapper });
    await screen.findByLabelText("Despesas mensais (R$)");

    await user.clear(screen.getByLabelText("Meta (meses)"));
    await user.click(
      screen.getByRole("button", { name: "Salvar configuração" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "meta entre 1 e 1.200 meses",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("requires positive monthly expenses before validating the target", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ monthlyExpenses: 100, targetMonths: 6 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<EmergencyReserveEditor />, { wrapper: QueryClientWrapper });
    const expenses = await screen.findByLabelText("Despesas mensais (R$)");
    await user.clear(expenses);
    await user.click(
      screen.getByRole("button", { name: "Salvar configuração" }),
    );

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Informe as despesas mensais em reais",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a target above the supported maximum", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ monthlyExpenses: 100, targetMonths: 6 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<EmergencyReserveEditor />, { wrapper: QueryClientWrapper });
    await screen.findByLabelText("Despesas mensais (R$)");
    const months = screen.getByLabelText("Meta (meses)");
    await user.clear(months);
    await user.type(months, "1201");
    await user.click(
      screen.getByRole("button", { name: "Salvar configuração" }),
    );

    expect((await screen.findByRole("alert")).textContent).toContain(
      "meta entre 1 e 1.200 meses",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows an API error message as a toast and does not duplicate it inline", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        init?.method
          ? Response.json(
              { message: "Revise a meta informada." },
              { status: 400 },
            )
          : Response.json({ monthlyExpenses: 100, targetMonths: 6 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<EmergencyReserveEditor />, { wrapper: QueryClientWrapper });
    await screen.findByLabelText("Despesas mensais (R$)");
    await user.click(
      screen.getByRole("button", { name: "Salvar configuração" }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Revise a meta informada."),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("uses a safe fallback toast when the save request fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ monthlyExpenses: 100, targetMonths: 6 }),
      )
      .mockRejectedValueOnce(new Error("private network detail"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<EmergencyReserveEditor />, { wrapper: QueryClientWrapper });
    await screen.findByLabelText("Despesas mensais (R$)");
    await user.click(
      screen.getByRole("button", { name: "Salvar configuração" }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível salvar a configuração da reserva.",
      ),
    );
    expect(screen.queryByText("private network detail")).toBeNull();
  });

  it("supports unset bank expenses and target settings", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ monthlyExpenses: null, targetMonths: null }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<EmergencyReserveEditor />, { wrapper: QueryClientWrapper });

    const expenses = (await screen.findByLabelText(
      "Despesas mensais (R$)",
    )) as HTMLInputElement;
    const months = screen.getByLabelText("Meta (meses)") as HTMLInputElement;
    expect(expenses.value).toBe("");
    expect(months.value).toBe("");
    expect(screen.getByText("Informe despesas e meses")).toBeTruthy();
  });
});
