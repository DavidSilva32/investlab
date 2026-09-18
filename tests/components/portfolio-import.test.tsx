// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PortfolioImport } from "@/components/portfolio-import";

const spreadsheet = (name: string) => new File(["xlsx"], name);
const positionPreview = {
  documentType: "B3_POSITION_XLSX",
  count: 1,
  positions: [{ product: "ETF", quantity: "1", totalValue: "10" }],
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
    expect(screen.getByText("18/09/2026")).toBeTruthy();
    expect(screen.getByText(/20,00/)).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(2);
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
    fireEvent.click(
      await screen.findByRole("button", { name: /Confirmar 1 arquivo/ }),
    );

    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
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
    fireEvent.click(
      await screen.findByRole("button", { name: /Confirmar 1 arquivo/ }),
    );

    expect(await screen.findByText(/Falha ao salvar/)).toBeTruthy();
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
            { product: "Sem total", quantity: "1", totalValue: null },
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
    fireEvent.click(
      await screen.findByRole("button", { name: /Confirmar 1 arquivo/ }),
    );
    expect(
      await screen.findByText(/Não foi possível salvar o arquivo/),
    ).toBeTruthy();
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
