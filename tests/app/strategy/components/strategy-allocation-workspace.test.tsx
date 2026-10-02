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
import { StrategyAllocationWorkspace } from "@/app/strategy/_components/strategy-allocation-workspace";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: class {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.callback(
        [
          {
            target,
            contentRect: { width: 320, height: 180 },
          } as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  },
});

const classes = [
  {
    id: "fixed_income",
    label: "Renda fixa",
    knownValueCents: "40000",
    currentPercentage: 40,
  },
  {
    id: "brazilian_equities",
    label: "Ações brasileiras",
    knownValueCents: "30000",
    currentPercentage: 30,
  },
  {
    id: "international_etfs",
    label: "ETFs internacionais",
    knownValueCents: "20000",
    currentPercentage: 20,
  },
  {
    id: "fiis",
    label: "FIIs",
    knownValueCents: "10000",
    currentPercentage: 10,
  },
];

const baseProps = {
  classes,
  knownValueCents: "100000",
  unclassifiedKnownValueCents: "0",
  unvaluedPositionCount: 0,
  savedAllocationPercentages: null,
  onSaved: vi.fn(),
};

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) });
}

function setPercentages(values: [string, string, string, string]) {
  [
    "Renda fixa escolhida (%)",
    "Ações brasileiras escolhida (%)",
    "ETFs internacionais escolhida (%)",
    "FIIs escolhida (%)",
  ].forEach((label, index) => {
    fireEvent.change(screen.getByRole("spinbutton", { name: label }), {
      target: { value: values[index] },
    });
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  toast.error.mockReset();
  toast.success.mockReset();
  baseProps.onSaved.mockReset();
});

describe("StrategyAllocationWorkspace", () => {
  it("uses the fully classified current composition as the initial editable draft", () => {
    render(<StrategyAllocationWorkspace {...baseProps} />);

    expect(
      (
        screen.getByRole("spinbutton", {
          name: "Renda fixa escolhida (%)",
        }) as HTMLInputElement
      ).value,
    ).toBe("40.00");
    expect(screen.getByText("Soma dos pesos: 100.00%")).toBeTruthy();
    expect(screen.getByText("Atual 30.00%")).toBeTruthy();
    expect(screen.getByText("Sua composição de longo prazo")).toBeTruthy();
    expect(
      screen.getByText(/independente das metas do assistente de aportes/),
    ).toBeTruthy();
  });

  it("allows zero weights and saves a complete user-defined composition", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          message: "Composição gravada pelo servidor.",
          allocationPercentages: {
            fixed_income: 0,
            brazilian_equities: 30,
            international_etfs: 20,
            fiis: 50,
          },
        }),
      ),
    );
    const user = userEvent.setup();
    render(<StrategyAllocationWorkspace {...baseProps} />);
    setPercentages(["0", "30", "20", "50"]);
    await user.click(screen.getByRole("button", { name: "Salvar composição" }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Composição gravada pelo servidor.",
      ),
    );
    expect(baseProps.onSaved).toHaveBeenCalledWith({
      fixed_income: 0,
      brazilian_equities: 30,
      international_etfs: 20,
      fiis: 50,
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/portfolio/strategy",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          allocationPercentages: {
            fixed_income: 0,
            brazilian_equities: 30,
            international_etfs: 20,
            fiis: 50,
          },
        }),
      }),
    );
  });

  it("keeps incomplete percentages beside the editor and blocks saving", () => {
    render(<StrategyAllocationWorkspace {...baseProps} />);
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Renda fixa escolhida (%)" }),
      {
        target: { value: "41" },
      },
    );
    expect(
      screen.getByText("Soma dos pesos: 101.00% · excedem 1.00%"),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Salvar composição" })
        .hasAttribute("disabled"),
    ).toBe(true);

    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Renda fixa escolhida (%)" }),
      {
        target: { value: "100.01" },
      },
    );
    expect(
      screen
        .getByRole("button", { name: "Salvar composição" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("does not derive target percentages from a partial or unclassified portfolio", () => {
    render(
      <StrategyAllocationWorkspace
        {...baseProps}
        unclassifiedKnownValueCents="1000"
        unvaluedPositionCount={1}
      />,
    );

    expect(
      (
        screen.getByRole("spinbutton", {
          name: "Renda fixa escolhida (%)",
        }) as HTMLInputElement
      ).value,
    ).toBe("");
    expect(
      screen.getByText(
        /Parte do patrimônio de longo prazo não está classificada/,
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Salvar composição" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("shows zero value for a class absent from the observed long-term composition", () => {
    render(
      <StrategyAllocationWorkspace
        {...baseProps}
        classes={classes.slice(0, 3)}
        savedAllocationPercentages={{
          fixed_income: 40,
          brazilian_equities: 30,
          international_etfs: 20,
          fiis: 10,
        }}
      />,
    );

    expect(screen.getByText("Atual 0.00%")).toBeTruthy();
    expect(screen.getByText("Sem valor classificado")).toBeTruthy();
  });

  it("restores persisted composition and simulates how an aporte changes long-term weights", async () => {
    const simulation = {
      totalCents: "100000",
      contributionCents: "10000",
      unallocatedContributionCents: "0",
      completeness: {
        complete: true,
        unvaluedPositionCount: 0,
        unclassifiedKnownValueCents: "0",
        valuationDate: "2026-10-02",
        valuationDates: ["2026-10-02"],
      },
      allocations: [
        {
          id: "fixed_income",
          label: "Renda fixa",
          currentPercentage: 40,
          targetPercentage: 25,
          projectedPercentage: 38.18,
          contributionValueCents: "0",
        },
        {
          id: "brazilian_equities",
          label: "Ações brasileiras",
          currentPercentage: 30,
          targetPercentage: 30,
          projectedPercentage: 30.91,
          contributionValueCents: "10000",
        },
        {
          id: "international_etfs",
          label: "ETFs internacionais",
          currentPercentage: 20,
          targetPercentage: 25,
          projectedPercentage: 19.09,
          contributionValueCents: "0",
        },
        {
          id: "fiis",
          label: "FIIs",
          currentPercentage: 10,
          targetPercentage: 20,
          projectedPercentage: 9.09,
          contributionValueCents: "0",
        },
      ],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(simulation)));
    const user = userEvent.setup();
    render(
      <StrategyAllocationWorkspace
        {...baseProps}
        savedAllocationPercentages={{
          fixed_income: 25,
          brazilian_equities: 30,
          international_etfs: 25,
          fiis: 20,
        }}
      />,
    );
    expect(screen.getByText(/Última composição salva permanece/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Valor do aporte"), {
      target: { value: "100" },
    });
    await user.click(screen.getByRole("button", { name: "Simular aporte" }));

    expect(
      await screen.findByText("Composição estimada após o aporte"),
    ).toBeTruthy();
    expect(screen.getByText(/30.91% · R\$\s*100,00 do aporte/)).toBeTruthy();
    expect(
      screen.getByText(
        "Consulta de 02/10/2026 · valores disponíveis em 02/10/2026",
      ),
    ).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith(
      "/api/portfolio/strategy/contribution",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          contributionAmount: 100,
          allocationPercentages: {
            fixed_income: 25,
            brazilian_equities: 30,
            international_etfs: 25,
            fiis: 20,
          },
        }),
      }),
    );
  });

  it("shows amount validation beside the field without making an API request", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const user = userEvent.setup();
    render(<StrategyAllocationWorkspace {...baseProps} />);
    await user.click(screen.getByRole("button", { name: "Simular aporte" }));

    expect(
      screen.getByText(
        "Informe um aporte maior que zero, com até duas casas decimais.",
      ),
    ).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows a field error for more than two aporte decimals", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const user = userEvent.setup();
    render(<StrategyAllocationWorkspace {...baseProps} />);
    fireEvent.change(screen.getByLabelText("Valor do aporte"), {
      target: { value: "1.005" },
    });
    await user.click(screen.getByRole("button", { name: "Simular aporte" }));

    expect(screen.getByText("Use no máximo duas casas decimais.")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("labels an incomplete projection as partial and identifies excluded values", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          totalCents: "90000",
          contributionCents: "10000",
          unallocatedContributionCents: "0",
          completeness: {
            complete: false,
            unvaluedPositionCount: 1,
            unclassifiedKnownValueCents: "1000",
            valuationDate: "2026-10-02",
            valuationDates: ["2026-10-01"],
          },
          allocations: [
            {
              id: "fixed_income",
              label: "Renda fixa",
              currentPercentage: 40,
              targetPercentage: 25,
              projectedPercentage: 38.18,
              contributionValueCents: "0",
            },
            {
              id: "brazilian_equities",
              label: "Ações brasileiras",
              currentPercentage: 30,
              targetPercentage: 30,
              projectedPercentage: 30.91,
              contributionValueCents: "10000",
            },
            {
              id: "international_etfs",
              label: "ETFs internacionais",
              currentPercentage: 20,
              targetPercentage: 25,
              projectedPercentage: 19.09,
              contributionValueCents: "0",
            },
            {
              id: "fiis",
              label: "FIIs",
              currentPercentage: 10,
              targetPercentage: 20,
              projectedPercentage: 9.09,
              contributionValueCents: "0",
            },
          ],
        }),
      ),
    );
    const user = userEvent.setup();
    render(<StrategyAllocationWorkspace {...baseProps} />);
    fireEvent.change(screen.getByLabelText("Valor do aporte"), {
      target: { value: "100" },
    });
    await user.click(screen.getByRole("button", { name: "Simular aporte" }));

    expect(
      await screen.findByText("Simulação parcial após o aporte"),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /não cobre 1 posição\(ões\) sem valor e R\$\s*10,00 sem classe reconhecida/,
      ),
    ).toBeTruthy();
  });

  it("labels stale valuations approximate and shows an undistributed aporte remainder", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          totalCents: "0",
          contributionCents: "1",
          unallocatedContributionCents: "1",
          completeness: {
            complete: true,
            unvaluedPositionCount: 0,
            unclassifiedKnownValueCents: "0",
            valuationDate: "2026-10-02",
            valuationDates: ["2026-09-30"],
          },
          allocations: [
            {
              id: "fixed_income",
              label: "Renda fixa",
              currentPercentage: 0,
              targetPercentage: 25,
              projectedPercentage: 0,
              contributionValueCents: "0",
            },
            {
              id: "brazilian_equities",
              label: "Ações brasileiras",
              currentPercentage: 0,
              targetPercentage: 25,
              projectedPercentage: 0,
              contributionValueCents: "0",
            },
            {
              id: "international_etfs",
              label: "ETFs internacionais",
              currentPercentage: 0,
              targetPercentage: 25,
              projectedPercentage: 0,
              contributionValueCents: "0",
            },
            {
              id: "fiis",
              label: "FIIs",
              currentPercentage: 0,
              targetPercentage: 25,
              projectedPercentage: 0,
              contributionValueCents: "0",
            },
          ],
        }),
      ),
    );
    const user = userEvent.setup();
    render(
      <StrategyAllocationWorkspace
        {...baseProps}
        savedAllocationPercentages={{
          fixed_income: 25,
          brazilian_equities: 25,
          international_etfs: 25,
          fiis: 25,
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Valor do aporte"), {
      target: { value: "0.01" },
    });
    await user.click(screen.getByRole("button", { name: "Simular aporte" }));

    expect(
      await screen.findByText("Simulação aproximada após o aporte"),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Consulta de 02/10/2026 · valores disponíveis em 30/09/2026",
      ),
    ).toBeTruthy();
    expect(screen.getByText(/Não distribuído: R\$\s*0,01/)).toBeTruthy();
  });

  it("uses server and safe fallback messages for API and transport failures", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ message: "A composição foi recusada." }, false),
      )
      .mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", request);
    const user = userEvent.setup();
    render(<StrategyAllocationWorkspace {...baseProps} />);
    await user.click(screen.getByRole("button", { name: "Salvar composição" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("A composição foi recusada."),
    );

    fireEvent.change(screen.getByLabelText("Valor do aporte"), {
      target: { value: "10" },
    });
    await user.click(screen.getByRole("button", { name: "Simular aporte" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível simular este aporte.",
      ),
    );
    expect(screen.queryByText("offline")).toBeNull();
  });

  it("shows a safe toast when saving fails before receiving an API response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const user = userEvent.setup();
    render(<StrategyAllocationWorkspace {...baseProps} />);
    await user.click(screen.getByRole("button", { name: /Salvar composi/ }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledOnce());
    expect(toast.error.mock.calls[0][0]).toContain("salvar");
    expect(screen.queryByText("offline")).toBeNull();
  });
  it("uses safe fallbacks when an API failure has no usable message", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: "" }, false))
      .mockResolvedValueOnce(jsonResponse({}, false));
    vi.stubGlobal("fetch", request);
    const user = userEvent.setup();
    render(<StrategyAllocationWorkspace {...baseProps} />);
    await user.click(screen.getByRole("button", { name: "Salvar composição" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível salvar a composição.",
      ),
    );
    fireEvent.change(screen.getByLabelText("Valor do aporte"), {
      target: { value: "10" },
    });
    await user.click(screen.getByRole("button", { name: "Simular aporte" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível simular este aporte.",
      ),
    );
  });
});
