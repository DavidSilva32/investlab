// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CdbRateConfiguration } from "@/app/portfolio/_components/cdb-rate-configuration";

afterEach(cleanup);

describe("CdbRateConfiguration", () => {
  it("does not render an empty bulk configuration", () => {
    const { container } = render(<CdbRateConfiguration />);
    expect(container.innerHTML).toBe("");
  });

  it("saves an individual percentage", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    render(<CdbRateConfiguration assetCode="CDB1" currentPercentage="102" />);
    fireEvent.change(screen.getByLabelText("% do CDI para CDB1"), {
      target: { value: "110" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Configurar taxa" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/cdb-rates",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(screen.getByRole("status").textContent).toContain("Taxa CDI salva");
  });

  it("applies a bulk percentage and reports API errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ configured: 2 }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: "Erro" }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(
      <CdbRateConfiguration missingAssetCodes={["CDB1", "CDB2"]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("2 CDB"),
    );
    rerender(<CdbRateConfiguration assetCode="CDB1" />);
    fireEvent.click(screen.getByRole("button", { name: "Configurar taxa" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Erro"),
    );
  });
});

it("uses fallback messages and zero when API omits optional data", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    .mockResolvedValueOnce({ ok: false, json: async () => ({}) });
  vi.stubGlobal("fetch", fetchMock);
  const { rerender } = render(
    <CdbRateConfiguration missingAssetCodes={["CDB1"]} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain("0 CDB"),
  );
  rerender(<CdbRateConfiguration assetCode="CDB1" />);
  fireEvent.click(screen.getByRole("button", { name: "Configurar taxa" }));
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain(
      "Não foi possível",
    ),
  );
});

it("shows pending state while a configuration is being persisted", async () => {
  let resolve!: (value: unknown) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    ),
  );
  render(<CdbRateConfiguration assetCode="CDB1" />);
  fireEvent.click(screen.getByRole("button", { name: "Configurar taxa" }));
  expect(screen.getByRole("button", { name: "Salvando..." })).toBeTruthy();
  resolve({ ok: true, json: async () => ({}) });
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain("Taxa CDI salva"),
  );
});
