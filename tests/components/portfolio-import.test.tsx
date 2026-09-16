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
import { PortfolioImport } from "@/components/portfolio-import";
const file = new File(["xlsx"], "posicoes.xlsx", {
  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
});
describe("PortfolioImport", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  it("selects a file and renders the preview", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          positions: [
            {
              product: "ETF",
              assetCode: "BOVA11",
              quantity: "1",
              institution: "B3",
              maturityAt: "2030-12-31",
              totalValue: "52037.50",
            },
          ],
        }),
      }),
    );
    render(<PortfolioImport />);
    const input = document.querySelector(
      "input[type=file]",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await userEvent.click(
      screen.getByRole("button", { name: "Gerar preview" }),
    );
    expect(await screen.findByText("ETF")).toBeTruthy();
    expect(screen.getByText(/Posição B3/)).toBeTruthy();
    expect(screen.getByText(/R\$\s*52\.037,50/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Confirmar import/ }),
    ).toBeTruthy();
  });
  it("renders a movement preview with its detected format", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          documentType: "B3_MOVEMENT_XLSX",
          movements: [
            {
              direction: "CREDITO",
              occurredAt: "2026-09-11",
              movementType: "APLICAÇÃO",
              product: "CDB - CDB4265W9HJ",
              assetCode: "CDB4265W9HJ",
              institution: "BANCO INTER S/A",
              quantity: "20000",
              unitPrice: "0.01",
              operationValue: null,
            },
            {
              direction: "CREDITO",
              occurredAt: "2026-09-12",
              movementType: "Juros",
              product: "Outro produto",
              assetCode: null,
              institution: null,
              quantity: "1",
              unitPrice: null,
              operationValue: "200",
            },
          ],
        }),
      }),
    );
    render(<PortfolioImport />);
    fireEvent.change(
      document.querySelector("input[type=file]") as HTMLInputElement,
      { target: { files: [file] } },
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Gerar preview" }),
    );
    expect(await screen.findByText(/Movimentação B3/)).toBeTruthy();
    expect(screen.getByText("CDB - CDB4265W9HJ")).toBeTruthy();
  });
  it("renders a preview error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ message: "Arquivo inválido" }),
      }),
    );
    render(<PortfolioImport />);
    fireEvent.change(
      document.querySelector("input[type=file]") as HTMLInputElement,
      { target: { files: [file] } },
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Gerar preview" }),
    );
    expect(await screen.findByText("Arquivo inválido")).toBeTruthy();
  });
  it("cancels a preview and confirms an import", async () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload },
      configurable: true,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          positions: [
            {
              product: "ETF",
              assetCode: null,
              quantity: "1",
              institution: null,
            },
          ],
        }),
      }),
    );
    render(<PortfolioImport />);
    fireEvent.change(
      document.querySelector("input[type=file]") as HTMLInputElement,
      { target: { files: [file] } },
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Gerar preview" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(
      screen.queryByRole("button", { name: /Confirmar import/ }),
    ).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Gerar preview" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Confirmar import/ }),
    );
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });
  it("opens the hidden file selector", async () => {
    const { container } = render(<PortfolioImport />);
    const input = container.querySelector(
      "input[type=file]",
    ) as HTMLInputElement;
    const click = vi.spyOn(input, "click");
    await userEvent.click(
      screen.getByRole("button", { name: "Importar carteira" }),
    );
    expect(click).toHaveBeenCalledOnce();
  });
  it("does not reload when confirmation returns no body", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          positions: [
            {
              product: "ETF",
              assetCode: null,
              quantity: "1",
              institution: null,
            },
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => undefined });
    vi.stubGlobal("fetch", fetch);
    render(<PortfolioImport />);
    fireEvent.change(
      document.querySelector("input[type=file]") as HTMLInputElement,
      { target: { files: [file] } },
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Gerar preview" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Confirmar import/ }),
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("shows a safe error when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    render(<PortfolioImport />);
    fireEvent.change(
      document.querySelector("input[type=file]") as HTMLInputElement,
      {
        target: { files: [file] },
      },
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Gerar preview" }),
    );
    expect(await screen.findByText(/comunicar com o servidor/)).toBeTruthy();
  });
});
