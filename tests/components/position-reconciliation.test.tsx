// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
import { PositionReconciliation } from "@/components/position-reconciliation";
const link = {
  manualAssetKey: "manual:one",
  importedAssetKey: "b3:one",
  manualProduct: "ETF",
  effectiveFrom: "2026-10-01",
  recordedAt: "2026-10-02",
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const response = (body: unknown, ok = true) => ({ ok, json: async () => body });
it("loads only on request, allows cancel, then explicitly reverses without deleting history", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(response({ links: [link] }))
    .mockResolvedValueOnce(response({}));
  vi.stubGlobal("fetch", fetch);
  const dispatch = vi.spyOn(window, "dispatchEvent");
  render(<PositionReconciliation />);
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /Revisar vínculos/ }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Desfazer vínculo" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Desfazer vínculo" }));
  expect(screen.getByText(/pode estar desatualizado/)).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Confirmar posições distintas" }),
  );
  expect(
    await screen.findByText("Nenhuma posição manual vinculada à B3."),
  ).toBeTruthy();
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
    manualAssetKey: link.manualAssetKey,
  });
  expect(dispatch).toHaveBeenCalledWith(expect.any(Event));
});
it.each([response({}, false), new Error("offline")])(
  "shows load failure and can retry",
  async (failure) => {
    const fetch = vi.fn();
    if (failure instanceof Error) fetch.mockRejectedValueOnce(failure);
    else fetch.mockResolvedValueOnce(failure);
    fetch.mockResolvedValueOnce(response({ links: [] }));
    vi.stubGlobal("fetch", fetch);
    render(<PositionReconciliation />);
    fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByRole("status")).toBeTruthy();
  },
);
it.each([
  response({ message: "Conflito" }, false),
  response({}, false),
  "network",
])("preserves link on failed reversal %s", async (failure) => {
  const fetch = vi.fn().mockResolvedValueOnce(response({ links: [link] }));
  if (failure === "network") fetch.mockRejectedValueOnce("network");
  else fetch.mockResolvedValueOnce(failure);
  vi.stubGlobal("fetch", fetch);
  render(<PositionReconciliation />);
  fireEvent.click(screen.getByRole("button"));
  fireEvent.click(
    await screen.findByRole("button", { name: "Desfazer vínculo" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Confirmar posições distintas" }),
  );
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(screen.getByText("ETF")).toBeTruthy();
  expect(toast.error).toHaveBeenCalled();
});
