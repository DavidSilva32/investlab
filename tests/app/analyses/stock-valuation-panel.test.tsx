// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StockValuationPanel } from "@/app/analyses/_components/stock-valuation-panel";

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    Bar: () => null,
    BarChart: ({
      children,
      data,
    }: {
      children: React.ReactNode;
      data: Array<{ name: string }>;
    }) => (
      <div
        data-testid="valuation-chart"
        data-scenarios={data.map(({ name }) => name).join(",")}
      >
        {children}
      </div>
    ),
    CartesianGrid: () => null,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    XAxis: () => null,
    YAxis: ({
      tickFormatter,
    }: {
      tickFormatter: (value: number) => string;
    }) => <span data-testid="valuation-axis-label">{tickFormatter(1000)}</span>,
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    releasePointerCapture: { configurable: true, value: () => undefined },
    setPointerCapture: { configurable: true, value: () => undefined },
    scrollIntoView: { configurable: true, value: () => undefined },
  });
});

function unavailableResult() {
  return {
    status: "unavailable",
    valuationMethodVersion: "fcff-dcf-brl-nominal-v1",
    currency: "BRL",
    basis: "nominal",
    reasons: ["Informe o componente essencial: FCFF de referência."],
    wacc: null,
    scenarios: [],
    sensitivity: [],
    equityValue: null,
    valuePerShare: null,
    shareValueUnavailableReason:
      "Valor por ação indisponível sem reconciliação completa.",
    shareGateComplete: false,
    sectorClassification: "non_financial",
  };
}

function calculatedResult() {
  return {
    ...unavailableResult(),
    status: "calculated",
    reasons: [],
    wacc: 0.081,
    scenarios: [
      { key: "downside", growth: 0.02, enterpriseValue: 900 },
      { key: "base", growth: 0.04, enterpriseValue: 1000 },
      { key: "upside", growth: 0.06, enterpriseValue: null },
      { key: "external-case", growth: 0.07, enterpriseValue: 1150 },
    ],
    sensitivity: [
      {
        forecastWacc: 0.081,
        terminalWacc: 0.08,
        terminalGrowth: 0.025,
        enterpriseValue: 1000,
        reason: null,
      },
      {
        forecastWacc: 0.061,
        terminalWacc: 0.06,
        terminalGrowth: 0.025,
        enterpriseValue: null,
        reason:
          "Ponto omitido: o resultado excedeu o intervalo numérico suportado.",
      },
    ],
    provenance: {
      baseFcff: {
        value: 100,
        type: "premise",
        source: "Premissa informada pelo usuário",
        asOf: "2026-09-28",
        currency: "BRL",
        basis: "nominal",
        unit: "currency",
        horizon: "base",
        method: "FCFF anual informado como premissa",
        version: "user-premise-v1",
      },
      beta: {
        value: 1,
        type: "external_estimate",
        source: "Estimativa setorial externa",
        asOf: "2026-09-28",
        currency: "BRL",
        basis: "nominal",
        unit: "ratio",
        horizon: "forecast:5",
        method: "Beta setorial publicado; não é beta observado da empresa",
        version: "v1",
      },
      baseGrowth: {
        value: 0.04,
        type: "premise",
        source: "Premissa de crescimento",
        asOf: "2026-09-28",
        currency: "BRL",
        basis: "nominal",
        unit: "percentage",
        horizon: "forecast:5",
        method: "Crescimento anual explícito para o cenário base",
        version: "v1",
      },
      customComponent: {
        value: 1,
        type: "custom_type",
        source: "Origem com classificação futura",
        asOf: "2026-09-28",
        currency: "BRL",
        basis: "nominal",
        unit: "ratio",
        horizon: "future",
        method: "Método de classificação ainda desconhecida",
        version: "v2",
      },
    },
  };
}

describe("StockValuationPanel", () => {
  it("sends blank numeric fields as unavailable and shows the server explanation", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => unavailableResult(),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<StockValuationPanel ticker="TEST3" />);
    expect(
      screen.getByRole("combobox", { name: "Prazo da taxa-base" }).textContent,
    ).toContain("Selecione o prazo da taxa-base");

    await userEvent.click(
      screen.getByRole("button", { name: "Calcular cenários" }),
    );

    await screen.findByText("Avaliação indisponível");
    expect(
      screen.getByText("Informe o componente essencial: FCFF de referência."),
    ).toBeTruthy();
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string) as {
      forecastYears: number | null;
      inputs: Record<string, unknown>;
    };
    expect(body.forecastYears).toBeNull();
    expect(Object.values(body.inputs).every((input) => input === null)).toBe(
      true,
    );
    expect(fetchMock.mock.calls[0]![0]).toContain("/TEST3/valuation");
  });

  it("shows scenario values and input lineage returned by the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => calculatedResult(),
      }),
    );
    render(<StockValuationPanel ticker="TEST3" />);
    await userEvent.click(
      screen.getByRole("button", { name: "Calcular cenários" }),
    );

    await screen.findByText("Cenários de valor da firma");
    expect(screen.getByText("Conservador")).toBeTruthy();
    expect(screen.getByText("Otimista")).toBeTruthy();
    expect(screen.getByTestId("valuation-chart").dataset.scenarios).toContain(
      "external-case",
    );
    expect(screen.getByTestId("valuation-axis-label").textContent).toContain(
      "R$",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Dados e premissas usados" }),
    );
    const provenance = await screen.findByText(
      /Premissa · Premissa informada pelo usuário/,
    );
    expect(provenance.textContent).toContain("2026-09-28");
    expect(provenance.textContent).toContain(
      "FCFF anual informado como premissa",
    );
    expect(screen.getByText(/nenhuma observação automática/)).toBeTruthy();
    expect(screen.getByText("Crescimento anual · base: 4%")).toBeTruthy();
    expect(screen.getByText("customComponent: 1")).toBeTruthy();
    expect(
      screen.getByText(/custom_type · Origem com classificação futura/),
    ).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: "Sensibilidade do cenário-base" }),
    );
    expect(
      screen.getByText(
        "Ponto omitido: o resultado excedeu o intervalo numérico suportado.",
      ),
    ).toBeTruthy();
  });

  it("renders a calculated result when the server omits optional provenance", async () => {
    const result = { ...calculatedResult(), provenance: undefined };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => result }),
    );
    render(<StockValuationPanel ticker="TEST3" />);
    await userEvent.click(
      screen.getByRole("button", { name: "Calcular cenários" }),
    );
    expect(await screen.findByText("Cenários de valor da firma")).toBeTruthy();
  });

  it("shows an actionable message when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    render(<StockValuationPanel ticker="TEST3" />);
    await userEvent.click(
      screen.getByRole("button", { name: "Calcular cenários" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível calcular agora. Tente novamente.",
    );
  });

  it("sends the explicit continuity and country-risk review confirmations", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => unavailableResult(),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<StockValuationPanel ticker="TEST3" />);
    fireEvent.click(
      screen.getByLabelText(
        "Confirmo que a empresa é operacional e esta análise considera continuidade.",
      ),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Fonte, data e limitações/ }),
    );
    fireEvent.click(
      screen.getByLabelText(
        "Revisei explicitamente a combinação entre taxa-base e ERP.",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Calcular cenários" }));
    await screen.findByText("Avaliação indisponível");
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string) as {
      continuityConfirmed: boolean;
      countryRiskOverlapReviewed: boolean;
    };
    expect(body.continuityConfirmed).toBe(true);
    expect(body.countryRiskOverlapReviewed).toBe(true);
  });

  it("sends per-component type and provenance for mixed observed, premise and external-estimate inputs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => calculatedResult() });
    vi.stubGlobal("fetch", fetchMock);
    render(<StockValuationPanel ticker="TEST3" />);
    fireEvent.change(document.getElementById("valuation-baseFcff")!, {
      target: { value: "100" },
    });
    fireEvent.change(document.getElementById("valuation-downsideGrowth")!, {
      target: { value: "2" },
    });
    fireEvent.change(document.getElementById("valuation-beta")!, {
      target: { value: "1" },
    });
    fireEvent.change(document.getElementById("valuation-riskFreeRate")!, {
      target: { value: "4" },
    });
    fireEvent.change(document.getElementById("valuation-baseGrowth")!, {
      target: { value: "4" },
    });
    const triggers = screen.getAllByRole("button", { name: /Proveniência:/ });
    const entryMetadata = [
      [
        0,
        "Observado",
        "CVM DFP informada pelo usuário",
        "FCFF identificado manualmente no demonstrativo",
      ],
      [1, "Premissa", "Premissa do usuário", "Crescimento anual informado"],
      [
        6,
        "Estimativa externa",
        "Estimativa setorial externa",
        "Beta setorial publicado; não é beta observado da empresa",
      ],
    ] as const;
    for (const [index, type, source, method] of entryMetadata) {
      fireEvent.click(triggers[index]!);
      await userEvent.click(screen.getByLabelText("Tipo da entrada"));
      const option = screen.getByRole("option", { name: type });
      fireEvent.pointerDown(option, {
        button: 0,
        ctrlKey: false,
        pointerType: "mouse",
      });
      fireEvent.pointerUp(option, {
        button: 0,
        ctrlKey: false,
        pointerType: "mouse",
      });
      fireEvent.change(screen.getByLabelText("Origem"), {
        target: { value: source },
      });
      fireEvent.change(screen.getByLabelText("Data-base"), {
        target: { value: "2026-09-28" },
      });
      fireEvent.change(screen.getByLabelText("Método"), {
        target: { value: method },
      });
      fireEvent.change(screen.getByLabelText("Versão da fonte ou premissa"), {
        target: { value: "v1" },
      });
      if (index === 0) {
        expect(screen.getByText(/Classificação autodeclarada/)).toBeTruthy();
      }
      fireEvent.click(triggers[index]!);
    }
    fireEvent.click(screen.getByRole("button", { name: "Calcular cenários" }));
    await screen.findByText("Cenários de valor da firma");
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string) as {
      forecastYears: number;
      continuityConfirmed: boolean;
      countryRiskOverlapReviewed: boolean;
      inputs: Record<
        string,
        {
          value: number;
          type: string;
          source: string;
          asOf: string;
          method: string;
          version: string;
          unit: string;
          horizon: string;
        } | null
      >;
    };
    expect(body.forecastYears).toBeNull();
    expect(body.inputs.riskFreeRate).toMatchObject({
      value: 0.04,
      type: null,
      horizon: "forecast:unspecified",
    });
    expect(body.inputs.baseFcff).toMatchObject({
      type: "observed",
      value: 100,
      unit: "currency",
      horizon: "base",
      source: "CVM DFP informada pelo usuário",
      asOf: "2026-09-28",
      version: "v1",
    });
    expect(body.inputs.downsideGrowth).toMatchObject({
      type: "premise",
      value: 0.02,
      unit: "percentage",
      horizon: "forecast:",
    });
    expect(body.inputs.beta).toMatchObject({
      type: "external_estimate",
      value: 1,
      unit: "ratio",
      horizon: "forecast:",
    });
    expect(body.inputs.baseGrowth).toMatchObject({
      value: 0.04,
      type: null,
      unit: "percentage",
      horizon: "forecast:",
    });
    expect(
      Object.values(body.inputs).filter((input) => input === null),
    ).toHaveLength(8);
    fireEvent.click(
      screen.getByRole("button", { name: "Dados e premissas usados" }),
    );
    expect(
      screen.getByText(/Estimativa externa · Estimativa setorial externa/),
    ).toBeTruthy();
  });

  it("shows an actionable message when a server error response cannot be calculated", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    render(<StockValuationPanel ticker="TEST3" />);
    await userEvent.click(
      screen.getByRole("button", { name: "Calcular cenários" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível calcular agora. Tente novamente.",
    );
  });

  it("sends the independently selected risk-free maturity without relabeling it to the DCF horizon", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...unavailableResult(),
        reasons: [
          "O prazo/vértice da taxa-base precisa ser informado e coincidir com o horizonte do DCF.",
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<StockValuationPanel ticker="TEST3" />);
    await userEvent.click(
      screen.getByRole("combobox", { name: "Horizonte dos fluxos" }),
    );
    await userEvent.click(screen.getByRole("option", { name: "10 anos" }));
    await userEvent.click(
      screen.getByRole("combobox", { name: "Prazo da taxa-base" }),
    );
    await userEvent.click(screen.getByRole("option", { name: "5 anos" }));
    fireEvent.change(document.getElementById("valuation-riskFreeRate")!, {
      target: { value: "4" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Calcular cenários" }),
    );
    expect(
      await screen.findByText(
        "O prazo/vértice da taxa-base precisa ser informado e coincidir com o horizonte do DCF.",
      ),
    ).toBeTruthy();
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string) as {
      forecastYears: number;
      inputs: Record<string, { horizon: string } | null>;
    };
    expect(body.forecastYears).toBe(10);
    expect(body.inputs.riskFreeRate?.horizon).toBe("forecast:5");
  });
});
