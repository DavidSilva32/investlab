// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { DeleteImportedDataButton } from "@/components/delete-imported-data-button";
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function renderControlledDelete(
  documentType: "B3_POSITION_XLSX" | "B3_MOVEMENT_XLSX",
  label: string,
) {
  function ControlledDelete() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Excluir {label}
        </button>
        <DeleteImportedDataButton
          documentType={documentType}
          label={label}
          hideTrigger
          open={open}
          onOpenChange={setOpen}
        />
      </>
    );
  }

  return render(<ControlledDelete />);
}

describe("DeleteImportedDataButton", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.mocked(toast.error).mockReset();
    vi.mocked(toast.success).mockReset();
  });

  it("shows the API success message and notifies the portfolio without reloading", async () => {
    const user = userEvent.setup();
    const portfolioUpdated = vi.fn();
    window.addEventListener("portfolio:updated", portfolioUpdated);
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
    renderControlledDelete("B3_POSITION_XLSX", "posições");
    await user.click(screen.getByRole("button", { name: "Excluir posições" }));
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Confirmar exclusão" }),
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
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }),
    );
    renderControlledDelete("B3_POSITION_XLSX", "posições");
    await user.click(screen.getByRole("button", { name: "Excluir posições" }));
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Confirmar exclusão" }),
    );
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível excluir os dados.",
      ),
    );
    expect(screen.queryByText(/Não foi possível excluir os dados/)).toBeNull();
  });

  it("opens and dismisses its own confirmation dialog when uncontrolled", async () => {
    const user = userEvent.setup();
    render(
      <DeleteImportedDataButton
        documentType="B3_POSITION_XLSX"
        label="registros"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Excluir registros" }));
    expect(await screen.findByRole("alertdialog")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("shows loading state while the deletion request is pending", async () => {
    const user = userEvent.setup();
    let resolveResponse: (response: {
      ok: boolean;
      json: () => Promise<Record<string, never>>;
    }) => void = () => {};
    const pendingResponse = new Promise<{
      ok: boolean;
      json: () => Promise<Record<string, never>>;
    }>((resolve) => {
      resolveResponse = resolve;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pendingResponse));
    render(
      <DeleteImportedDataButton
        documentType="B3_POSITION_XLSX"
        label="registros"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Excluir registros" }));
    await user.click(
      screen.getByRole("button", { name: "Confirmar exclusão" }),
    );
    expect(
      screen.getByRole("button", { name: "Excluindo...", hidden: true }),
    ).toHaveProperty("disabled", true);

    resolveResponse({ ok: true, json: async () => ({}) });
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Dados importados excluídos."),
    );
  });

  it("does nothing when cancellation is declined and reports failures by toast", async () => {
    const user = userEvent.setup();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: "Não pode" }),
      })
      .mockRejectedValueOnce(new Error("network"));
    vi.stubGlobal("fetch", fetch);
    renderControlledDelete("B3_MOVEMENT_XLSX", "movimentações");
    const button = screen.getByRole("button", {
      name: "Excluir movimentações",
    });
    await user.click(button);
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(fetch).not.toHaveBeenCalled();
    await user.click(button);
    await user.click(
      screen.getByRole("button", { name: "Confirmar exclusão" }),
    );
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Não pode"),
    );
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await user.click(button);
    await user.click(
      screen.getByRole("button", { name: "Confirmar exclusão" }),
    );
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível comunicar com o servidor.",
      ),
    );
  });
});
