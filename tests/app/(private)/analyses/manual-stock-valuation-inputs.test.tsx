// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ apiRequest }));

import { ManualStockValuationInputs } from "@/app/(private)/analyses/_components/manual-stock-valuation-inputs";

describe("ManualStockValuationInputs", () => {
  beforeEach(() => apiRequest.mockReset());
  afterEach(cleanup);

  it("loads saved values and persists sourced per-share inputs accessibly", async () => {
    apiRequest
      .mockResolvedValueOnce({
        inputs: [
          {
            inputKey: "analysis_ltm_eps",
            value: 2.5,
            source: "Fonte anterior",
            asOf: "2025-06-30",
          },
        ],
      })
      .mockResolvedValueOnce({
        inputKey: "analysis_ltm_eps",
        value: 3.25,
        source: "Relações com Investidores",
        asOf: "2025-12-31",
      });
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ManualStockValuationInputs
        ticker="ITUB4"
        quoteAvailable
        onChange={onChange}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "Completar P/L e P/VP" }),
    ).toBeTruthy();
    const valueInput = screen.getByLabelText(
      "Lucro por ação nos últimos 12 meses (LPA)",
    );
    await user.clear(valueInput);
    await user.type(valueInput, "3.25");
    const sourceInput = screen.getAllByLabelText("Fonte consultada")[0]!;
    await user.clear(sourceInput);
    await user.type(sourceInput, "Relações com Investidores");
    const referenceDate = screen.getAllByPlaceholderText("dd/mm/aaaa")[0]!;
    await user.clear(referenceDate);
    await user.type(referenceDate, "31/12/2025");
    await user.click(
      screen.getAllByRole("button", { name: "Salvar valor" })[0]!,
    );

    expect(await screen.findByText(/Lucro por ação.*salvo/)).toBeTruthy();
    await waitFor(() =>
      expect(apiRequest).toHaveBeenNthCalledWith(
        2,
        "/api/analyses/stocks/ITUB4/manual-inputs/analysis_ltm_eps",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            value: 3.25,
            source: "Relações com Investidores",
            asOf: "2025-12-31",
          }),
        }),
        "Não foi possível salvar os valores informados.",
      ),
    );
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith([
        {
          inputKey: "analysis_ltm_eps",
          value: 3.25,
          source: "Relações com Investidores",
          asOf: "2025-12-31",
        },
      ]),
    );
  });

  it("requires confirmation before applying previously saved values", async () => {
    apiRequest.mockResolvedValue({
      inputs: [
        {
          inputKey: "analysis_ltm_eps",
          value: 2.5,
          source: "Fonte anterior",
          asOf: "2025-06-30",
        },
      ],
    });
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ManualStockValuationInputs
        ticker="ITUB4"
        quoteAvailable
        onChange={onChange}
      />,
    );

    expect(
      await screen.findByRole("button", {
        name: "Usar valores salvos nesta análise",
      }),
    ).toBeTruthy();
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith([]));
    await user.click(
      screen.getByRole("button", {
        name: "Usar valores salvos nesta análise",
      }),
    );
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith([
        {
          inputKey: "analysis_ltm_eps",
          value: 2.5,
          source: "Fonte anterior",
          asOf: "2025-06-30",
        },
      ]),
    );
    expect(
      screen.getByText("Valores salvos aplicados nesta análise."),
    ).toBeTruthy();
  });

  it("explains when no fresh quote is available and shows safe load errors", async () => {
    apiRequest.mockResolvedValue(null);
    render(
      <ManualStockValuationInputs
        ticker="ITUB4"
        quoteAvailable={false}
        onChange={vi.fn()}
      />,
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível carregar os valores informados.",
    );
    expect(screen.getByRole("status").textContent).toContain(
      "A cotação atual ainda não está confirmada.",
    );
    expect(screen.queryByText("backend details")).toBeNull();
  });

  it("shows the client-safe save failure returned by the API client", async () => {
    apiRequest
      .mockResolvedValueOnce({ inputs: [] })
      .mockRejectedValueOnce(new Error("Revise o valor informado."));
    const user = userEvent.setup();
    render(
      <ManualStockValuationInputs
        ticker="ITUB4"
        quoteAvailable
        onChange={vi.fn()}
      />,
    );
    await screen.findByRole("heading", { name: "Completar P/L e P/VP" });
    await user.type(
      screen.getByLabelText("Lucro por ação nos últimos 12 meses (LPA)"),
      "3.25",
    );
    await user.type(
      screen.getAllByLabelText("Fonte consultada")[0]!,
      "Fonte oficial",
    );
    await user.type(
      screen.getAllByPlaceholderText("dd/mm/aaaa")[0]!,
      "31/12/2025",
    );
    await user.click(
      screen.getAllByRole("button", { name: "Salvar valor" })[0]!,
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Revise o valor informado.",
    );
  });

  it("does not apply saved values until confirmed and accepts repeated saves", async () => {
    const savedInput = {
      inputKey: "analysis_ltm_eps" as const,
      value: 2.5,
      source: "Fonte anterior",
      asOf: "2025-06-30",
    };
    apiRequest
      .mockResolvedValueOnce({ inputs: [savedInput] })
      .mockResolvedValue({ ...savedInput, value: 2.75 });
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ManualStockValuationInputs
        ticker="ITUB4"
        quoteAvailable
        onChange={onChange}
      />,
    );

    await user.click(
      await screen.findByRole("button", {
        name: "Usar valores salvos nesta análise",
      }),
    );
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith([savedInput]),
    );

    await user.click(
      screen.getAllByRole("button", { name: "Salvar valor" })[0]!,
    );
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith([
        { ...savedInput, value: 2.75 },
      ]),
    );
    await user.click(
      screen.getAllByRole("button", { name: "Salvar valor" })[0]!,
    );
    expect(await screen.findByText(/Lucro por ação.*salvo/)).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledTimes(3);
  });

  it("uses a safe fallback when a save rejects with a non-Error value", async () => {
    apiRequest
      .mockResolvedValueOnce({ inputs: [] })
      .mockRejectedValueOnce("unexpected rejection");
    const user = userEvent.setup();
    render(
      <ManualStockValuationInputs
        ticker="ITUB4"
        quoteAvailable
        onChange={vi.fn()}
      />,
    );
    await screen.findByRole("heading", { name: "Completar P/L e P/VP" });
    await user.type(
      screen.getByLabelText("Lucro por ação nos últimos 12 meses (LPA)"),
      "3.25",
    );
    await user.type(screen.getAllByLabelText("Fonte consultada")[0]!, "Fonte");
    await user.type(
      screen.getAllByPlaceholderText("dd/mm/aaaa")[0]!,
      "31/12/2025",
    );
    await user.click(
      screen.getAllByRole("button", { name: "Salvar valor" })[0]!,
    );

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Não foi possível salvar os valores informados.",
    );
  });

  it("ignores a pending read that resolves after the form unmounts", async () => {
    let resolveRead: (value: { inputs: [] }) => void = () => {};
    apiRequest.mockReturnValue(
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
    );
    const onChange = vi.fn();
    const view = render(
      <ManualStockValuationInputs
        ticker="ITUB4"
        quoteAvailable
        onChange={onChange}
      />,
    );
    view.unmount();

    resolveRead({ inputs: [] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("ignores a pending read that rejects after the form unmounts", async () => {
    apiRequest.mockRejectedValueOnce(new Error("request failed"));
    const onChange = vi.fn();
    const view = render(
      <ManualStockValuationInputs
        ticker="ITUB4"
        quoteAvailable
        onChange={onChange}
      />,
    );
    view.unmount();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
