// @vitest-environment jsdom
import {
  act,
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
  const remainingLink = {
    ...link,
    manualAssetKey: "manual:remaining",
    manualProduct: "Outra posição",
    importedAssetKey: "b3:remaining",
    importedProduct: "Outra posição B3",
  };
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(response({ links: [link, remainingLink] }))
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
      screen.queryByRole("button", {
        name: "Desfazer vínculo entre ETF e ETF B3, código VOO",
      }),
    ).toBeNull(),
  );
  expect(screen.getByText(/Outra posição B3/)).toBeTruthy();
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
    manualAssetKey: link.manualAssetKey,
  });
  expect(dispatch).toHaveBeenCalledWith(expect.any(Event));
});
it.each(["resolve", "reject"] as const)(
  "does not update state when the initial request %s after unmount",
  async (outcome) => {
    let resolveRequest!: (value: unknown) => void;
    let rejectRequest!: (reason: unknown) => void;
    const request = new Promise((resolve, reject) => {
      resolveRequest = resolve;
      rejectRequest = reject;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(request));
    const view = render(<PositionReconciliation />);
    view.unmount();

    await act(async () => {
      if (outcome === "resolve") resolveRequest(response({ links: [link] }));
      else rejectRequest(new Error("offline"));
      await request.catch(() => undefined);
    });
  },
);
it("hides the review when no links exist and formats incomplete link details", async () => {
  const incompleteLink = {
    ...link,
    manualInstitution: null,
    manualValue: null,
    importedInstitution: null,
    importedAssetCode: null,
    importedValue: null,
  };
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(response({ links: [] }))
      .mockResolvedValueOnce(response({ links: [link, incompleteLink] })),
  );
  render(<PositionReconciliation />);

  await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  expect(
    screen.queryByRole("button", { name: "Revisar vínculos ativos" }),
  ).toBeNull();

  cleanup();
  render(<PositionReconciliation />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Revisar vínculos ativos" }),
  );
  expect(screen.getByText(/2 vínculos ativos entre/)).toBeTruthy();
  expect(
    screen.getAllByText(/Instituição não informada/, { selector: "p" }),
  ).toHaveLength(2);
  expect(
    screen.getAllByText(/Valor não informado/, { selector: "p" }),
  ).toHaveLength(2);
  expect(screen.getByText(/Código: não informado/)).toBeTruthy();
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
