// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));
vi.mock("sonner", () => ({ toast }));

import {
  compareImportConfirmationOrder,
  PortfolioImport,
} from "@/components/portfolio-import";

describe("compareImportConfirmationOrder", () => {
  it("imports movements before positions and positions in date order", () => {
    const movement = {
      preview: { documentType: "B3_MOVEMENT_XLSX" as const },
    };
    const newerPosition = {
      preview: { documentType: "B3_POSITION_XLSX" as const },
      referenceDate: "2026-11-14",
    };
    const olderPosition = {
      preview: { documentType: "B3_POSITION_XLSX" as const },
      referenceDate: "2026-11-13",
    };

    expect(
      compareImportConfirmationOrder(movement, olderPosition),
    ).toBeLessThan(0);
    expect(
      compareImportConfirmationOrder(olderPosition, newerPosition),
    ).toBeLessThan(0);
  });

  it("keeps incomparable file types and positions without dates stable", () => {
    const positionWithoutDate = {
      preview: { documentType: "B3_POSITION_XLSX" as const },
    };
    const anotherPositionWithoutDate = {
      preview: { documentType: "B3_POSITION_XLSX" as const },
    };
    const trade = {
      preview: { documentType: "B3_TRADING_XLSX" as const },
    };

    expect(
      compareImportConfirmationOrder(
        positionWithoutDate,
        anotherPositionWithoutDate,
      ),
    ).toBe(0);
    expect(
      compareImportConfirmationOrder(trade, positionWithoutDate),
    ).toBeLessThan(0);
  });
});

const spreadsheet = (name: string) => new File(["xlsx"], name);
const positionPreview = {
  documentType: "B3_POSITION_XLSX",
  latestPositionReferenceDate: "2026-09-17",
  count: 1,
  positions: [
    {
      product: "ETF",
      quantity: "1",
      totalValue: "10",
      institution: "Corretora A",
      assetCode: "ETF1",
      indexer: null,
      unitPrice: "10",
      valuationSource: "FECHAMENTO",
    },
  ],
};
const movementPreview = {
  documentType: "B3_MOVEMENT_XLSX",
  count: 1,
  movements: [
    {
      occurredAt: "2026-09-18",
      movementType: "Compra",
      product: "CDB",
      quantity: "2",
      operationValue: "20",
    },
    {
      occurredAt: "2026-09-17",
      movementType: "Resgate",
      product: "CDB sem valor",
      quantity: "1",
      operationValue: null,
    },
  ],
};
const tradingPreview = {
  documentType: "B3_TRADING_XLSX",
  count: 2,
  trades: [
    {
      side: "BUY",
      tradingDate: "2026-10-14",
      settlementDate: null,
      movementType: "Compra",
      market: "Vista",
      product: "Ação ordinária",
      assetCode: "ABCD3",
      originalAssetCode: "ABCD3F",
      institution: "Corretora A",
      quantity: "10",
      unitPrice: "12.5",
      grossValue: "125",
      fees: null,
      sourceRow: 7,
    },
    {
      side: "SELL",
      tradingDate: "2026-10-15",
      settlementDate: null,
      movementType: "Venda",
      market: "Fracionário",
      product: "Ação ordinária",
      assetCode: "ABCD3",
      originalAssetCode: "ABCD3F",
      institution: null,
      quantity: "2",
      unitPrice: null,
      grossValue: null,
      fees: null,
      sourceRow: 8,
    },
  ],
  history: {
    complete: false,
    reasons: ["Taxas e liquidação não informadas."],
  },
  duplicateCandidates: [
    {
      identityFingerprint: "must-not-render",
      sourceRows: [7, 8],
      existingCount: 1,
      occurrenceCount: 3,
      status: "ambiguous",
    },
  ],
  reconciliation: {
    candidates: [],
    confirmed: [],
    ambiguous: [],
    unmatched: [],
  },
  batchReconciliationPending: true,
};
const reconciliationPair = {
  tradeId: "private-trade-id",
  movementId: "private-movement-id",
  trade: {
    sourceRow: 7,
    date: "2026-10-14",
    side: "BUY",
    ticker: "ABCD3",
    originalTicker: "ABCD3F",
    product: "Ação ordinária",
    institution: "Corretora A",
    quantity: "10",
    unitPrice: "12.5",
    value: "125",
  },
  movement: {
    sourceRow: 8,
    date: "2026-10-14",
    direction: "Crédito",
    movementType: "Transferência - Liquidação",
    ticker: "ABCD3",
    product: "Ação ordinária",
    institution: "Corretora A",
    quantity: "10",
    unitPrice: "12.5",
    value: "125",
  },
};

describe("PortfolioImport", () => {
  beforeEach(() => {
    toast.success.mockReset();
    toast.warning.mockReset();
    toast.error.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("links to the official B3 investor area and hides it in read-only support", () => {
    const { rerender } = render(<PortfolioImport />);
    const investorAreaLink = screen.getByRole("link", {
      name: /Investidor da B3/,
    });

    expect(investorAreaLink.getAttribute("href")).toBe(
      "https://www.investidor.b3.com.br/",
    );
    expect(investorAreaLink.getAttribute("target")).toBe("_blank");
    expect(investorAreaLink.getAttribute("rel")).toBe("noopener noreferrer");

    rerender(<PortfolioImport readOnly />);
    expect(screen.queryByRole("link", { name: /Investidor da B3/ })).toBeNull();
  });

  it("opens the file picker from the import action and ignores an empty selection", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const inputClick = vi.spyOn(HTMLInputElement.prototype, "click");
    const { container } = render(<PortfolioImport />);

    fireEvent.click(
      screen.getByRole("button", { name: "Importar arquivos XLSX" }),
    );
    expect(inputClick).toHaveBeenCalledOnce();

    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [] },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("blocks file selection and every preview mutation in read-only support", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...positionPreview,
        reconciliationCandidates: [
          {
            manualAssetKey: "manual:one",
            importedAssetKey: "b3:one",
            status: "probable",
            manualUpdatedAt: "2026-10-01T12:00:00Z",
            manualProduct: "Manual",
            importedProduct: "B3",
            manualAssetCode: null,
            importedAssetCode: "CERT-1",
            manualInstitution: null,
            manualValue: null,
            importedValue: "10",
            institution: null,
            reasons: ["missing_code"],
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetch);
    const { container, rerender } = render(<PortfolioImport readOnly />);
    const fileInput = container.querySelector('input[type="file"]')!;

    expect((fileInput as HTMLInputElement).disabled).toBe(true);
    expect(
      screen.queryByRole("button", { name: "Importar arquivos XLSX" }),
    ).toBeNull();
    fireEvent.change(fileInput, {
      target: { files: [spreadsheet("posicoes.xlsx")] },
    });
    expect(fetch).not.toHaveBeenCalled();

    rerender(<PortfolioImport />);
    fireEvent.change(fileInput, {
      target: { files: [spreadsheet("posicoes.xlsx")] },
    });
    expect(await screen.findByText("ETF")).toBeTruthy();
    rerender(<PortfolioImport readOnly />);

    expect(
      screen.queryByRole("button", { name: /Confirmar 1 arquivo/ }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancelar" })).toBeNull();
    expect(
      screen.queryByRole("textbox", { name: /^Data exibida na B3/ }),
    ).toBeNull();
    expect(
      screen
        .getByRole("button", { name: /como a mesma posição de Manual/i })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen
        .getByRole("button", {
          name: "Nenhuma posição da B3 corresponde a Manual",
        })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("previews every selected file automatically", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => positionPreview })
      .mockResolvedValueOnce({ ok: true, json: async () => movementPreview });
    vi.stubGlobal("fetch", fetch);
    const { container } = render(<PortfolioImport />);

    fireEvent.change(container.querySelector("input[type=file]")!, {
      target: {
        files: [spreadsheet("posicoes.xlsx"), spreadsheet("movimentos.xlsx")],
      },
    });

    expect(await screen.findByText("ETF")).toBeTruthy();
    expect(await screen.findByText("Compra")).toBeTruthy();
    expect(screen.getAllByText("18/09/2026")).toHaveLength(1);
    expect(screen.getByText(/20,00/)).toBeTruthy();
    fireEvent.change(
      screen.getByRole("textbox", { name: /^Data exibida na B3/ }),
      {
        target: { value: "18/09/2026" },
      },
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("shows the persisted date and enrichment explanation for an identical position file", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ...positionPreview,
          duplicateImportMessage:
            "Este arquivo idêntico já foi importado. Ao confirmar, o InvestLab verificará campos ausentes e não criará novas posições.",
          existingReferenceDate: "2026-09-30",
        }),
      }),
    );
    const { container } = render(<PortfolioImport />);

    fireEvent.change(container.querySelector("input[type=file]")!, {
      target: { files: [spreadsheet("posicoes-iguais.xlsx")] },
    });

    expect(await screen.findByText("Arquivo já importado")).toBeTruthy();
    expect(screen.getByText(/Data exibida na B3: 30\/09\/2026/)).toBeTruthy();
    expect(
      screen.queryByRole("textbox", { name: /^Data exibida na B3/ }),
    ).toBeNull();
  });
  it("lets a user choose the B3 date for a duplicate legacy snapshot with both dates missing", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...positionPreview,
          duplicateImportMessage:
            "Este arquivo idêntico já foi importado. Ao confirmar, os campos ausentes serão enriquecidos.",
          existingReferenceDate: null,
          referenceDateNeedsSelection: true,
          referenceDateConflict: false,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: "Data registrada no snapshot legado." }),
      });
    vi.stubGlobal("fetch", fetch);
    const { container } = render(<PortfolioImport />);

    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [spreadsheet("posicoes-legadas.xlsx")] },
    });

    expect(
      await screen.findByText("Data ausente no snapshot legado"),
    ).toBeTruthy();
    const confirmButton = await screen.findByRole("button", {
      name: /Confirmar 1 arquivo/,
    });
    expect(confirmButton).toHaveProperty("disabled", true);
    fireEvent.change(
      screen.getByRole("textbox", { name: /^Data exibida na B3/ }),
      { target: { value: "30/09/2026" } },
    );
    expect(confirmButton).toHaveProperty("disabled", false);
    fireEvent.click(confirmButton);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const confirmBody = fetch.mock.calls[1]?.[1]?.body as FormData;
    expect(confirmBody.get("referenceDate")).toBe("2026-09-30");
  });
  it("blocks confirmation when the duplicate's import and snapshot dates conflict", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ...positionPreview,
          duplicateImportMessage: "Este arquivo idêntico já foi importado.",
          existingReferenceDate: null,
          referenceDateNeedsSelection: false,
          referenceDateConflict: true,
        }),
      }),
    );
    const { container } = render(<PortfolioImport />);

    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [spreadsheet("posicoes-com-datas-divergentes.xlsx")] },
    });

    expect(await screen.findByText("Datas inconsistentes")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Confirmar 1 arquivo/ }),
    ).toHaveProperty("disabled", true);
  });
  it("renders movement previews with the shared table component", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => movementPreview }),
    );
    const { container } = render(<PortfolioImport />);

    fireEvent.change(container.querySelector("input[type=file]")!, {
      target: { files: [spreadsheet("movimentos.xlsx")] },
    });

    const table = await screen.findByRole("table", {
      name: "Prévia de movimentações",
    });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getByText("Compra")).toBeTruthy();
    expect(within(table).getAllByText("—").length).toBeGreaterThan(0);
  });
  it("shows complete position details and reconciles the recognized total", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          documentType: "B3_POSITION_XLSX",
          count: 2,
          positions: [
            {
              product: "CDB Banco A",
              quantity: "1000",
              totalValue: "1000.5",
              institution: "Banco A",
              assetCode: "CDB1",
              indexer: "CDI",
              unitPrice: "1.0005",
              valuationSource: "CURVA",
            },
            {
              product: "Posição sem valor",
              quantity: "2",
              totalValue: null,
              institution: "Banco B",
              assetCode: "SEMVALOR",
              indexer: null,
              unitPrice: null,
              valuationSource: null,
            },
          ],
        }),
      }),
    );
    const { container } = render(<PortfolioImport />);

    fireEvent.change(container.querySelector("input[type=file]")!, {
      target: { files: [spreadsheet("posicoes.xlsx")] },
    });

    expect(
      await screen.findByRole("textbox", {
        name: /^Data exibida na B3/,
      }),
    ).toBeTruthy();
    expect(screen.getAllByText("R$ 1.000,50")).toHaveLength(3);
    expect(screen.getByText("Banco A")).toBeTruthy();
    expect(screen.getByText("CDB1")).toBeTruthy();
    expect(screen.getByText("CDI")).toBeTruthy();
    expect(screen.getByText("CURVA")).toBeTruthy();
    expect(screen.getByText("Total parcial")).toBeTruthy();
    expect(
      screen.getByText(/sem valor total não foram incluídas/),
    ).toBeTruthy();
    expect(
      screen.getByRole("columnheader", { name: "Valor total" }),
    ).toBeTruthy();
  });
  it("toasts API preview messages without repeating operational details inline", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ message: "Arquivo inválido" }),
        })
        .mockRejectedValueOnce("network"),
    );
    const { container } = render(<PortfolioImport />);

    fireEvent.change(container.querySelector("input[type=file]")!, {
      target: {
        files: [spreadsheet("invalido.xlsx"), spreadsheet("offline.xlsx")],
      },
    });

    expect(
      await screen.findByText("invalido.xlsx: Prévia indisponível."),
    ).toBeTruthy();
    expect(screen.getByText("offline.xlsx: Prévia indisponível.")).toBeTruthy();
    expect(screen.queryByText("Arquivo inválido")).toBeNull();
    expect(toast.error).toHaveBeenCalledWith(
      "invalido.xlsx: Arquivo inválido · offline.xlsx: Não foi possível comunicar com o servidor.",
    );
  });

  it("shows success, clears previews, and notifies the portfolio after confirmation", async () => {
    const portfolioUpdated = vi.fn();
    window.addEventListener("portfolio:updated", portfolioUpdated);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => positionPreview })
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) }),
    );
    const { container } = render(<PortfolioImport />);

    fireEvent.change(container.querySelector("input[type=file]")!, {
      target: { files: [spreadsheet("posicoes.xlsx")] },
    });
    fireEvent.change(
      await screen.findByRole("textbox", {
        name: /^Data exibida na B3/,
      }),
      {
        target: { value: "18/09/2026" },
      },
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /Confirmar 1 arquivo/ }),
    );

    await waitFor(() => expect(portfolioUpdated).toHaveBeenCalledOnce());
    expect(toast.success).toHaveBeenCalledWith("Atualização concluída.");
    expect(screen.getByRole("alert").textContent).toContain(
      "snapshot de posição mais recente",
    );
    expect(screen.queryByText("ETF")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Import");
    expect(screen.queryByText(/prévia aparecer/i)).toBeNull();
    window.removeEventListener("portfolio:updated", portfolioUpdated);
  });

  it("summarizes plural movement and trade files after a successful batch", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => movementPreview,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => movementPreview,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => tradingPreview,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => tradingPreview,
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [],
          confirmed: [],
          ambiguous: [],
          separated: [],
          unmatched: [],
          duplicateCandidates: [],
          movementDuplicateCandidates: [],
          history: { complete: true, reasons: [] },
        }),
      });
    vi.stubGlobal("fetch", fetch);
    const { container } = render(<PortfolioImport />);

    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: {
        files: [
          spreadsheet("movimentacao-1.xlsx"),
          spreadsheet("movimentacao-2.xlsx"),
          spreadsheet("negociacao-1.xlsx"),
          spreadsheet("negociacao-2.xlsx"),
        ],
      },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: /Confirmar 4 arquivo/ }),
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(9));
    const summary = screen.getByText(/Processamento concluído:/).textContent;
    expect(summary).toContain(
      "2 arquivos de movimentação processados (4 linhas analisadas)",
    );
    expect(summary).toContain(
      "2 arquivos de negociação processados (4 linhas analisadas)",
    );
  });

  it("confirms same-type position snapshots from oldest to newest", async () => {
    const firstPreview = {
      ...positionPreview,
      latestPositionReferenceDate: null,
      identityConflicts: [],
    };
    const secondPreview = {
      ...positionPreview,
      latestPositionReferenceDate: null,
      identityConflicts: [],
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => firstPreview })
      .mockResolvedValueOnce({ ok: true, json: async () => secondPreview })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetch);
    const { container } = render(<PortfolioImport />);
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: {
        files: [
          spreadsheet("mais-recente.xlsx"),
          spreadsheet("mais-antigo.xlsx"),
        ],
      },
    });

    const dateInputs = await screen.findAllByRole("textbox", {
      name: /^Data exibida na B3/,
    });
    fireEvent.change(dateInputs[0]!, { target: { value: "18/09/2026" } });
    fireEvent.change(dateInputs[1]!, { target: { value: "17/09/2026" } });
    fireEvent.click(
      screen.getByRole("button", { name: /Confirmar 2 arquivo/ }),
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    const confirmedNames = fetch.mock.calls.slice(2).map(([, init]) => {
      const body = init?.body as FormData;
      return (body.get("file") as File).name;
    });
    expect(confirmedNames).toEqual(["mais-antigo.xlsx", "mais-recente.xlsx"]);
  });

  it("imports batch movements before position snapshots", async () => {
    const datedPositionPreview = {
      ...positionPreview,
      latestPositionReferenceDate: null,
      identityConflicts: [],
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => datedPositionPreview,
      })
      .mockResolvedValueOnce({ ok: true, json: async () => movementPreview })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetch);
    const { container } = render(<PortfolioImport />);
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: {
        files: [
          spreadsheet("posicoes.xlsx"),
          spreadsheet("movimentacoes.xlsx"),
        ],
      },
    });
    fireEvent.change(
      await screen.findByRole("textbox", { name: /^Data exibida na B3/ }),
      { target: { value: "18/09/2026" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Confirmar 2 arquivo/ }),
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    const confirmedNames = fetch.mock.calls.slice(2).map(([, init]) => {
      const body = init?.body as FormData;
      return (body.get("file") as File).name;
    });
    expect(confirmedNames).toEqual(["movimentacoes.xlsx", "posicoes.xlsx"]);
  });

  it("uses the one B3 date for the import and does not send a separate base date", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => positionPreview })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetch);
    const { container } = render(<PortfolioImport />);

    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [spreadsheet("posicoes.xlsx")] },
    });
    fireEvent.change(
      await screen.findByRole("textbox", {
        name: /^Data exibida na B3/,
      }),
      {
        target: { value: "18/09/2026" },
      },
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /Confirmar 1 arquivo/ }),
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const confirmBody = fetch.mock.calls[1]?.[1]?.body as FormData;
    expect(confirmBody.get("referenceDate")).toBe("2026-09-18");
    expect(confirmBody.has("estimationBaseDate")).toBe(false);
  });

  it("explains the full-redemption rule and does not ask for manual retirement decisions", async () => {
    const preview = {
      ...positionPreview,
      identityConflicts: [
        {
          assetKey: "v1:assigned-position",
          objectiveId: "goal-trip",
          objectiveName: "Viagem",
          position: {
            product: "CDB Banco A",
            institution: "Banco A",
            assetCode: "CDB1",
            quantity: "1",
            totalValue: "100",
            indexer: "CDI",
            unitPrice: "100",
            valuationSource: "CURVA" as const,
          },
          matchingRedemptions: [
            {
              occurredAt: "2026-10-29",
              movementType: null,
              quantity: "35",
              operationValue: "445.42",
            },
          ],
        },
        {
          assetKey: "v1:second-assigned-position",
          objectiveId: "goal-reserve",
          objectiveName: "Reserva",
          position: {
            product: "CDB Banco B",
            institution: "Banco B",
            assetCode: "CDB2",
            quantity: "1",
            totalValue: "100",
            indexer: "CDI",
            unitPrice: "100",
            valuationSource: "CURVA" as const,
          },
          matchingRedemptions: [],
        },
      ],
    };
    const fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => preview });
    vi.stubGlobal("fetch", fetch);
    const { container } = render(<PortfolioImport />);

    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [spreadsheet("posicoes.xlsx")] },
    });
    expect(await screen.findByText(/CDB Banco A — Viagem/)).toBeTruthy();
    fireEvent.change(
      await screen.findByRole("textbox", {
        name: /^Data exibida na B3/,
      }),
      { target: { value: "13/11/2026" } },
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Vínculos sob revisão automática",
    );
    expect(screen.getByRole("status").textContent).toContain(
      "só encerrará um vínculo",
    );
    expect(screen.getByRole("status").textContent).toContain(
      "não alteram os valores do snapshot",
    );
    expect(
      screen.getByText(/O extrato registra uma saída em 29\/10\/2026/),
    ).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
    const confirmButton = screen.getByRole("button", {
      name: /Confirmar 1 arquivo/,
    });
    expect(confirmButton).toHaveProperty("disabled", false);
    fireEvent.click(confirmButton);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const confirmBody = fetch.mock.calls[1]?.[1]?.body as FormData;
    expect(confirmBody.has("retiredObjectiveAssignments")).toBe(false);
  });

  it("deduplicates redemption evidence shared by a position preview and its movement batch", async () => {
    const redemption = {
      occurredAt: "2026-10-29",
      movementType: "RESGATE TOTAL",
      quantity: "1",
      operationValue: "100",
      institution: "Banco A",
    };
    const positionWithConflict = {
      ...positionPreview,
      latestPositionReferenceDate: "2026-10-28",
      identityConflicts: [
        {
          assetKey: "v1:assigned-position",
          objectiveId: "goal-trip",
          objectiveName: "Viagem",
          position: {
            product: "CDB Banco A",
            institution: "Banco A",
            assetCode: "CDB1",
            quantity: "1",
            totalValue: "100",
            unitPrice: "100",
            valuationSource: "CURVA" as const,
          },
          matchingRedemptions: [redemption],
        },
      ],
    };
    const movementBatch = {
      ...movementPreview,
      movements: [
        {
          direction: "DEBITO",
          occurredAt: redemption.occurredAt,
          movementType: redemption.movementType,
          product: "CDB Banco A",
          assetCode: "CDB1",
          institution: "Banco A",
          quantity: redemption.quantity,
          operationValue: redemption.operationValue,
        },
      ],
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => positionWithConflict,
      })
      .mockResolvedValueOnce({ ok: true, json: async () => movementBatch });
    vi.stubGlobal("fetch", fetch);
    const { container } = render(<PortfolioImport />);

    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: {
        files: [
          spreadsheet("posicoes.xlsx"),
          spreadsheet("movimentacoes.xlsx"),
        ],
      },
    });

    expect(await screen.findByText(/CDB Banco A — Viagem/)).toBeTruthy();
    fireEvent.change(
      screen.getByRole("textbox", { name: /^Data exibida na B3/ }),
      { target: { value: "30/10/2026" } },
    );
    expect(
      screen.getAllByText(/O extrato registra RESGATE TOTAL em/),
    ).toHaveLength(1);
  });

  it("shows a missing assignment without blocking after the snapshot date is set", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ...positionPreview,
          identityConflicts: [
            {
              assetKey: "v1:assigned-position",
              objectiveId: "goal-reserve",
              objectiveName: "Reserva",
              position: {
                product: "CDB antigo",
                institution: null,
                assetCode: null,
                quantity: "1",
                totalValue: "100",
                indexer: "CDI",
                unitPrice: "100",
                valuationSource: "CURVA",
              },
              matchingRedemptions: [],
            },
          ],
        }),
      }),
    );
    const { container } = render(<PortfolioImport />);

    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [spreadsheet("posicoes.xlsx")] },
    });

    expect(await screen.findByText(/CDB antigo — Reserva/)).toBeTruthy();
    expect(screen.getByText("Código não informado")).toBeTruthy();
    expect(screen.queryByText(/Possível posição correspondente/)).toBeNull();
    const confirmButton = screen.getByRole("button", {
      name: /Confirmar 1 arquivo/,
    });
    expect(confirmButton).toHaveProperty("disabled", true);
    fireEvent.change(
      await screen.findByRole("textbox", { name: /^Data exibida na B3/ }),
      { target: { value: "18/09/2026" } },
    );
    expect(confirmButton).toHaveProperty("disabled", false);
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("preserves links for historical snapshots and hides later redemption evidence", async () => {
    const preview = {
      ...positionPreview,
      latestPositionReferenceDate: "2026-11-12",
      identityConflicts: [
        {
          assetKey: "v1:assigned-position",
          objectiveId: "goal-trip",
          objectiveName: "Viagem",
          position: {
            product: "CDB antigo",
            institution: "Banco A",
            assetCode: "CDB1",
          },
          matchingRedemptions: [
            {
              occurredAt: "2026-11-12",
              movementType: "RESGATE ANTIGO",
              quantity: "1",
              operationValue: "90",
            },
            {
              occurredAt: "2026-11-14",
              movementType: "RESGATE",
              quantity: "1",
              operationValue: null,
            },
            {
              occurredAt: "2026-11-16",
              movementType: "RESGATE FUTURO",
              quantity: "1",
              operationValue: "110",
            },
          ],
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => preview }),
    );
    const { container } = render(<PortfolioImport />);
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [spreadsheet("historico.xlsx")] },
    });
    expect(await screen.findByText(/CDB antigo — Viagem/)).toBeTruthy();
    const dateInput = await screen.findByRole("textbox", {
      name: /^Data exibida na B3/,
    });
    fireEvent.change(dateInput, { target: { value: "10/11/2026" } });
    expect(screen.getByRole("status").textContent).toContain(
      "Snapshot histórico: vínculos preservados",
    );
    expect(screen.queryByText(/O extrato registra .* em/)).toBeNull();
    fireEvent.change(dateInput, { target: { value: "15/11/2026" } });
    expect(screen.getByRole("status").textContent).toContain(
      "Vínculos sob revisão automática",
    );
    expect(screen.getByRole("status").textContent).toContain(
      "O sistema só encerra o vínculo se comprovar o resgate total",
    );
    expect(screen.queryByText(/RESGATE ANTIGO/)).toBeNull();
    expect(screen.queryByText(/RESGATE FUTURO/)).toBeNull();
  });

  it("explains why a snapshot from the same date preserves objective links", async () => {
    const preview = {
      ...positionPreview,
      latestPositionReferenceDate: "2026-09-17",
      identityConflicts: [
        {
          assetKey: "v1:assigned-position",
          objectiveId: "goal-trip",
          objectiveName: "Viagem",
          position: {
            product: "CDB antigo",
            institution: "Banco A",
            assetCode: "CDB1",
          },
          matchingRedemptions: [],
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => preview }),
    );
    const { container } = render(<PortfolioImport />);
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [spreadsheet("mesma-data.xlsx")] },
    });

    expect(await screen.findByText(/CDB antigo — Viagem/)).toBeTruthy();
    fireEvent.change(
      await screen.findByRole("textbox", { name: /^Data exibida na B3/ }),
      { target: { value: "17/09/2026" } },
    );

    expect(screen.getByRole("status").textContent).toContain(
      "Snapshot da mesma data: vínculos preservados",
    );
    expect(screen.getByRole("status").textContent).toContain(
      "não é mais recente que a posição atual",
    );
  });

  it("keeps links when a duplicate import has no selected snapshot date", async () => {
    const preview = {
      ...positionPreview,
      latestPositionReferenceDate: null,
      duplicateImportMessage: "Este arquivo já foi importado.",
      identityConflicts: [
        {
          assetKey: "v1:assigned-position",
          objectiveId: "goal-trip",
          objectiveName: "Viagem",
          position: {
            product: "CDB antigo",
            institution: "Banco A",
            assetCode: "CDB1",
          },
          matchingRedemptions: [],
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => preview }),
    );
    const { container } = render(<PortfolioImport />);
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [spreadsheet("duplicado.xlsx")] },
    });
    expect(await screen.findByText(/CDB antigo — Viagem/)).toBeTruthy();
    expect(screen.getByText("Data exibida na B3: não informada")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "Arquivo já importado: vínculos preservados",
    );
    expect(screen.getByRole("status").textContent).toContain(
      "A confirmação deste arquivo não encerra vínculos de objetivos.",
    );
    expect(
      screen.getByRole("button", { name: /Confirmar 1 arquivo/ }),
    ).toHaveProperty("disabled", true);
  });

  it("explains that assignments are preserved when the latest snapshot is undated", async () => {
    const preview = {
      ...positionPreview,
      latestPositionReferenceDate: null,
      identityConflicts: [
        {
          assetKey: "v1:assigned-position",
          objectiveId: "goal-trip",
          objectiveName: "Viagem",
          position: {
            product: "CDB antigo",
            institution: "Banco A",
            assetCode: "CDB1",
          },
          matchingRedemptions: [],
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => preview }),
    );
    const { container } = render(<PortfolioImport />);
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [spreadsheet("sem-data.xlsx")] },
    });
    expect(await screen.findByText(/CDB antigo — Viagem/)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "Vínculos preservados: data atual indisponível",
    );
    expect(screen.getByRole("status").textContent).toContain(
      "A data do snapshot atual não está disponível para comparação.",
    );
  });

  it("correlates an exact redemption from another file in the uploaded batch", async () => {
    const preview = {
      ...positionPreview,
      latestPositionReferenceDate: "2026-11-12",
      identityConflicts: [
        {
          assetKey: "v1:assigned-position",
          objectiveId: "goal-trip",
          objectiveName: "Viagem",
          position: {
            product: "CDB antigo",
            institution: "Banco A",
            assetCode: "CDB1",
          },
          matchingRedemptions: [
            {
              occurredAt: "2026-11-14",
              movementType: "RESGATE ANTECIPADO",
              quantity: "1",
              operationValue: "100",
            },
          ],
        },
      ],
    };
    const batchMovementPreview = {
      documentType: "B3_MOVEMENT_XLSX",
      count: 3,
      movements: [
        {
          occurredAt: "2026-11-14",
          movementType: "RESGATE ANTECIPADO",
          product: "CDB - CDB1",
          assetCode: "CDB1",
          direction: "DEBITO",
          institution: "Banco A",
          quantity: "1",
          operationValue: "100",
        },
        {
          occurredAt: "2026-11-14",
          movementType: null,
          product: "Movimento sem tipo",
          assetCode: "CDB1",
          direction: "DEBITO",
          institution: "Banco A",
          quantity: "1",
          operationValue: "100",
        },
        {
          occurredAt: "2026-11-15",
          movementType: "RESGATE TOTAL",
          product: "CDB - CDB1",
          assetCode: "CDB1",
          direction: "DEBITO",
          institution: "Banco A",
          quantity: "1",
          operationValue: "200",
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => preview })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => batchMovementPreview,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: "Movimentações importadas." }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: "Posições importadas." }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<PortfolioImport />);
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: {
        files: [spreadsheet("posicao.xlsx"), spreadsheet("movimentacao.xlsx")],
      },
    });
    expect(await screen.findByText(/CDB antigo — Viagem/)).toBeTruthy();
    const dateInput = await screen.findByRole("textbox", {
      name: /^Data exibida na B3/,
    });
    fireEvent.change(dateInput, { target: { value: "13/11/2026" } });
    expect(screen.getByRole("status").textContent).toContain(
      "O sistema vai conferir as saídas compatíveis",
    );
    fireEvent.change(dateInput, { target: { value: "15/11/2026" } });
    expect(screen.getByRole("status").textContent).toContain(
      "O extrato registra RESGATE TOTAL em 15/11/2026",
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Confirmar 2 arquivo/ }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    const confirmationOrder = fetchMock.mock.calls
      .filter(([url]) => url === "/api/imports/confirm")
      .map(([, init]) => ((init?.body as FormData).get("file") as File).name);
    expect(confirmationOrder).toEqual(["movimentacao.xlsx", "posicao.xlsx"]);
  });

  it("confirms multiple snapshots without per-position retirement acknowledgements", async () => {
    const firstIdentityPreview = {
      ...positionPreview,
      identityConflicts: [
        {
          assetKey: "v1:first-assigned-position",
          objectiveId: "goal-trip",
          objectiveName: "Viagem",
          position: {
            product: "CDB antigo",
            institution: "Banco A",
            assetCode: "CDB1",
            quantity: "1",
            totalValue: "100",
            indexer: "CDI",
            unitPrice: "100",
            valuationSource: "CURVA" as const,
          },
          possibleIncomingDifferences: [
            {
              position: {
                product: "CDB antigo",
                institution: "Banco C",
                assetCode: "CDB3",
                quantity: "1",
                totalValue: "100",
                indexer: "CDI",
                unitPrice: "100",
                valuationSource: "CURVA" as const,
              },
              changedFields: ["código: CDB1 → CDB3"],
            },
            {
              position: {
                product: "CDB antigo",
                institution: "Banco D",
                assetCode: "CDB4",
                quantity: "1",
                totalValue: "100",
                indexer: "CDI",
                unitPrice: "100",
                valuationSource: "CURVA" as const,
              },
              changedFields: ["código: CDB1 → CDB4"],
            },
          ],
        },
      ],
    };
    const secondIdentityPreview = {
      ...positionPreview,
      identityConflicts: [
        {
          assetKey: "v1:second-assigned-position",
          objectiveId: "goal-reserve",
          objectiveName: "Reserva",
          position: {
            product: "LCI antiga",
            institution: "Banco B",
            assetCode: "LCI2",
            quantity: "1",
            totalValue: "200",
            indexer: "CDI",
            unitPrice: "200",
            valuationSource: "CURVA" as const,
          },
          possibleIncomingDifferences: [
            {
              position: {
                product: "LCI antiga",
                institution: "Banco C",
                assetCode: "LCI3",
                quantity: "1",
                totalValue: "200",
                indexer: "CDI",
                unitPrice: "200",
                valuationSource: "CURVA" as const,
              },
              changedFields: ["código: LCI2 → LCI3"],
            },
          ],
        },
      ],
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => firstIdentityPreview,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => secondIdentityPreview,
      })
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetch);
    const { container } = render(<PortfolioImport />);

    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: {
        files: [
          spreadsheet("posicoes.xlsx"),
          spreadsheet("outra-posicao.xlsx"),
        ],
      },
    });

    await screen.findAllByRole("textbox", { name: /^Data exibida na B3/ });
    screen
      .getAllByRole("textbox", { name: /^Data exibida na B3/ })
      .forEach((dateInput) =>
        fireEvent.change(dateInput, { target: { value: "18/09/2026" } }),
      );
    expect(await screen.findByText("outra-posicao.xlsx")).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
    const confirmButton = screen.getByRole("button", {
      name: /Confirmar 2 arquivo/,
    });
    expect(confirmButton).toHaveProperty("disabled", false);
    fireEvent.click(confirmButton);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    const confirmationRequests = fetch.mock.calls.filter(
      ([url]) => url === "/api/imports/confirm",
    );
    expect(confirmationRequests).toHaveLength(2);
    confirmationRequests.forEach(([, init]) => {
      expect((init?.body as FormData).has("retiredObjectiveAssignments")).toBe(
        false,
      );
    });
  });

  it("keeps a preview visible when confirmation fails and can cancel it", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => positionPreview })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ message: "Falha ao salvar" }),
        }),
    );
    const { container } = render(<PortfolioImport />);

    fireEvent.change(container.querySelector("input[type=file]")!, {
      target: { files: [spreadsheet("posicoes.xlsx")] },
    });
    fireEvent.change(
      await screen.findByRole("textbox", {
        name: /^Data exibida na B3/,
      }),
      {
        target: { value: "18/09/2026" },
      },
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /Confirmar 1 arquivo/ }),
    );

    expect(
      await screen.findByText("posicoes.xlsx: Importação não concluída."),
    ).toBeTruthy();
    expect(screen.queryByText("Falha ao salvar")).toBeNull();
    expect(toast.error).toHaveBeenCalledWith(
      "Importação não concluída. Veja os detalhes abaixo.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByText("ETF")).toBeNull());
  });

  it("reports partial success and retries only the failed file", async () => {
    const portfolioUpdated = vi.fn();
    window.addEventListener("portfolio:updated", portfolioUpdated);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => positionPreview })
      .mockResolvedValueOnce({ ok: true, json: async () => movementPreview })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: "Movimentações recusadas." }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: "Posições importadas." }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: "Movimentações seguem recusadas." }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<PortfolioImport />);

    fireEvent.change(container.querySelector("input[type=file]")!, {
      target: {
        files: [spreadsheet("posicoes.xlsx"), spreadsheet("movimentos.xlsx")],
      },
    });
    fireEvent.change(
      await screen.findByRole("textbox", {
        name: /^Data exibida na B3/,
      }),
      {
        target: { value: "18/09/2026" },
      },
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /Confirmar 2 arquivo/ }),
    );

    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith(
        "Atualização parcial. Veja os detalhes abaixo.",
      );
    });
    expect(screen.getByRole("alert").textContent).toContain(
      "Atualização parcial",
    );
    expect(portfolioUpdated).toHaveBeenCalledOnce();
    expect(screen.queryByText("posicoes.xlsx")).toBeNull();
    expect(
      screen.getByText("movimentos.xlsx: Importação não concluída."),
    ).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain(
      "movimentos.xlsx: Movimentações recusadas",
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Confirmar 1 arquivo/ }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenLastCalledWith(
        "Importação não concluída. Veja os detalhes abaixo.",
      ),
    );
    const confirmationRequests = fetchMock.mock.calls.filter(
      ([url]) => url === "/api/imports/confirm",
    );
    expect(
      confirmationRequests.map(
        ([, init]) => ((init?.body as FormData).get("file") as File).name,
      ),
    ).toEqual(["movimentos.xlsx", "posicoes.xlsx", "movimentos.xlsx"]);
    expect(portfolioUpdated).toHaveBeenCalledOnce();
    window.removeEventListener("portfolio:updated", portfolioUpdated);
  });

  it("does not start a preview when the file chooser is empty", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { container } = render(<PortfolioImport />);

    fireEvent.change(container.querySelector("input[type=file]")!, {
      target: { files: [] },
    });

    expect(fetch).not.toHaveBeenCalled();
  });
  it("opens the multi-file chooser from the import button", () => {
    const { container } = render(<PortfolioImport />);
    const input = container.querySelector(
      "input[type=file]",
    ) as HTMLInputElement;
    const click = vi.spyOn(input, "click");

    fireEvent.click(
      screen.getByRole("button", { name: "Importar arquivos XLSX" }),
    );

    expect(screen.getAllByRole("img", { name: "Logo da B3" })).toHaveLength(2);
    expect(click).toHaveBeenCalledOnce();
  });
  it("uses fallback messages and renders a position without a total value", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          count: 1,
          positions: [
            {
              product: "Sem total",
              quantity: "1",
              totalValue: null,
              institution: null,
              assetCode: null,
              indexer: null,
              unitPrice: null,
              valuationSource: null,
            },
          ],
        }),
      }),
    );
    const { container } = render(<PortfolioImport />);
    fireEvent.change(container.querySelector("input[type=file]")!, {
      target: { files: [spreadsheet("sem-total.xlsx")] },
    });
    expect(await screen.findByText("Sem total")).toBeTruthy();
  });

  it("uses a fallback toast when the preview API omits an error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }),
    );
    const { container } = render(<PortfolioImport />);
    fireEvent.change(container.querySelector("input[type=file]")!, {
      target: { files: [spreadsheet("erro.xlsx")] },
    });
    expect(
      await screen.findByText("erro.xlsx: Prévia indisponível."),
    ).toBeTruthy();
    expect(toast.error).toHaveBeenCalledWith(
      "erro.xlsx: Não foi possível ler o arquivo.",
    );
  });
  it("uses a safe fallback when confirmation rejects without an Error", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => positionPreview })
        .mockRejectedValueOnce("offline"),
    );
    const { container } = render(<PortfolioImport />);
    fireEvent.change(container.querySelector("input[type=file]")!, {
      target: { files: [spreadsheet("offline.xlsx")] },
    });
    fireEvent.change(
      await screen.findByRole("textbox", {
        name: /^Data exibida na B3/,
      }),
      {
        target: { value: "18/09/2026" },
      },
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /Confirmar 1 arquivo/ }),
    );
    expect(
      await screen.findByText("offline.xlsx: Importação não concluída."),
    ).toBeTruthy();
    expect(toast.error).toHaveBeenCalledWith(
      "Importação não concluída. Veja os detalhes abaixo.",
    );
  });
  it("treats a missing file list as an empty chooser", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { container } = render(<PortfolioImport />);

    fireEvent.change(container.querySelector("input[type=file]")!, {
      target: { files: null },
    });

    expect(fetch).not.toHaveBeenCalled();
  });
  it("confirms movement previews without a position reference date", async () => {
    const portfolioUpdated = vi.fn();
    window.addEventListener("portfolio:updated", portfolioUpdated);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => movementPreview })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ message: "Movimentacoes importadas." }),
        }),
    );
    const { container } = render(<PortfolioImport />);

    fireEvent.change(container.querySelector("input[type=file]")!, {
      target: { files: [spreadsheet("movimentos.xlsx")] },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: /Confirmar 1 arquivo/ }),
    );

    await waitFor(() => expect(portfolioUpdated).toHaveBeenCalledOnce());
    expect(toast.success).toHaveBeenCalledWith("Atualização concluída.");
    expect(screen.queryByText("movimentos.xlsx")).toBeNull();
    window.removeEventListener("portfolio:updated", portfolioUpdated);
  });
  it("renders an empty legacy position preview when positions are omitted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );
    const { container } = render(<PortfolioImport />);

    fireEvent.change(container.querySelector("input[type=file]")!, {
      target: { files: [spreadsheet("vazio.xlsx")] },
    });

    expect(await screen.findByText(/vazio\.xlsx/)).toBeTruthy();
    expect(screen.getByText("0 de 0")).toBeTruthy();
  });

  it("previews trade fields, warns about ambiguous duplicates, and preserves partial history", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => tradingPreview,
      }),
    );
    const { container } = render(<PortfolioImport />);
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [spreadsheet("negociacoes.xlsx")] },
    });

    expect(
      await screen.findByRole("table", { name: "Prévia de negociações" }),
    ).toBeTruthy();
    const table = screen.getByRole("table", { name: "Prévia de negociações" });
    expect(within(table).getAllByText("Compra")).toHaveLength(2);
    expect(within(table).getAllByText("Venda")).toHaveLength(2);
    expect(within(table).getAllByText(/Original: ABCD3F/)).toHaveLength(2);
    expect(screen.getByText(/Hist.*parcial/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Detalhes do hist/ }));
    expect(
      screen.getByText(/1 grupo.*linhas possivelmente repetidas/),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: /Ver linhas para revisar/ }),
    );
    expect(screen.getByText(/Linhas 7, 8: 3 ocorr.*1 j.*import/)).toBeTruthy();
    expect(screen.queryByText("must-not-render")).toBeNull();
    expect(
      screen.getByText(/v.*culo continuar.*pendente de revis.*o/),
    ).toBeTruthy();
  });

  it("shows the post-import reconciliation summary without treating candidates as confirmed", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => tradingPreview })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ message: "Negociações importadas." }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            candidates: [reconciliationPair],
            confirmed: [],
            ambiguous: [],
            separated: [],
            unmatched: [
              {
                tradeId: "unmatched-private-id",
                trade: reconciliationPair.trade,
                reason: "no match",
              },
            ],
            duplicateCandidates: [],
            movementDuplicateCandidates: [],
            history: { complete: false, reasons: ["Histórico parcial."] },
          }),
        }),
    );
    const { container } = render(<PortfolioImport />);
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [spreadsheet("negociacoes.xlsx")] },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: /Confirmar 1 arquivo/ }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "Revisão entre negociações e movimentações",
      }),
    ).toBeTruthy();
    expect(screen.getByText(/1 revisão\(ões\) pendente\(s\)/)).toBeTruthy();
    expect(screen.getByText(/0 vínculo\(s\) confirmado\(s\)/)).toBeTruthy();
    expect(screen.getByText(/Confira os dados dos dois arquivos/)).toBeTruthy();
    expect(screen.queryByText(/private-/)).toBeNull();
  });

  it("supports a complete reconciliation summary and retained duplicate groups", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => tradingPreview })
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            candidates: [],
            confirmed: [reconciliationPair],
            ambiguous: [],
            separated: [],
            unmatched: [],
            duplicateCandidates: [
              {
                occurrenceCount: 2,
                sourceRows: [4, 9],
                importCount: 2,
                status: "ambiguous",
              },
            ],
            movementDuplicateCandidates: [],
            history: { complete: true, reasons: [] },
          }),
        }),
    );
    const { container } = render(<PortfolioImport />);
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [spreadsheet("negociacoes.xlsx")] },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: /Confirmar 1 arquivo/ }),
    );

    expect(await screen.findByText(/1 grupo/)).toBeTruthy();
    expect(screen.getByText(/Negociação: linhas 4, 9/)).toBeTruthy();
    expect(screen.getByText(/1 vínculo\(s\) confirmado\(s\)/)).toBeTruthy();
  });

  it("keeps the import successful when the reconciliation summary cannot be loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => tradingPreview })
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
        .mockResolvedValueOnce({ ok: false, json: async () => ({}) }),
    );
    const { container } = render(<PortfolioImport />);
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [spreadsheet("negociacoes.xlsx")] },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: /Confirmar 1 arquivo/ }),
    );

    expect(await screen.findByText(/arquivo foi salvo/)).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Negociações importadas" }),
    ).toBeTruthy();
  });

  it("renders a negotiation preview with no duplicate candidates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ...tradingPreview,
          duplicateCandidates: [],
          batchReconciliationPending: false,
        }),
      }),
    );
    const { container } = render(<PortfolioImport />);
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [spreadsheet("sem-duplicidades.xlsx")] },
    });

    expect(
      await screen.findByRole("table", { name: "Prévia de negociações" }),
    ).toBeTruthy();
    expect(
      screen.queryByText(/Possíveis duplicidades para revisar/),
    ).toBeNull();
  });

  it("keeps trading preview legible when market and normalized ticker are absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ...tradingPreview,
          count: 1,
          trades: [
            {
              ...tradingPreview.trades[0],
              market: null,
              product: "Produto sem código normalizado",
              assetCode: null,
              originalAssetCode: null,
            },
          ],
          duplicateCandidates: [],
          batchReconciliationPending: false,
        }),
      }),
    );
    const { container } = render(<PortfolioImport />);
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [spreadsheet("sem-codigo.xlsx")] },
    });

    const table = await screen.findByRole("table", {
      name: "Prévia de negociações",
    });
    const row = screen
      .getByText("Produto sem código normalizado")
      .closest("tr");
    expect(row).not.toBeNull();
    const cells = within(row!).getAllByRole("cell");
    expect(cells[2].textContent).toBe("—");
    expect(cells[4].textContent).toBe("—");
    expect(
      within(table).getByText("Produto sem código normalizado"),
    ).toBeTruthy();
  });

  it("shows instrument type, source sheet and original ticker in the position preview", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ...positionPreview,
          positions: [
            {
              ...positionPreview.positions[0],
              instrumentKind: "INVESTMENT_FUND",
              sourceType: "Cotas",
              sourceSheet: "Fundo de Investimento",
              assetCode: "FUND11",
              originalAssetCode: "FUND11F",
            },
          ],
        }),
      }),
    );
    const { container } = render(<PortfolioImport />);
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [spreadsheet("posicao.xlsx")] },
    });

    expect(await screen.findByText("Fundo de investimento")).toBeTruthy();
    expect(screen.getByText("Cotas")).toBeTruthy();
    expect(screen.getByText("Fundo de Investimento")).toBeTruthy();
    expect(screen.getByText(/Original: FUND11F/)).toBeTruthy();
    const table = screen.getByText("Cotas").closest("table");
    expect(table).not.toBeNull();
    expect(within(table!).getAllByRole("columnheader")).toHaveLength(11);
    expect(
      within(screen.getByText("Cotas").closest("tr")!).getAllByRole("cell"),
    ).toHaveLength(11);
    expect(
      screen
        .getByText("Total reconhecido no arquivo")
        .closest("td")
        ?.getAttribute("colspan"),
    ).toBe("10");
  });

  it("preserves movement direction and explains that credits are not asset purchases", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ...movementPreview,
          movements: [
            {
              ...movementPreview.movements[0],
              direction: "Crédito",
              assetCode: "ABCD3",
            },
          ],
        }),
      }),
    );
    const { container } = render(<PortfolioImport />);
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [spreadsheet("movimentos.xlsx")] },
    });

    expect(await screen.findByText("Crédito")).toBeTruthy();
    expect(screen.getByText("ABCD3")).toBeTruthy();
    expect(
      screen.getByText(/não é tratado como compra ou venda de ativo/),
    ).toBeTruthy();
  });
});

it("allows importing with unresolved candidates and submits explicit pair decisions", async () => {
  const candidates = ["probable", "unequivocal", "conflict"].map(
    (status, index) => ({
      manualAssetKey: `manual:${index}`,
      importedAssetKey: `b3:${index}`,
      status,
      manualUpdatedAt: "2026-10-01T12:00:00Z",
      manualProduct: `Manual ${index}`,
      importedProduct: `B3 ${index}`,
      manualAssetCode: null,
      importedAssetCode: `CERT-${index}`,
      manualInstitution: index ? null : "Banco manual",
      manualValue: index ? null : "10",
      importedValue: "11",
      institution: index ? null : "Banco",
      reasons: ["missing_code", ...(index === 2 ? ["different_values"] : [])],
    }),
  );
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...positionPreview,
        reconciliationCandidates: candidates,
      }),
    })
    .mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: "Outro arquivo inválido" }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: "Concluído" }),
    });
  vi.stubGlobal("fetch", fetch);
  const { container } = render(<PortfolioImport />);
  fireEvent.change(container.querySelector('input[type="file"]')!, {
    target: { files: [spreadsheet("posicoes.xlsx"), spreadsheet("erro.xlsx")] },
  });
  fireEvent.change(
    await screen.findByRole("textbox", { name: /^Data exibida na B3/ }),
    { target: { value: "18/09/2026" } },
  );
  const confirm = screen.getByRole("button", { name: /Confirmar 1 arquivo/ });
  expect(confirm.hasAttribute("disabled")).toBe(false);
  const candidateHeading = screen.getByRole("heading", {
    name: "Correspondências possíveis",
  });
  const firstPositionColumn = screen.getByRole("columnheader", {
    name: "Produto",
  });
  expect(
    candidateHeading.compareDocumentPosition(firstPositionColumn) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).not.toBe(0);
  fireEvent.click(
    screen.getByRole("button", {
      name: "Usar B3 0, código CERT-0, valor R$ 11,00, como a mesma posição de Manual 0",
    }),
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: "Usar B3 1, código CERT-1, valor R$ 11,00, como a mesma posição de Manual 1",
    }),
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: "Nenhuma posição da B3 corresponde a Manual 2",
    }),
  );
  expect(
    screen.getAllByRole("button", {
      name: /como a mesma posição de Manual/,
    }),
  ).toHaveLength(3);
  expect(screen.getByText(/CERT-0/)).toBeTruthy();
  expect(confirm.hasAttribute("disabled")).toBe(false);
  fireEvent.click(confirm);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  const form = fetch.mock.calls[2][1].body as FormData;
  expect(JSON.parse(form.get("reconciliationDecisions") as string)).toEqual(
    candidates.map((candidate, index) => ({
      manualAssetKey: candidate.manualAssetKey,
      importedAssetKey: candidate.importedAssetKey,
      manualUpdatedAt: candidate.manualUpdatedAt,
      action: index === 2 ? "separate" : "link",
    })),
  );
  cleanup();
  vi.restoreAllMocks();
});

it("imports a position snapshot without submitting unresolved reconciliation decisions", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...positionPreview,
        reconciliationCandidates: [
          {
            manualAssetKey: "manual:1",
            importedAssetKey: "b3:1",
            status: "conflict",
            manualUpdatedAt: "2026-10-01T12:00:00Z",
            manualProduct: "CDB manual",
            importedProduct: "CDB B3",
            manualAssetCode: null,
            importedAssetCode: "CERT-1",
            manualInstitution: "Banco",
            manualValue: "10",
            importedValue: "11",
            institution: "Banco",
            reasons: ["different_values"],
          },
        ],
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: "Concluído" }),
    });
  vi.stubGlobal("fetch", fetch);
  const { container } = render(<PortfolioImport />);
  fireEvent.change(container.querySelector('input[type="file"]')!, {
    target: { files: [spreadsheet("posicoes.xlsx")] },
  });
  await screen.findByRole("heading", { name: "Correspondências possíveis" });
  expect(
    screen.getByText(
      /Vínculos com objetivos de ativos ausentes só serão encerrados se o aviso abaixo informar isso\./,
    ),
  ).toBeTruthy();
  fireEvent.change(
    screen.getByRole("textbox", { name: /^Data exibida na B3/ }),
    { target: { value: "18/09/2026" } },
  );
  fireEvent.click(screen.getByRole("button", { name: /Confirmar 1 arquivo/ }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  const form = fetch.mock.calls[1][1].body as FormData;
  expect(form.has("reconciliationDecisions")).toBe(false);
  cleanup();
  vi.restoreAllMocks();
});

it("groups many possible matches and expands or collapses the extra options", async () => {
  const candidates = Array.from({ length: 4 }, (_, index) => ({
    manualAssetKey: "manual:cdb",
    importedAssetKey: `b3:${index}`,
    status: "conflict",
    manualUpdatedAt: "2026-10-01T12:00:00Z",
    manualProduct: "CDB Banco Inter",
    importedProduct: `CDB ${index}`,
    manualAssetCode: null,
    importedAssetCode: index === 3 ? null : `CERT-${index}`,
    manualInstitution: "Banco Inter",
    manualValue: "3000",
    importedValue: index === 0 ? "3000" : index === 3 ? null : "3100",
    institution: index === 1 ? null : "Banco Inter",
    reasons: index === 0 ? ["missing_code"] : ["different_values"],
    closestValue: index === 0,
  }));
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...positionPreview,
        reconciliationCandidates: candidates,
      }),
    }),
  );
  const { container } = render(<PortfolioImport />);
  fireEvent.change(container.querySelector('input[type="file"]')!, {
    target: { files: [spreadsheet("cdbs.xlsx")] },
  });

  expect(await screen.findByText("Valor mais próximo")).toBeTruthy();
  expect(
    screen.getAllByRole("button", { name: /como a mesma posição/ }),
  ).toHaveLength(3);
  expect(
    screen.getByText(/Instituição não informada.*Código: CERT-1/),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Mostrar outros 1 candidatos" }),
  ).toBeTruthy();

  fireEvent.click(
    screen.getByRole("button", { name: "Mostrar outros 1 candidatos" }),
  );
  expect(
    screen.getAllByRole("button", { name: /como a mesma posição/ }),
  ).toHaveLength(4);
  expect(
    screen.getByRole("button", { name: "Ocultar candidatos adicionais" }),
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Ocultar candidatos adicionais" }),
  );
  expect(
    screen.getAllByRole("button", { name: /como a mesma posição/ }),
  ).toHaveLength(3);
});
