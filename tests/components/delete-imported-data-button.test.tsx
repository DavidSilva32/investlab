// @vitest-environment jsdom
// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeleteImportedDataButton } from "@/components/delete-imported-data-button";

describe("DeleteImportedDataButton", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("deletes confirmed data and reloads", async () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload },
      configurable: true,
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ deletedImports: 1 }),
      }),
    );
    render(
      <DeleteImportedDataButton
        documentType="B3_POSITION_XLSX"
        label="posições"
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Excluir posições" }),
    );
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/imports?documentType=B3_POSITION_XLSX",
      { method: "DELETE" },
    );
  });

  it("uses the default error when the API does not provide one", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }),
    );
    render(
      <DeleteImportedDataButton
        documentType="B3_POSITION_XLSX"
        label="posições"
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Excluir posições" }),
    );
    expect(
      await screen.findByText("Não foi possível excluir os dados."),
    ).toBeTruthy();
  });
  it("does nothing when cancellation is declined and shows failures", async () => {
    const confirm = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: "Não pode" }),
      })
      .mockRejectedValueOnce(new Error("network"));
    vi.stubGlobal("fetch", fetch);
    render(
      <DeleteImportedDataButton
        documentType="B3_MOVEMENT_XLSX"
        label="movimentações"
      />,
    );
    const button = screen.getByRole("button", {
      name: "Excluir movimentações",
    });
    await userEvent.click(button);
    expect(fetch).not.toHaveBeenCalled();
    await userEvent.click(button);
    expect(await screen.findByText("Não pode")).toBeTruthy();
    await userEvent.click(button);
    expect(await screen.findByText(/comunicar com o servidor/)).toBeTruthy();
    expect(confirm).toHaveBeenCalledTimes(3);
  });
});
