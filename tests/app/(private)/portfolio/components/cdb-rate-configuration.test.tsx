// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { CdbRateConfiguration } from "@/app/(private)/portfolio/_components/cdb-rate-configuration";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CdbRateConfiguration", () => {
  it("does not render an empty bulk configuration", () => {
    const { container } = render(
      <CdbRateConfiguration
        open={false}
        onOpenChange={vi.fn()}
        assetCodes={[]}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("falls back to the standard rate when the saved percentage is invalid", () => {
    render(
      <CdbRateConfiguration
        open
        onOpenChange={vi.fn()}
        assetCode="CDB-INVALID"
        currentPercentage="not-a-number"
      />,
    );

    expect(
      (screen.getByLabelText("% do CDI para CDB-INVALID") as HTMLInputElement)
        .value,
    ).toBe("100");
  });

  it("preserves a valid saved percentage", () => {
    render(
      <CdbRateConfiguration
        open
        onOpenChange={vi.fn()}
        assetCode="CDB-SAVED"
        currentPercentage="112.5"
      />,
    );

    expect(
      (screen.getByLabelText("% do CDI para CDB-SAVED") as HTMLInputElement)
        .value,
    ).toBe("112.5");
  });

  it("keeps an individual rate available for correction", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    function ControlledRate() {
      const [open, setOpen] = useState(false);
      const [instanceKey, setInstanceKey] = useState(0);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setInstanceKey((key) => key + 1);
              setOpen(true);
            }}
          >
            Abrir ajuste
          </button>
          <CdbRateConfiguration
            key={instanceKey}
            open={open}
            onOpenChange={setOpen}
            assetCode="CDB1"
            currentPercentage={null}
          />
        </>
      );
    }
    render(<ControlledRate />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir ajuste" }));
    expect(
      (screen.getByLabelText("% do CDI para CDB1") as HTMLInputElement).value,
    ).toBe("100");
    fireEvent.change(screen.getByLabelText("% do CDI para CDB1"), {
      target: { value: "110" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir ajuste" }));
    expect(
      (screen.getByLabelText("% do CDI para CDB1") as HTMLInputElement).value,
    ).toBe("100");
    fireEvent.change(screen.getByLabelText("% do CDI para CDB1"), {
      target: { value: "110" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/cdb-rates",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(router.refresh).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(
      "Configuração salva com sucesso.",
    );
  });

  it("updates every selected CDB in bulk", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ configured: 2 }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <CdbRateConfiguration
        open
        onOpenChange={vi.fn()}
        assetCodes={["CDB1", "CDB2"]}
      />,
    );
    fireEvent.change(screen.getByLabelText("% do CDI para os CDBs"), {
      target: { value: "105" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/cdb-rates",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          assetCodes: ["CDB1", "CDB2"],
          cdiPercentage: "105",
        }),
      }),
    );
  });
  it("shows API errors and uses fallback bulk codes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ message: "Taxa inválida." }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <CdbRateConfiguration
        open
        onOpenChange={vi.fn()}
        missingAssetCodes={["CDB3"]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Taxa inválida."),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/cdb-rates",
      expect.objectContaining({
        body: JSON.stringify({ assetCodes: ["CDB3"], cdiPercentage: "100" }),
      }),
    );
  });
  it("covers default bulk feedback values", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const first = render(
      <CdbRateConfiguration
        open
        onOpenChange={vi.fn()}
        assetCodes={["CDB4"]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Configuração salva com sucesso.",
      ),
    );
    first.unmount();
    render(
      <CdbRateConfiguration
        open
        onOpenChange={vi.fn()}
        assetCodes={["CDB5"]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível salvar a configuração.",
      ),
    );
  });
});

it("shows a communication error when saving rejects", async () => {
  const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
  vi.stubGlobal("fetch", fetchMock);
  render(
    <CdbRateConfiguration open onOpenChange={vi.fn()} assetCodes={["CDB8"]} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith(
      "Não foi possível comunicar com o servidor.",
    ),
  );
});
