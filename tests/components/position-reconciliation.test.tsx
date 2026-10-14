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
  manualInstitution: "Manual institution",
  manualValue: "100.00",
  importedProduct: "ETF B3",
  importedInstitution: "B3 institution",
  importedAssetCode: "VOO",
  importedValue: "105.00",
  effectiveFrom: "2026-10-01",
  recordedAt: "2026-10-02",
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const response = (body: unknown, ok = true) => ({ ok, json: async () => body });
it("automatically loads active links and explicitly reverses one without deleting history", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(response({ links: [link] }))
    .mockResolvedValueOnce(response({}));
  vi.stubGlobal("fetch", fetch);
  const dispatch = vi.spyOn(window, "dispatchEvent");
  render(<PositionReconciliation />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Revisar vínculos ativos" }),
  );
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Desfazer vínculo entre ETF e ETF B3, código VOO",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(
    screen.getByRole("button", {
      name: "Desfazer vínculo entre ETF e ETF B3, código VOO",
    }),
  );
  expect(screen.getByText(/pode estar desatualizado/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Desfazer vínculo" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Revisar vínculos ativos" }),
    ).toBeNull(),
  );
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
    manualAssetKey: link.manualAssetKey,
  });
  expect(dispatch).toHaveBeenCalledWith(expect.any(Event));
});
it.each([response({}, false), new Error("offline")])(
  "shows automatic load failure",
  async (failure) => {
    const fetch = vi.fn();
    if (failure instanceof Error) fetch.mockRejectedValueOnce(failure);
    else fetch.mockResolvedValueOnce(failure);
    fetch.mockResolvedValueOnce(response({ links: [link] }));
    vi.stubGlobal("fetch", fetch);
    render(<PositionReconciliation />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(
      await screen.findByRole("button", { name: "Revisar vínculos ativos" }),
    ).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(2);
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
  fireEvent.click(
    await screen.findByRole("button", { name: "Revisar vínculos ativos" }),
  );
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Desfazer vínculo entre ETF e ETF B3, código VOO",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Desfazer vínculo" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(screen.getByText("ETF")).toBeTruthy();
  expect(toast.error).toHaveBeenCalled();
});
