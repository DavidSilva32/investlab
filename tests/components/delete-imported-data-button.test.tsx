// @vitest-environment jsdom
// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { DeleteImportedDataButton } from "@/components/delete-imported-data-button";
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe("DeleteImportedDataButton", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.mocked(toast.error).mockReset();
    vi.mocked(toast.success).mockReset();
  });

  it("shows the API success message and notifies the portfolio without reloading", async () => {
    const portfolioUpdated = vi.fn();
    window.addEventListener("portfolio:updated", portfolioUpdated);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          deletedImports: 1,
          message: "Dados importados excluídos com sucesso.",
        }),
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
    await waitFor(() =>
      expect(portfolioUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ type: "portfolio:updated" }),
      ),
    );
    expect(toast.success).toHaveBeenCalledWith(
      "Dados importados excluídos com sucesso.",
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/imports?documentType=B3_POSITION_XLSX",
      { method: "DELETE" },
    );
    window.removeEventListener("portfolio:updated", portfolioUpdated);
  });

  it("uses the localized default error when the API does not provide one", async () => {
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
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível excluir os dados.",
      ),
    );
    expect(screen.queryByText(/Não foi possível excluir os dados/)).toBeNull();
  });
  it("does nothing when cancellation is declined and reports failures by toast", async () => {
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
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Não pode"),
    );
    await userEvent.click(button);
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível comunicar com o servidor.",
      ),
    );
    expect(confirm).toHaveBeenCalledTimes(3);
  });
});
