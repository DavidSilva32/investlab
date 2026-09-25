/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiscoverDashboard } from "@/app/analyses/_components/discover-dashboard";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const response = (body: unknown, ok = true) =>
  Promise.resolve({ ok, json: () => Promise.resolve(body) });
const payload = {
  hasSuccessfulSync: true,
  results: [
    {
      cnpj: "111",
      cvmCode: "1",
      name: "Empresa Exemplo",
      sector: "Petróleo e Gás",
      securities: [{ ticker: "AAA3", name: "Empresa ON" }],
      quantitativeEligible: true,
      metrics: {
        latestNetIncome: 20,
        latestRevenue: 100,
        latestEquity: 50,
        roe: null,
        netMargin: null,
        pe: null,
        pb: null,
        valuationMarketDate: null,
        valuationFinancialDate: null,
        valuationSourceTicker: null,
        positiveProfitYears: 2,
      },
      assessment: {
        period: "2025-12-31",
        source: "CVM DFP consolidada anual",
        criteria: [
          {
            id: "latest_profit",
            label: "Lucro líquido positivo no último exercício completo",
            status: "met",
            explanation: "Usa DFP anual.",
          },
          {
            id: "positive_equity",
            label: "Patrimônio líquido positivo",
            status: "not_met",
            explanation: "Período atual.",
          },
          {
            id: "profit_history",
            label: "Histórico consecutivo",
            status: "unavailable",
            explanation: "Faltam dados.",
          },
        ],
      },
    },
  ],
};

describe("DiscoverDashboard", () => {
  it("shows source, period, criteria states and a path to individual analysis", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(payload)));
    render(<DiscoverDashboard />);
    expect(await screen.findByText("Empresa Exemplo")).toBeTruthy();
    expect(screen.getByText(/CVM DFP consolidada anual/)).toBeTruthy();
    expect(screen.getByText("Atendido")).toBeTruthy();
    expect(screen.getByText("Não atendido")).toBeTruthy();
    expect(screen.getByText("Indisponível")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "AAA3 · Analisar" })
        .getAttribute("href"),
    ).toBe("/analyses?ticker=AAA3");
    expect(screen.getByText(/empresas · ordem alfabética/)).toBeTruthy();
  });

  it("shows an explicit loading state", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
    render(<DiscoverDashboard />);
    expect(screen.getByText(/Carregando empresas e critérios/)).toBeTruthy();
  });

  it("links to data settings when the local screener has not been synchronized", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(response({ hasSuccessfulSync: false, results: [] })),
    );
    render(<DiscoverDashboard />);
    expect(
      await screen.findByText("A base ainda não foi sincronizada."),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Abrir Configurações" })
        .getAttribute("href"),
    ).toBe("/settings");
  });

  it("shows the synced empty state", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(response({ hasSuccessfulSync: true, results: [] })),
    );
    render(<DiscoverDashboard />);
    expect(
      await screen.findByText(
        "Nenhuma empresa está disponível na base para este estudo.",
      ),
    ).toBeTruthy();
  });

  it("shows a safe loading failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(response({ message: "Falha da consulta" }, false)),
    );
    render(<DiscoverDashboard />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Falha da consulta")).toBeTruthy();
  });
  it("shows fallback details when evidence fields are absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          hasSuccessfulSync: true,
          results: [
            {
              ...payload.results[0],
              sector: null,
              securities: [],
              assessment: {
                ...payload.results[0].assessment,
                period: null,
                criteria: [],
              },
            },
          ],
        }),
      ),
    );
    render(<DiscoverDashboard />);
    expect(await screen.findByText(/Setor não informado/)).toBeTruthy();
    expect(screen.getByText(/Período comparável indisponível/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Analisar/ })).toBeNull();
  });

  it("uses a generic message for a non-Error request failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue("offline"));
    render(<DiscoverDashboard />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(
      screen.getByText("Não foi possível carregar empresas para estudo agora."),
    ).toBeTruthy();
  });

  it("ignores a resolved request after unmount", async () => {
    let resolveResponse!: (
      value: Promise<{ ok: boolean; json: () => Promise<unknown> }>,
    ) => void;
    const pending = new Promise<{ ok: boolean; json: () => Promise<unknown> }>(
      (resolve) => {
        resolveResponse = resolve;
      },
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(() => pending),
    );
    const { unmount } = render(<DiscoverDashboard />);
    unmount();
    resolveResponse(response(payload));
    await Promise.resolve();
    await Promise.resolve();
    expect(document.body.textContent).toBe("");
  });
  it("ignores a rejected request after unmount", async () => {
    let rejectRequest!: (reason?: unknown) => void;
    const pending = new Promise<never>((_, reject) => {
      rejectRequest = reject;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => pending),
    );
    const { unmount } = render(<DiscoverDashboard />);
    unmount();
    rejectRequest(new Error("late failure"));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(document.body.textContent).toBe("");
  });
});
