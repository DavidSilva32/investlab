// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { PortfolioImport } from "@/components/portfolio-import";

const spreadsheet = (name: string) => new File(["xlsx"], name);
const positionPreview = {
  documentType: "B3_POSITION_XLSX",
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

describe("PortfolioImport", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
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
    expect(fetch).toHaveBeenCalledTimes(2);
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

    expect(await screen.findByLabelText(/Data de refer/)).toBeTruthy();
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
  it("shows API and communication failures for automatic previews", async () => {
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

    expect(await screen.findByText(/Arquivo inválido/)).toBeTruthy();
    expect(
      await screen.findByText(/Não foi possível comunicar com o servidor/),
    ).toBeTruthy();
  });

  it("confirms ready previews and reloads only when every file is saved", async () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload },
    });
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
    fireEvent.change(await screen.findByLabelText(/Data de refer/), {
      target: { value: "2026-09-18" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: /Confirmar 1 arquivo/ }),
    );

    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(toast.success).toHaveBeenCalledWith(
      "Arquivo importado com sucesso.",
    );
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
    fireEvent.change(await screen.findByLabelText(/Data de refer/), {
      target: { value: "2026-09-18" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: /Confirmar 1 arquivo/ }),
    );

    expect(await screen.findByText(/Falha ao salvar/)).toBeTruthy();
    expect(toast.error).toHaveBeenCalledWith("Falha ao salvar");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByText("ETF")).toBeNull());
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

    fireEvent.click(screen.getByRole("button", { name: "Importar carteira" }));

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

  it("uses fallback messages when the preview API omits an error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }),
    );
    const { container } = render(<PortfolioImport />);
    fireEvent.change(container.querySelector("input[type=file]")!, {
      target: { files: [spreadsheet("erro.xlsx")] },
    });
    expect(await screen.findByText(/N/)).toBeTruthy();
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
    fireEvent.change(await screen.findByLabelText(/Data de refer/), {
      target: { value: "2026-09-18" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: /Confirmar 1 arquivo/ }),
    );
    expect(
      await screen.findByText(/Não foi possível salvar o arquivo/),
    ).toBeTruthy();
    expect(toast.error).toHaveBeenCalledWith(
      "Não foi possível salvar o arquivo.",
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
});
