/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScreenerDashboard } from "@/app/analyses/_components/screener-dashboard";

const company = {
  cnpj: "33000167000101",
  cvmCode: "9512",
  name: "Petrobras",
  sector: "Petróleo",
  quantitativeEligible: true,
  securities: [
    { ticker: "PETR3", name: "Petrobras ON" },
    { ticker: "PETR4", name: "Petrobras PN" },
  ],
  metrics: {
    latestNetIncome: 100,
    latestRevenue: 500,
    latestEquity: 400,
    roe: 25,
    netMargin: 20,
    pe: null,
    pb: null,
    positiveProfitYears: 3,
  },
};
const counts = {
  issuers: 1,
  withPositiveProfit: 1,
  withEquity: 1,
  withRoe: 1,
  withNetMargin: 1,
  withPe: 0,
  withPb: 0,
};
const response = (body: unknown, ok = true) =>
  Promise.resolve({
    ok,
    json: () =>
      Promise.resolve(
        typeof body === "object" &&
          body !== null &&
          !("hasSuccessfulSync" in body)
          ? { ...body, hasSuccessfulSync: true }
          : body,
      ),
  });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ScreenerDashboard", () => {
  it("loads the local universe, shows issuer metrics, links all classes, and disables unsafe valuation filters", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ results: [company], counts }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ScreenerDashboard />);

    expect(await screen.findByText("Petrobras")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/screener", {
      cache: "no-store",
    });
    expect(
      screen
        .getByRole("link", { name: "PETR3 · Analisar" })
        .getAttribute("href"),
    ).toBe("/analyses?ticker=PETR3");
    expect(
      screen
        .getByRole("link", { name: "PETR4 · Analisar" })
        .getAttribute("href"),
    ).toBe("/analyses?ticker=PETR4");
    expect(screen.getByText("25%")).toBeTruthy();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(
      screen
        .getByRole("spinbutton", { name: "P/L máximo" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen
        .getByRole("spinbutton", { name: "P/VP máximo" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.getByText(/1 de 1 emissores/)).toBeTruthy();
  });

  it("combines entered filters and submits them to the local API", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ results: [company], counts }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ScreenerDashboard />);
    await screen.findByText("Petrobras");

    await user.type(
      screen.getByRole("spinbutton", {
        name: "Lucro positivo nos últimos N exercícios",
      }),
      "3",
    );
    await user.click(
      screen.getByRole("checkbox", { name: "Patrimônio líquido positivo" }),
    );
    await user.type(
      screen.getByRole("spinbutton", { name: "ROE mínimo (%)" }),
      "10",
    );
    await user.type(
      screen.getByRole("spinbutton", { name: "Margem líquida mínima (%)" }),
      "5",
    );
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/screener?positiveProfitYears=3&equityPositive=true&minimumRoe=10&minimumNetMargin=5",
        { cache: "no-store" },
      ),
    );
  });

  it("enables P/L and P/VP only when valid snapshots exist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          results: [
            { ...company, metrics: { ...company.metrics, pe: 8, pb: 1.5 } },
          ],
          counts: { ...counts, withPe: 1, withPb: 1 },
        }),
      ),
    );
    render(<ScreenerDashboard />);
    await screen.findByText("Petrobras");
    expect(
      screen
        .getByRole("spinbutton", { name: "P/L máximo" })
        .hasAttribute("disabled"),
    ).toBe(false);
    expect(
      screen
        .getByRole("spinbutton", { name: "P/VP máximo" })
        .hasAttribute("disabled"),
    ).toBe(false);
  });

  it("applies valuation limits only when their inputs are enabled", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        results: [
          { ...company, metrics: { ...company.metrics, pe: 8, pb: 1.5 } },
        ],
        counts: { ...counts, withPe: 1, withPb: 1 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ScreenerDashboard />);
    await screen.findByText("Petrobras");

    await user.type(
      screen.getByRole("spinbutton", { name: "P/L máximo" }),
      "12",
    );
    await user.type(
      screen.getByRole("spinbutton", { name: "P/VP máximo" }),
      "2",
    );
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/screener?maximumPe=12&maximumPb=2",
        { cache: "no-store" },
      ),
    );
  });

  it("keeps unvalidated financial-sector issuers browsable without quantitative metrics", async () => {
    const bank = {
      ...company,
      name: "Banco Teste",
      sector: "Bancos",
      quantitativeEligible: false,
      metrics: {
        latestNetIncome: null,
        latestRevenue: null,
        latestEquity: null,
        roe: null,
        netMargin: null,
        pe: null,
        pb: null,
        positiveProfitYears: 0,
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          results: [bank],
          counts: { ...counts, withRoe: 0, withNetMargin: 0, withEquity: 0 },
        }),
      ),
    );
    render(<ScreenerDashboard />);
    expect(await screen.findByText("Banco Teste")).toBeTruthy();
    expect(
      screen.getByText(
        "Fundamentos quantitativos indisponíveis para este setor.",
      ),
    ).toBeTruthy();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(5);
  });

  it("shows the load error when the local API returns a non-success status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({}, false)));
    render(<ScreenerDashboard />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(
      screen.getByText(
        "Não foi possível consultar a base sincronizada. Tente novamente.",
      ),
    ).toBeTruthy();
  });

  it("ignores a failed initial response after unmount", async () => {
    let resolveResponse!: (value: {
      ok: boolean;
      json: () => Promise<unknown>;
    }) => void;
    const pendingResponse = new Promise<{
      ok: boolean;
      json: () => Promise<unknown>;
    }>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = vi.fn(() => pendingResponse);
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = render(<ScreenerDashboard />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    unmount();
    resolveResponse({ ok: false, json: () => Promise.resolve({}) });
    await Promise.resolve();
    await Promise.resolve();
    expect(document.body.textContent).toBe("");
  });

  it("ignores a successful initial response after unmount", async () => {
    let resolveBody!: (value: unknown) => void;
    const pendingBody = new Promise<unknown>((resolve) => {
      resolveBody = resolve;
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => pendingBody,
    });
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = render(<ScreenerDashboard />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    unmount();
    resolveBody({ results: [company], counts });
    await Promise.resolve();
    await Promise.resolve();
    expect(document.body.textContent).toBe("");
  });

  it("shows an error when applying filters fails", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ results: [company], counts }))
      .mockResolvedValueOnce(response({}, false));
    vi.stubGlobal("fetch", fetchMock);
    render(<ScreenerDashboard />);
    const applyButton = screen.getByRole("button", { name: "Aplicar filtros" });
    await waitFor(() =>
      expect(applyButton.hasAttribute("disabled")).toBe(false),
    );
    await user.click(applyButton);
    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("shows an empty state when no company matches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ results: [], counts })),
    );
    render(<ScreenerDashboard />);
    expect(
      await screen.findByText("Nenhuma empresa corresponde aos filtros."),
    ).toBeTruthy();
    expect(screen.getByText(/Ajuste ou limpe/)).toBeTruthy();
  });

  it("distinguishes an empty universe from filters with no matches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          results: [],
          counts: { ...counts, issuers: 0 },
          hasSuccessfulSync: false,
        }),
      ),
    );
    render(<ScreenerDashboard />);
    expect(
      await screen.findByText("Dados do Screener ainda não sincronizados."),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Ir para Configurações" })
        .getAttribute("href"),
    ).toBe("/settings");
  });
  it("omits blank numeric filters, clears the equity toggle, and renders missing sectors", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        results: [{ ...company, sector: null }],
        counts,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ScreenerDashboard />);
    expect(await screen.findByText("CVM 9512")).toBeTruthy();

    const roe = screen.getByRole("spinbutton", { name: "ROE mínimo (%)" });
    await user.type(roe, "10");
    await user.clear(roe);
    const equity = screen.getByRole("checkbox", {
      name: "Patrimônio líquido positivo",
    });
    await user.click(equity);
    await user.click(equity);
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith("/api/screener", {
      cache: "no-store",
    });
  });

  it("reports load failures and retries the same local query", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(response({ results: [company], counts }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ScreenerDashboard />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("Petrobras")).toBeTruthy();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/screener", {
      cache: "no-store",
    });
  });

  it("clears applied filters and reloads the unfiltered universe", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ results: [company], counts }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ScreenerDashboard />);
    await screen.findByText("Petrobras");
    const profitYears = screen.getByRole("spinbutton", {
      name: "Lucro positivo nos últimos N exercícios",
    });
    await user.type(profitYears, "2");
    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith("/api/screener", {
        cache: "no-store",
      }),
    );
    expect((profitYears as HTMLInputElement).value).toBe("");
  });
});
