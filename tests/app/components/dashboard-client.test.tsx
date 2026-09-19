// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));

vi.mock("sonner", () => ({
  toast: { error: toastError },
}));
vi.mock("@/components/app-page-skeleton", () => ({
  AppContentSkeleton: () => <p>Carregando dashboard...</p>,
}));
vi.mock("@/app/_components/dashboard-summary", () => ({
  DashboardSummary: () => <p>Resumo do dashboard</p>,
}));

import { DashboardClient } from "@/app/_components/dashboard-client";

const overview = {
  positions: [],
  referenceRates: { selic: null, cdi: null },
};

describe("DashboardClient", () => {
  afterEach(() => {
    cleanup();
    toastError.mockReset();
    vi.restoreAllMocks();
  });

  it("loads its view exclusively from the portfolio API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => overview }),
    );

    render(<DashboardClient />);

    expect(await screen.findByText("Resumo do dashboard")).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith("/api/portfolio");
  });

  it("announces an initial API failure and allows a retry", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ ok: true, json: async () => overview });
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardClient />);

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível carregar o dashboard.",
    );
    expect(toastError).toHaveBeenCalledWith(
      "Não foi possível carregar o dashboard.",
    );

    await screen
      .findByRole("button", { name: "Tentar novamente" })
      .then((button) => button.click());

    expect(await screen.findByText("Resumo do dashboard")).toBeTruthy();
  });

  it("keeps the loaded dashboard visible when a later refresh fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardClient />);
    await screen.findByText("Resumo do dashboard");

    window.dispatchEvent(new Event("portfolio:updated"));

    await vi.waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Resumo do dashboard")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
