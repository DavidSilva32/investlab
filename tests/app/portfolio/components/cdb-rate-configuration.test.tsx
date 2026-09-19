// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { CdbRateConfiguration } from "@/app/portfolio/_components/cdb-rate-configuration";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CdbRateConfiguration", () => {
  it("does not render an empty bulk configuration", () => {
    const { container } = render(<CdbRateConfiguration />);
    expect(container.innerHTML).toBe("");
  });

  it("keeps an individual rate available for correction", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <CdbRateConfiguration assetCode="CDB1" currentPercentage="100.0000" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ajustar taxa" }));
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
    render(<CdbRateConfiguration assetCodes={["CDB1", "CDB2"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Ajustar taxas" }));
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
    render(<CdbRateConfiguration missingAssetCodes={["CDB3"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Ajustar taxas" }));
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
    const first = render(<CdbRateConfiguration assetCodes={["CDB4"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Ajustar taxas" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Configuração salva com sucesso.",
      ),
    );
    first.unmount();
    render(<CdbRateConfiguration assetCodes={["CDB5"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Ajustar taxas" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível salvar a configuração.",
      ),
    );
  });
});
