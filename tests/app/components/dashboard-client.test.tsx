// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/app-page-skeleton", () => ({
  AppPageSkeleton: () => <p>Carregando dashboard...</p>,
}));
vi.mock("@/app/_components/dashboard-summary", () => ({
  DashboardSummary: () => <p>Resumo do dashboard</p>,
}));

import { DashboardClient } from "@/app/_components/dashboard-client";

describe("DashboardClient", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("loads its view exclusively from the portfolio API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          positions: [],
          referenceRates: { selic: null, cdi: null },
        }),
      }),
    );

    render(<DashboardClient />);

    expect(await screen.findByText("Resumo do dashboard")).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith("/api/portfolio");
  });

  it("shows a safe error when its API request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    render(<DashboardClient />);

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível carregar o dashboard.",
    );
  });
  it("handles an API response that is not successful", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ message: "Falha" }),
      }),
    );
    render(<DashboardClient />);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível carregar o dashboard.",
    );
  });
});
