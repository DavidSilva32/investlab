// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { ContributionAssistant } from "@/app/_components/contribution-assistant";
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe("ContributionAssistant", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.mocked(toast.error).mockReset();
  });

  it("submits the amount and shows reserve-first values and class split", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "ready",
          strategySource: "user_defined",
          contributionAmount: 8000,
          reserveAmount: 701.08,
          remainingAmount: 7298.92,
          unallocatedAmount: 0,
          reserveStatus: "applied",
          reserveDifference: 701.08,
          longTermPortfolioValue: 10000,
          unknownPositionCount: 0,
          allocations: [
            {
              assetClass: "Renda variável",
              currentValue: 2000,
              currentPercentage: 20,
              targetPercentage: 50,
              targetGapValue: 5000,
              contributionAmount: 7298.92,
            },
          ],
        }),
      }),
    );
    render(<ContributionAssistant />);
    fireEvent.change(
      screen.getByLabelText("Valor disponível para este aporte"),
      {
        target: { value: "800000" },
      },
    );
    expect(
      (
        screen.getByLabelText(
          "Valor disponível para este aporte",
        ) as HTMLInputElement
      ).value,
    ).toBe("R$ 8.000,00");
    fireEvent.click(screen.getByRole("button", { name: "Ver distribuição" }));

    expect(await screen.findByText("Para a reserva")).toBeTruthy();
    expect(screen.getByText("Meta pessoal alcançada.")).toBeTruthy();
    expect(screen.getAllByText(/R\$\s*7\.298,92/)).toHaveLength(2);
    expect(
      screen.getByText("Metas definidas por você · distribuição por classe"),
    ).toBeTruthy();
    expect(screen.getByText("Hoje abaixo da meta")).toBeTruthy();
    expect(screen.getByText("Aporte sugerido")).toBeTruthy();
    expect(
      screen.getByRole("img", {
        name: "Renda variável: hoje 20.0%, após aporte 53.8%, meta 50.0%.",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText("Carteira considerada na estratégia: R$ 10.000,00"),
    ).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith(
      "/api/portfolio/contribution",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ contributionAmount: 8000 }),
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Por quê e detalhes do cálculo" }),
    );
    expect(
      await screen.findByText(/Base de longo prazo considerada/),
    ).toBeTruthy();
  });

  it("formats edits as BRL and submits the parsed numeric value", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "no_positions",
        strategySource: "user_defined",
        contributionAmount: 1234.56,
        reserveAmount: 0,
        remainingAmount: 1234.56,
        unallocatedAmount: 1234.56,
        reserveStatus: "not_configured",
        reserveDifference: null,
        longTermPortfolioValue: null,
        unknownPositionCount: 0,
        allocations: [],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ContributionAssistant />);
    const input = screen.getByLabelText(
      "Valor disponível para este aporte",
    ) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "800000" } });
    expect(input.value).toBe("R$ 8.000,00");
    fireEvent.change(input, { target: { value: "123456" } });
    expect(input.value).toBe("R$ 1.234,56");
    fireEvent.click(screen.getByRole("button", { name: "Ver distribuição" }));

    expect(
      await screen.findByText(/Não há posições de longo prazo/),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/portfolio/contribution",
      expect.objectContaining({
        body: JSON.stringify({ contributionAmount: 1234.56 }),
      }),
    );
  });

  it("keeps zero and amounts above the endpoint limit disabled", () => {
    render(<ContributionAssistant />);
    const input = screen.getByLabelText(
      "Valor disponível para este aporte",
    ) as HTMLInputElement;
    const submit = screen.getByRole("button", { name: "Ver distribuição" });

    fireEvent.change(input, { target: { value: "000" } });
    expect(input.value).toBe("R$ 0,00");
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: "100000000000001" } });
    expect(input.value).toBe("R$ 1.000.000.000.000,01");
    expect((submit as HTMLButtonElement).disabled).toBe(true);
  });

  it.each([
    ["000", "R$ 0,00"],
    ["100000000000001", "R$ 1.000.000.000.000,01"],
  ])(
    "rejects a programmatic submit for %s",
    async (typedAmount, maskedAmount) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      render(<ContributionAssistant />);
      const input = screen.getByRole("textbox") as HTMLInputElement;
      fireEvent.change(input, { target: { value: typedAmount } });
      expect(input.value).toBe(maskedAmount);

      fireEvent.submit(input.closest("form") as HTMLFormElement);

      expect(await screen.findByRole("alert")).toBeTruthy();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("keeps typing usable when the browser does not expose the caret", () => {
    render(<ContributionAssistant />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    Object.defineProperties(input, {
      selectionStart: { configurable: true, get: () => null },
      selectionEnd: { configurable: true, get: () => null },
      selectionDirection: { configurable: true, get: () => null },
    });
    const setSelectionRange = vi.spyOn(input, "setSelectionRange");

    fireEvent.change(input, { target: { value: "123" } });

    expect(input.value).toBe("R$ 1,23");
    expect(setSelectionRange).toHaveBeenCalledWith(7, 7, "none");
  });

  it("explains incomplete long-term data without displaying a split", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "incomplete_data",
          strategySource: "user_defined",
          contributionAmount: 100,
          reserveAmount: 0,
          remainingAmount: 100,
          unallocatedAmount: 100,
          reserveStatus: "not_needed",
          reserveDifference: 0,
          longTermPortfolioValue: null,
          unknownPositionCount: 2,
          allocations: [],
        }),
      }),
    );
    render(<ContributionAssistant />);
    fireEvent.change(
      screen.getByLabelText("Valor disponível para este aporte"),
      {
        target: { value: "100" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Ver distribuição" }));

    expect(
      await screen.findByText(/2 posição\(ões\).*sem valor ou classificação/),
    ).toBeTruthy();
  });

  it("reports a request failure by toast without duplicating inline feedback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    render(<ContributionAssistant />);
    fireEvent.change(
      screen.getByLabelText("Valor disponível para este aporte"),
      {
        target: { value: "100" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Ver distribuição" }));

    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível calcular o aporte. Tente novamente.",
      ),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("uses a safe frontend fallback for unusable API messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ message: "  " }),
      }),
    );
    render(<ContributionAssistant />);
    fireEvent.change(
      screen.getByLabelText("Valor disponível para este aporte"),
      { target: { value: "100" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Ver distribuição" }));

    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível calcular o aporte. Tente novamente.",
      ),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("blocks the allocation and marks amounts unavailable when reserve data is incomplete", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "reserve_incomplete",
          strategySource: "user_defined",
          contributionAmount: 100,
          reserveAmount: null,
          remainingAmount: null,
          unallocatedAmount: null,
          reserveStatus: "incomplete",
          reserveDifference: null,
          longTermPortfolioValue: null,
          unknownPositionCount: 0,
          allocations: [],
        }),
      }),
    );
    render(<ContributionAssistant />);
    fireEvent.change(
      screen.getByLabelText("Valor disponível para este aporte"),
      {
        target: { value: "100" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Ver distribuição" }));

    expect(await screen.findAllByText("Indisponível")).toHaveLength(2);
    expect(
      screen.getByText(
        /Revise os dados da reserva para calcular quanto separar/,
      ),
    ).toBeTruthy();
  });

  it("links to user-defined targets when no allocation targets are configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "needs_targets",
          strategySource: "user_defined",
          contributionAmount: 100,
          reserveAmount: 0,
          remainingAmount: 100,
          unallocatedAmount: 100,
          reserveStatus: "not_configured",
          reserveDifference: null,
          longTermPortfolioValue: null,
          unknownPositionCount: 0,
          allocations: [],
        }),
      }),
    );
    render(<ContributionAssistant />);
    fireEvent.change(
      screen.getByLabelText("Valor disponível para este aporte"),
      {
        target: { value: "100" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Ver distribuição" }));

    expect(
      await screen.findByRole("link", { name: /Revisar metas pessoais/ }),
    ).toBeTruthy();
    expect(screen.getByText("Sem meta pessoal definida.")).toBeTruthy();
  });

  it.each([
    ["no_positions", "Não há posições de longo prazo"],
    ["no_gap", "Nenhuma classe está abaixo da sua meta"],
  ] as const)("explains the %s state", async (status, explanation) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status,
          strategySource: "user_defined",
          contributionAmount: 100,
          reserveAmount: 0,
          remainingAmount: 100,
          unallocatedAmount: 100,
          reserveStatus: "not_configured",
          reserveDifference: null,
          longTermPortfolioValue: null,
          unknownPositionCount: 0,
          allocations: [],
        }),
      }),
    );
    render(<ContributionAssistant />);
    fireEvent.change(
      screen.getByLabelText("Valor disponível para este aporte"),
      { target: { value: "100" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Ver distribuição" }));

    expect(await screen.findByText(new RegExp(explanation))).toBeTruthy();
  });

  it("explains a calculated strategy source and any undistributed remainder", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "ready",
          strategySource: "system_calculated",
          contributionAmount: 100,
          reserveAmount: 0,
          remainingAmount: 100,
          unallocatedAmount: 25,
          reserveStatus: "not_configured",
          reserveDifference: null,
          longTermPortfolioValue: 1000,
          unknownPositionCount: 0,
          allocations: [
            {
              assetClass: "Renda fixa",
              currentValue: 1000,
              currentPercentage: 100,
              targetPercentage: 100,
              targetGapValue: 0,
              contributionAmount: 75,
            },
            {
              assetClass: "Exterior",
              currentValue: 0,
              currentPercentage: 0,
              targetPercentage: 0,
              targetGapValue: 0,
              contributionAmount: 0,
            },
          ],
        }),
      }),
    );
    render(<ContributionAssistant />);
    fireEvent.change(
      screen.getByLabelText("Valor disponível para este aporte"),
      { target: { value: "100" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Ver distribuição" }));

    expect(
      await screen.findByText(
        "Estratégia calculada pelo InvestLab · distribuição por classe",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /Nenhuma classe está abaixo da sua meta\. R\$\s*25,00 fica sem classe direcionada/,
      ),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Por quê e detalhes do cálculo" }),
    );
    expect(
      await screen.findAllByText(/sem diferença positiva para aporte/),
    ).toBeTruthy();
  });

  it("shows when the aporte cannot complete the personal reserve goal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "no_gap",
          strategySource: "user_defined",
          contributionAmount: 500,
          reserveAmount: 500,
          remainingAmount: 0,
          unallocatedAmount: 0,
          reserveStatus: "applied",
          reserveDifference: 701.08,
          longTermPortfolioValue: 10000,
          unknownPositionCount: 0,
          allocations: [
            {
              assetClass: "Renda variável",
              currentValue: 2000,
              currentPercentage: 20,
              targetPercentage: 50,
              targetGapValue: 5000,
              contributionAmount: 0,
            },
          ],
        }),
      }),
    );
    render(<ContributionAssistant />);
    fireEvent.change(
      screen.getByLabelText("Valor disponível para este aporte"),
      { target: { value: "50000" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Ver distribuição" }));

    expect(
      await screen.findByText(/Ainda faltam R\$\s*201,08 da meta pessoal/),
    ).toBeTruthy();
    expect(
      screen.getByText("Restante após reserva").parentElement?.textContent,
    ).toContain("R$ 0,00");
    expect(screen.getAllByText("R$ 0,00").length).toBeGreaterThan(0);
    expect(screen.getByText("Hoje abaixo da meta")).toBeTruthy();
  });

  it("shows the remaining class gap when the aporte cannot cover all goals", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "ready",
          strategySource: "user_defined",
          contributionAmount: 1000,
          reserveAmount: 0,
          remainingAmount: 1000,
          unallocatedAmount: 0,
          reserveStatus: "not_needed",
          reserveDifference: 0,
          longTermPortfolioValue: 10000,
          unknownPositionCount: 0,
          allocations: [
            {
              assetClass: "Renda fixa",
              currentValue: 1000,
              currentPercentage: 10,
              targetPercentage: 20,
              targetGapValue: 700,
              contributionAmount: 500,
            },
            {
              assetClass: "Renda variável",
              currentValue: 1000,
              currentPercentage: 10,
              targetPercentage: 20,
              targetGapValue: 700,
              contributionAmount: 500,
            },
          ],
        }),
      }),
    );
    render(<ContributionAssistant />);
    fireEvent.change(
      screen.getByLabelText("Valor disponível para este aporte"),
      { target: { value: "100000" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Ver distribuição" }));

    expect(
      await screen.findByText(
        /A diferença após este aporte em relação às metas que você definiu seria de R\$\s*400,00/,
      ),
    ).toBeTruthy();
    expect(screen.getAllByText("R$ 500,00")).toHaveLength(2);
    expect(
      screen.getByText("Para a reserva").parentElement?.textContent,
    ).toContain("Meta pessoal alcançada");
  });

  it("shows when no class is below its personal goal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "no_gap",
          strategySource: "user_defined",
          contributionAmount: 100,
          reserveAmount: 0,
          remainingAmount: 100,
          unallocatedAmount: 100,
          reserveStatus: "not_needed",
          reserveDifference: 0,
          longTermPortfolioValue: 1000,
          unknownPositionCount: 0,
          allocations: [
            {
              assetClass: "Renda fixa",
              currentValue: 1000,
              currentPercentage: 100,
              targetPercentage: 100,
              targetGapValue: 0,
              contributionAmount: 0,
            },
          ],
        }),
      }),
    );
    render(<ContributionAssistant />);
    fireEvent.change(
      screen.getByLabelText("Valor disponível para este aporte"),
      { target: { value: "10000" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Ver distribuição" }));

    expect(
      await screen.findByText(/Nenhuma classe está abaixo da sua meta/),
    ).toBeTruthy();
    expect(screen.getByText("Hoje na meta ou acima")).toBeTruthy();
    expect(
      screen.getByText(
        /Nenhuma classe está abaixo da sua meta\. R\$\s*100,00 fica sem classe direcionada/,
      ),
    ).toBeTruthy();
  });

  it("shows the contribution amount left over after all class gaps are filled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "ready",
          strategySource: "user_defined",
          contributionAmount: 1000,
          reserveAmount: 0,
          remainingAmount: 1000,
          unallocatedAmount: 250,
          reserveStatus: "not_needed",
          reserveDifference: 0,
          longTermPortfolioValue: 10000,
          unknownPositionCount: 0,
          allocations: [
            {
              assetClass: "Renda fixa",
              currentValue: 7500,
              currentPercentage: 75,
              targetPercentage: 75,
              targetGapValue: 750,
              contributionAmount: 750,
            },
          ],
        }),
      }),
    );
    render(<ContributionAssistant />);
    fireEvent.change(
      screen.getByLabelText("Valor disponível para este aporte"),
      { target: { value: "100000" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Ver distribuição" }));

    expect(
      await screen.findByText("R$ 250,00 ficam sem classe direcionada."),
    ).toBeTruthy();
    expect(screen.getByText("Hoje na meta ou acima")).toBeTruthy();
  });
});
