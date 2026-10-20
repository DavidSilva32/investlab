// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render as renderBase,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { PortfolioOpportunities } from "@/app/(private)/analyses/_components/portfolio-opportunities";
import * as apiClient from "@/lib/api-client";
import { QueryClientWrapper } from "../../../utils/query-client-wrapper";
import type { ReactNode } from "react";

function render(ui: ReactNode) {
  return renderBase(<QueryClientWrapper>{ui}</QueryClientWrapper>);
}

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const opportunity = {
  ticker: "PETR4",
  logoUrl: "https://icons.brapi.dev/icons/PETR4.svg",
  name: "Petrobras PN",
  quantity: 12,
  positionDate: "2026-09-30",
  price: 30,
  priceAsOf: "2026-10-01T00:00:00.000Z",
  fundamentalsAsOf: "2025-12-31",
  financialPeriods: [
    { referenceDate: "2025-12-31", sourceDocument: "DFP" as const },
  ],
  automaticDividend: {
    value: 5,
    windowStart: "2025-10-02",
    windowEnd: "2026-10-02",
    observedPayments: 3,
    source: "BRAPI" as const,
    unavailableReason:
      "A BRAPI não confirmou a completude da janela de 12 meses.",
  },
  inputs: [
    {
      inputKey: "graham_eps" as const,
      value: 4,
      source: "Annual report",
      asOf: "2025-12-31",
    },
    {
      inputKey: "graham_book_value_per_share" as const,
      value: 20,
      source: "Annual report",
      asOf: "2025-12-31",
    },
    {
      inputKey: "bazin_dividend_per_share" as const,
      value: 2,
      source: "Investor relations",
      asOf: "2025-12-31",
    },
  ],
  methods: {
    graham: {
      value: 42.42,
      differencePercent: 41.4,
      asOf: "2025-12-31",
      source: "Annual report",
      unavailableReason: null,
    },
    bazin: {
      value: 33.33,
      differencePercent: 11.1,
      asOf: "2025-12-31",
      source: "Investor relations; taxa global 6% a.a.",
      unavailableReason: null,
    },
  },
};

function response(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: async () => body });
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      response({
        opportunities: [opportunity],
        settings: { bazinTargetYield: 6 },
      }),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("PortfolioOpportunities", () => {
  it("reloads portfolio opportunities after a financial portfolio update", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          opportunities: [opportunity],
          settings: { bazinTargetYield: 6 },
        }),
      )
      .mockResolvedValueOnce(
        response({ opportunities: [], settings: { bazinTargetYield: 6 } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<PortfolioOpportunities />);

    expect(
      await screen.findAllByRole("img", { name: "Identidade de Petrobras PN" }),
    ).toBeTruthy();
    await act(async () => {
      window.dispatchEvent(new Event("portfolio:updated"));
    });

    expect(
      await screen.findByText("Nenhuma ação importada encontrada"),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows skeleton while the carteira is loading", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
    render(<PortfolioOpportunities />);
    expect(screen.getByLabelText(/Carregando/).getAttribute("aria-busy")).toBe(
      "true",
    );
  });

  it("shows a retryable inline error and recovers", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ message: "Não foi possível consultar agora." }, false),
      )
      .mockResolvedValueOnce(response({ settings: { bazinTargetYield: 6 } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<PortfolioOpportunities />);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível consultar agora.",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /tentar novamente/i }),
    );
    expect(
      await screen.findByText("Nenhuma ação importada encontrada"),
    ).toBeTruthy();
  });

  it("explains empty holdings", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          response({ opportunities: [], settings: { bazinTargetYield: 6 } }),
        ),
    );
    render(<PortfolioOpportunities />);
    expect(
      await screen.findByText(
        /confirmadas pela classificação da fonte e presentes nas posições importadas/i,
      ),
    ).toBeTruthy();
  });

  it("distinguishes failed classification lookups from an empty imported portfolio", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          opportunities: [],
          classificationStatus: "unavailable",
          classificationLookupFailures: 2,
          settings: { bazinTargetYield: 6 },
        }),
      )
      .mockResolvedValueOnce(
        response({ opportunities: [], settings: { bazinTargetYield: 6 } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<PortfolioOpportunities />);
    expect(
      await screen.findByText("Não foi possível confirmar a classe dos ativos"),
    ).toBeTruthy();
    expect(screen.getByText(/a carteira pode conter ações/i)).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: /tentar novamente/i }),
    );
    expect(
      await screen.findByText("Nenhuma ação importada encontrada"),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows a distinct empty message when classification is partial but no ticker was confirmed", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          opportunities: [],
          classificationStatus: "partial",
          classificationLookupFailures: 1,
          settings: { bazinTargetYield: 6 },
        }),
      )
      .mockResolvedValueOnce(
        response({ opportunities: [], settings: { bazinTargetYield: 6 } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<PortfolioOpportunities />);
    expect(
      await screen.findByText("Nenhuma ação elegível foi confirmada"),
    ).toBeTruthy();
    expect(screen.getByText(/não está sendo tratada como vazia/i)).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: /tentar novamente/i }),
    );
    expect(
      await screen.findByText("Nenhuma ação importada encontrada"),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows a partial classification limitation alongside verified stocks", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          opportunities: [opportunity],
          classificationStatus: "partial",
          classificationLookupFailures: 1,
          settings: { bazinTargetYield: 6 },
        }),
      )
      .mockResolvedValueOnce(
        response({
          opportunities: [opportunity],
          settings: { bazinTargetYield: 6 },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<PortfolioOpportunities />);
    expect((await screen.findByRole("status")).textContent).toContain(
      "Não foi possível confirmar a classe de 1 ativo(s).",
    );
    await userEvent.click(
      within(screen.getByRole("status")).getByRole("button", {
        name: /tentar novamente/i,
      }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders quotes, both references, source periods, dividend limitation and accessible help", async () => {
    render(<PortfolioOpportunities />);
    const card = await screen.findByRole("img", {
      name: "Identidade de Petrobras PN",
    });
    expect(card).toBeTruthy();
    expect(card.querySelector("img")?.getAttribute("src")).toBe(
      "https://icons.brapi.dev/icons/PETR4.svg",
    );
    expect(screen.getByText("Número de Graham")).toBeTruthy();
    expect(screen.getByText("Preço-teto de Bazin")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Ver critérios" }).getAttribute("href"),
    ).toBe("/analises?ticker=PETR4");
    expect(
      screen.getAllByText("abaixo da referência", { exact: false }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(/Fundamentos: 1 período disponível/i)).toBeTruthy();
    expect(
      screen.getByText(/Proventos em 12 meses:.*cobertura não confirmada/i),
    ).toBeTruthy();
    expect(screen.queryByText(/não confirmou a completude/i)).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Ver fontes e limitações" }),
    );
    expect(screen.getByText(/DFP 31 de dez. de 2025/i)).toBeTruthy();
    expect(screen.getByText(/não confirmou a completude/i)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Sobre a taxa inicial do Bazin" }),
    ).toBeTruthy();
    await userEvent.hover(
      screen.getByRole("button", { name: "Sobre Número de Graham" }),
    );
    expect(await screen.findByText(/raiz quadrada de 22,5/i)).toBeTruthy();
    await userEvent.hover(
      screen.getByRole("button", { name: "Sobre Preço-teto de Bazin" }),
    );
    expect(
      await screen.findByText(
        /não confirma que os proventos sejam recorrentes/i,
      ),
    ).toBeTruthy();
    expect(
      within(
        screen.getByText("Taxa-alvo global do Bazin").parentElement!,
      ).getByRole("button", { name: "Sobre a taxa inicial do Bazin" }),
    ).toBeTruthy();
  });

  it("summarizes multiple financial periods and reveals their sources on demand", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          opportunities: [
            {
              ...opportunity,
              financialPeriods: [
                { referenceDate: "2025-12-31", sourceDocument: "DFP" },
                { referenceDate: "2025-06-30", sourceDocument: "ITR" },
              ],
            },
          ],
          settings: { bazinTargetYield: 6 },
        }),
      ),
    );
    render(<PortfolioOpportunities />);

    await screen.findByRole("img", { name: "Identidade de Petrobras PN" });
    const summary = screen.getByText(/Fundamentos:/i);
    expect(summary.textContent).toContain("2 períodos disponíveis");
    expect(summary.textContent).toContain("base mais recente em");
    expect(screen.queryByText(/Demonstrativos CVM:/i)).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Ver fontes e limitações" }),
    );
    expect(
      screen.getByText(/DFP 31 de dez. de 2025 · ITR 30 de jun. de 2025/i),
    ).toBeTruthy();
  });

  it("renders missing and invalid dates, unavailable methods and divergent references", async () => {
    const incompleteOpportunity = {
      ...opportunity,
      positionDate: "not-a-date",
      price: null,
      priceAsOf: null,
      fundamentalsAsOf: "2025-06-30",
      financialPeriods: [],
      automaticDividend: null,
      inputs: opportunity.inputs.map((input) => ({
        ...input,
        value: null,
        source: null,
        asOf: null,
      })),
      methods: {
        graham: {
          value: 10,
          differencePercent: 0,
          asOf: null,
          source: null,
          unavailableReason: "Graham sem comparação.",
        },
        bazin: {
          value: null,
          differencePercent: -5,
          asOf: "invalid-date",
          source: null,
          unavailableReason: "Bazin indisponível.",
        },
      },
    };
    const noComparisonOpportunity = {
      ...incompleteOpportunity,
      ticker: "VALE3",
      fundamentalsAsOf: null,
      inputs: [],
      methods: {
        graham: {
          value: null,
          differencePercent: null,
          asOf: null,
          source: null,
          unavailableReason: "Graham sem dados suficientes.",
        },
        bazin: {
          value: null,
          differencePercent: null,
          asOf: null,
          source: null,
          unavailableReason: "Bazin sem dados suficientes.",
        },
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          opportunities: [incompleteOpportunity, noComparisonOpportunity],
        }),
      ),
    );
    render(<PortfolioOpportunities />);
    await screen.findAllByRole("img", { name: "Identidade de Petrobras PN" });
    expect(screen.getByText("Na referência calculada")).toBeTruthy();
    expect(screen.getByText(/acima da referência/i)).toBeTruthy();
    expect(screen.getByText(/ficam em lados diferentes/i)).toBeTruthy();
    expect(
      screen.getAllByText(/posição importada em Data não informada/i),
    ).toHaveLength(2);
    expect(screen.getAllByText("Indisponível")).toHaveLength(2);
    expect(screen.getAllByText("Comparação indisponível")).toHaveLength(2);
    expect(screen.getByText("Bazin indisponível.")).toBeTruthy();
    expect(screen.getByText("Bazin sem dados suficientes.")).toBeTruthy();
    expect(screen.getAllByText(/Proventos em 12 meses:/i)).toHaveLength(2);
    expect(screen.getAllByText(/Fundamentos: indisponíveis/i)).toHaveLength(2);

    const sourceButtons = screen.getAllByRole("button", {
      name: "Ver fontes e limitações",
    });
    await userEvent.click(sourceButtons[0]!);
    await userEvent.click(sourceButtons[1]!);
    expect(screen.getAllByText(/janela de 12 meses/i)).toHaveLength(2);
    expect(screen.getAllByText(/sem eventos utilizáveis/i)).toHaveLength(2);

    await userEvent.click(
      screen.getAllByRole("button", {
        name: "Inserir dados para calcular Graham e Bazin",
      })[0]!,
    );
    expect(
      (document.getElementById("PETR4-graham_eps-as-of") as HTMLInputElement)
        .value,
    ).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(screen.getAllByPlaceholderText("Origem do dado")).toHaveLength(3);
    await userEvent.click(
      screen.getAllByRole("button", {
        name: "Inserir dados para calcular Graham e Bazin",
      })[1]!,
    );
    fireEvent.change(document.getElementById("VALE3-graham_eps-value")!, {
      target: { value: "9" },
    });
    expect(
      (document.getElementById("VALE3-graham_eps-value") as HTMLInputElement)
        .value,
    ).toBe("9");
  });

  it("saves the configured global Bazin yield", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          opportunities: [opportunity],
          settings: { bazinTargetYield: 6 },
        }),
      )
      .mockResolvedValueOnce(response({ bazinTargetYield: 7.5 }))
      .mockResolvedValueOnce(
        response({
          opportunities: [opportunity],
          settings: { bazinTargetYield: 7.5 },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<PortfolioOpportunities />);
    const rate = await screen.findByLabelText("Percentual anual");
    await userEvent.clear(rate);
    await userEvent.type(rate, "7.5");
    await userEvent.click(screen.getByRole("button", { name: /salvar taxa/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ bazinTargetYield: 7.5 }),
    });
    expect(toast.success).toHaveBeenCalledWith("Taxa-alvo global atualizada.");
  });

  it("shows the API message when saving the global Bazin yield fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          opportunities: [opportunity],
          settings: { bazinTargetYield: 6 },
        }),
      )
      .mockResolvedValueOnce(response({ message: "Taxa rejeitada." }, false));
    vi.stubGlobal("fetch", fetchMock);
    render(<PortfolioOpportunities />);
    const rate = await screen.findByLabelText("Percentual anual");
    await userEvent.clear(rate);
    await userEvent.type(rate, "7");
    await userEvent.click(screen.getByRole("button", { name: /salvar taxa/i }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Taxa rejeitada."),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("invalidates and reloads if the opportunities cache was evicted during save", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        opportunities: [opportunity],
        settings: { bazinTargetYield: 6 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    renderBase(
      <QueryClientProvider client={queryClient}>
        <PortfolioOpportunities />
      </QueryClientProvider>,
    );
    const rate = await screen.findByLabelText("Percentual anual");
    const updateCache = vi
      .spyOn(queryClient, "setQueryData")
      .mockImplementation((_, updater) => {
        if (typeof updater === "function")
          (updater as (current: undefined) => unknown)(undefined);
        return undefined;
      });

    await userEvent.clear(rate);
    await userEvent.type(rate, "7");
    await userEvent.click(screen.getByRole("button", { name: /salvar taxa/i }));

    expect(updateCache).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledWith("Taxa-alvo global atualizada.");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    queryClient.clear();
  });

  it.each([
    ["0", "Informe uma taxa anual maior que 0% e de até 100%."],
    ["101", "Informe uma taxa anual maior que 0% e de até 100%."],
    ["abc", "Informe uma taxa anual maior que 0% e de até 100%."],
  ])("rejects an invalid global Bazin yield (%s)", async (value, message) => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        opportunities: [opportunity],
        settings: { bazinTargetYield: 6 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<PortfolioOpportunities />);
    const rate = await screen.findByLabelText("Percentual anual");
    await userEvent.clear(rate);
    await userEvent.type(rate, value);
    await userEvent.click(screen.getByRole("button", { name: /salvar taxa/i }));
    expect(toast.error).toHaveBeenCalledWith(message);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows a safe fallback when saving manual evidence fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          opportunities: [opportunity],
          settings: { bazinTargetYield: 6 },
        }),
      )
      .mockRejectedValueOnce(new Error("private transport detail"));
    vi.stubGlobal("fetch", fetchMock);
    render(<PortfolioOpportunities />);
    await screen.findAllByRole("img", { name: "Identidade de Petrobras PN" });
    await userEvent.click(
      screen.getByRole("button", {
        name: "Inserir dados para calcular Graham e Bazin",
      }),
    );
    expect(
      screen.getByText(
        "Os valores por ação precisam ser informados por você com origem e data. Para Graham, informe LPA e VPA da mesma data-base. Para Bazin, informe os proventos em dinheiro pagos por ação nos últimos 12 meses.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "No histórico de proventos de Relações com Investidores, some dividendos e JCP em dinheiro pagos por ação nos 12 meses anteriores à data informada. Não use o total creditado na sua conta.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Transcreva o VPA por ação publicado pela empresa na mesma data-base do LPA. Não use o patrimônio total nem divida valores sem conferir a quantidade e a classe das ações.",
      ),
    ).toBeTruthy();
    expect(
      document
        .getElementById("PETR4-graham_eps-value")
        ?.getAttribute("aria-describedby"),
    ).toBe("PETR4-graham_eps-guidance");
    const value = document.getElementById("PETR4-graham_eps-value")!;
    const form = value.closest("form")!;
    expect(
      within(form)
        .getByPlaceholderText("Origem do dado")
        .getAttribute("aria-describedby"),
    ).toBe("PETR4-graham_eps-guidance");
    expect(
      within(form)
        .getByLabelText("Lucro por ação (LPA), data de referência")
        .getAttribute("aria-describedby"),
    ).toBe("PETR4-graham_eps-guidance");
    await userEvent.click(within(form).getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível salvar o dado manual.",
      ),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("validates missing manual value, origin and date before posting", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        opportunities: [opportunity],
        settings: { bazinTargetYield: 6 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<PortfolioOpportunities />);
    await screen.findAllByRole("img", { name: "Identidade de Petrobras PN" });
    await userEvent.click(
      screen.getByRole("button", {
        name: "Inserir dados para calcular Graham e Bazin",
      }),
    );
    const value = document.getElementById("PETR4-graham_eps-value")!;
    const form = value.closest("form")!;
    const source = within(form).getByPlaceholderText("Origem do dado");
    const date = within(form).getByLabelText(
      "Lucro por ação (LPA), data de referência",
    );
    await userEvent.clear(value);
    fireEvent.submit(form);
    expect(toast.error).toHaveBeenLastCalledWith(
      "Informe o valor, a origem e a data para salvar.",
    );
    await userEvent.type(value, "5");
    await userEvent.clear(source);
    fireEvent.submit(form);
    expect(toast.error).toHaveBeenLastCalledWith(
      "Informe o valor, a origem e a data para salvar.",
    );
    await userEvent.type(source, "Relatório anual");
    await userEvent.clear(date);
    fireEvent.submit(form);
    expect(toast.error).toHaveBeenLastCalledWith(
      "Informe o valor, a origem e a data para salvar.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows the API message when saving manual evidence fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          opportunities: [opportunity],
          settings: { bazinTargetYield: 6 },
        }),
      )
      .mockResolvedValueOnce(response({ message: "Valor rejeitado." }, false));
    vi.stubGlobal("fetch", fetchMock);
    render(<PortfolioOpportunities />);
    await screen.findAllByRole("img", { name: "Identidade de Petrobras PN" });
    await userEvent.click(
      screen.getByRole("button", {
        name: "Inserir dados para calcular Graham e Bazin",
      }),
    );
    const value = document.getElementById("PETR4-graham_eps-value")!;
    const form = value.closest("form")!;
    await userEvent.clear(value);
    await userEvent.type(value, "5");
    await userEvent.clear(within(form).getByPlaceholderText("Origem do dado"));
    await userEvent.type(
      within(form).getByPlaceholderText("Origem do dado"),
      "Relatório anual",
    );
    const date = within(form).getByLabelText(
      "Lucro por ação (LPA), data de referência",
    );
    await userEvent.clear(date);
    await userEvent.type(date, "30/06/2025");
    await userEvent.click(within(form).getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Valor rejeitado."),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses safe fallbacks when mutation rejections are not Error instances", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          opportunities: [opportunity],
          settings: { bazinTargetYield: 6 },
        }),
      ),
    );
    render(<PortfolioOpportunities />);
    await screen.findAllByRole("img", { name: "Identidade de Petrobras PN" });
    const request = vi.spyOn(apiClient, "apiRequest");
    request.mockRejectedValueOnce("private manual rejection");

    await userEvent.click(
      screen.getByRole("button", {
        name: "Inserir dados para calcular Graham e Bazin",
      }),
    );
    const value = document.getElementById("PETR4-graham_eps-value")!;
    const form = value.closest("form")!;
    await userEvent.click(within(form).getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível salvar o dado manual.",
      ),
    );

    vi.mocked(toast.error).mockClear();
    request.mockRejectedValueOnce("private settings rejection");
    await userEvent.click(screen.getByRole("button", { name: /salvar taxa/i }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível atualizar a taxa configurada.",
      ),
    );
  });

  it("saves per-share evidence with source and date, separate from the automatic observation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          opportunities: [opportunity],
          settings: { bazinTargetYield: 6 },
        }),
      )
      .mockResolvedValueOnce(response({ inputKey: "graham_eps" }))
      .mockResolvedValueOnce(
        response({
          opportunities: [opportunity],
          settings: { bazinTargetYield: 6 },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<PortfolioOpportunities />);
    await screen.findAllByRole("img", { name: "Identidade de Petrobras PN" });
    await userEvent.click(
      screen.getByRole("button", {
        name: "Inserir dados para calcular Graham e Bazin",
      }),
    );
    const value = document.getElementById("PETR4-graham_eps-value")!;
    const form = value.closest("form")!;
    const date = within(form).getByLabelText(
      "Lucro por ação (LPA), data de referência",
    );
    fireEvent.change(date, { target: { value: "30/06/2025" } });
    await userEvent.click(within(form).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: expect.stringContaining('"source":"Annual report"'),
    });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      body: expect.stringContaining('"asOf":"2025-06-30"'),
    });
    expect(toast.success).toHaveBeenCalledWith(
      "Dado manual salvo com origem e data.",
    );
  });
});
