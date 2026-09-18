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
const file = new File(["xlsx"], "posicoes.xlsx", {
  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
});
describe("PortfolioImport", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  it("previews every selected file automatically", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        documentType: "B3_POSITION_XLSX",
        count: 1,
        positions: [{ product: "ETF", quantity: "1", totalValue: "10" }],
      }),
    });
    vi.stubGlobal("fetch", fetch);
    const { container } = render(<PortfolioImport />);
    fireEvent.change(container.querySelector("input[type=file]")!, {
      target: { files: [file, new File(["x"], "movimentos.xlsx")] },
    });
    expect((await screen.findAllByText("ETF")).length).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(
      screen.getByRole("button", { name: /Confirmar 2 arquivo/ }),
    ).toBeTruthy();
  });
  it("shows automatic preview failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ message: "Arquivo inválido" }),
      }),
    );
    const { container } = render(<PortfolioImport />);
    fireEvent.change(container.querySelector("input[type=file]")!, {
      target: { files: [file] },
    });
    expect(await screen.findByText(/Arquivo inválido/)).toBeTruthy();
  });
});
