/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
      assessment: {
        sectorClassification: "non_financial",
        methodologyStatus: "evaluated",
        methodologyMessage:
          "Setor classificado como não financeiro para a metodologia atual.",
        period: "2025-12-31",
        source: "CVM DFP consolidada anual",
        sectorComparability: "not_validated",
        dimensions: [
          {
            id: "results",
            label: "Resultados",
            status: "available",
            explanation: "Histórico anual.",
          },
          {
            id: "profitability",
            label: "Rentabilidade",
            status: "available",
            explanation:
              "O status desta dimensão indica apenas a disponibilidade do ROE. A margem líquida aparece em Resultados.",
          },
          {
            id: "cash",
            label: "Caixa",
            status: "unavailable",
            explanation:
              "Esta dimensão indica a disponibilidade do fluxo de caixa operacional bruto da conta 6.01 da DFC-MI. A comparação com o lucro só fica disponível quando data, versão e pacote coincidem; nos demais casos, permanece indisponível.",
          },
          {
            id: "financial_structure",
            label: "Estrutura financeira",
            status: "unavailable",
            explanation: "Contas em validação.",
          },
          {
            id: "capital",
            label: "Capital",
            status: "available",
            explanation: "Patrimônio anual.",
          },
        ],
        evidence: [
          {
            year: 2025,
            revenuePeriod: "2025-12-31",
            netIncomePeriod: "2025-12-31",
            equityPeriod: "2025-12-31",
            equityVersion: 2,
            equityPackageYear: 2025,
            equityOpeningPeriod: "2024-12-31",
            equityOpeningVersion: 4,
            equityOpeningPackageYear: 2025,
            revenueVersion: 2,
            revenuePackageYear: null,
            netIncomeVersion: 2,
            netIncomePackageYear: 2025,
            operatingCashFlowPeriod: null,
            operatingCashFlowVersion: null,
            operatingCashFlowPackageYear: null,
            operatingCashFlowComparableToNetIncome: null,
            sectorClassification: "non_financial",
            methodologyStatus: "evaluated",
            methodologyMessage:
              "Setor classificado como não financeiro para a metodologia atual.",
            period: "2025-12-31",
            revenue: 100,
            netIncome: 20,
            equity: 50,
            netMargin: null,
            roe: 40,
            operatingCashFlow: null,
          },
        ],
      },
    },
  ],
};
const payloadWithCashComparison = (comparable: boolean | null) => ({
  ...payload,
  results: payload.results.map((result) => ({
    ...result,
    assessment: {
      ...result.assessment,
      evidence: result.assessment.evidence.map((point) => ({
        ...point,
        operatingCashFlow: 125,
        operatingCashFlowPeriod: "2025-12-31",
        operatingCashFlowPackageYear: 2025,
        operatingCashFlowVersion: 2,
        operatingCashFlowComparableToNetIncome: comparable,
      })),
    },
  })),
});
describe("DiscoverDashboard", () => {
  it("marks saved issuers and adds a new issuer by CNPJ", async () => {
    const user = userEvent.setup();
    const savedCompanyPayload = {
      ...payload,
      results: payload.results.map((company) => ({
        ...company,
        cnpj: "12345678000199",
      })),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(savedCompanyPayload))
      .mockResolvedValueOnce(
        response({ entries: [{ issuerCnpj: "99999999000199" }] }),
      )
      .mockResolvedValueOnce(response({ added: true }));
    vi.stubGlobal("fetch", fetchMock);
    render(<DiscoverDashboard />);
    expect(await screen.findByText("Empresa Exemplo")).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "Adicionar à Lista de estudo" }),
    );
    await user.type(
      screen.getByLabelText("Motivo da inclusão"),
      "Revisar o negócio",
    );
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(
      await screen.findByRole("button", { name: "Na Lista de estudo" }),
    ).toBeTruthy();
    expect(JSON.parse(fetchMock.mock.calls[2]![1].body as string)).toEqual({
      issuerCnpj: "12345678000199",
      companyName: "Empresa Exemplo",
      ticker: "AAA3",
      reason: "Revisar o negócio",
    });
  });
  it("leaves discovery usable when the saved-list lookup fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(payload))
      .mockResolvedValueOnce(
        response({ message: "Lista indisponível." }, false),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<DiscoverDashboard />);
    expect(await screen.findByText("Empresa Exemplo")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Adicionar à Lista de estudo" }),
    ).toBeTruthy();
  });
  it("keeps evidence visible and puts methodology details behind an accessible disclosure", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(payload)));
    render(<DiscoverDashboard />);
    expect(await screen.findByText("Empresa Exemplo")).toBeTruthy();
    expect(screen.getByText(/A cobertura é parcial/)).toBeTruthy();
    expect(
      screen.getByText(
        /dados anuais são apresentados conforme a disponibilidade para cada empresa/,
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Buscar empresas em Explorar" })
        .getAttribute("href"),
    ).toBe("/analyses/screener");
    expect(screen.getByText(/Comparabilidade setorial/)).toBeTruthy();
    expect(
      screen.getByText(
        /disponibilidade do ROE.*margem l.quida aparece em Resultados/,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /fluxo de caixa operacional bruto.*data, vers.o e pacote coincidem/,
      ),
    ).toBeTruthy();
    expect(screen.getByText(/CVM DFP consolidada anual/)).toBeTruthy();
    expect(screen.getAllByText("Evidências disponíveis")).toHaveLength(3);
    expect(screen.getAllByText("Indisponível")).toHaveLength(2);

    const methodology = screen.getByRole("button", {
      name: /Ver evid/,
      expanded: false,
    });
    methodology.focus();
    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("button", {
        name: /Ver evid/,
        expanded: true,
      }),
    ).toBeTruthy();
    expect(
      await screen.findByText(/Janela inicial de até cinco exercícios/),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /ROIC, diluição e estrutura financeira não integram esta versão/,
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "AAA3 · Analisar" })
        .getAttribute("href"),
    ).toBe("/analyses?ticker=AAA3");
    const equityEvidence = screen.getByText(/PL m/).parentElement;
    expect(equityEvidence?.textContent).toContain("pacote indisponível");
    expect(equityEvidence?.textContent).toContain("pacote 2025");
    expect(equityEvidence?.textContent).toContain(
      "Margem líquida Indisponível",
    );
    expect(screen.getByText(/Caixa operacional/).textContent).toContain(
      "Caixa operacional Indisponível",
    );
    expect(
      screen.getByText(
        /empresas na base · cobertura parcial · ordem alfabética/,
      ),
    ).toBeTruthy();
  });

  it.each([
    [null, /comparação com lucro indisponível/],
    [true, /mesma data, versão e pacote do lucro/],
    [false, /data, versão ou pacote incompatível com o lucro/],
  ])("explains cash comparison state %s", async (compatible, message) => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(response(payloadWithCashComparison(compatible))),
    );
    render(<DiscoverDashboard />);
    await user.click(
      await screen.findByRole("button", {
        name: /Ver evid/,
      }),
    );
    expect(await screen.findByText(message)).toBeTruthy();
  });

  it("shows an explicit loading state", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
    render(<DiscoverDashboard />);
    expect(
      screen.getByText(/Carregando empresas e evidências anuais/),
    ).toBeTruthy();
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
                sectorClassification: "unknown",
                methodologyStatus: "not_assessed",
                methodologyMessage:
                  "Setor ausente ou não mapeado; a metodologia não foi aplicada.",
                period: null,
                dimensions: [],
                evidence: [],
              },
            },
          ],
        }),
      ),
    );
    render(<DiscoverDashboard />);
    expect(await screen.findByText(/Setor não informado/)).toBeTruthy();
    expect(screen.getByText(/Setor ausente ou não mapeado/)).toBeTruthy();
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
