// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/app-page-skeleton", () => ({
  AppContentSkeleton: () => <p>Carregando carteira...</p>,
}));
vi.mock("@/components/reference-rates", () => ({
  ReferenceRates: () => <p>Taxas de referência</p>,
}));
vi.mock("@/app/portfolio/_components/portfolio-overview", () => ({
  PortfolioOverview: () => <p>Visão geral</p>,
}));
vi.mock("@/app/portfolio/_components/portfolio-details", () => ({
  PositionDetails: () => <p>Posições</p>,
  MovementDetails: () => <p>Movimentações</p>,
}));

import { PortfolioClient } from "@/app/portfolio/_components/portfolio-client";

const overview = {
  positions: [],
  movements: [],
  referenceRates: { selic: null, cdi: null },
};

describe("PortfolioClient", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each([
    ["overview", "Visão geral"],
    ["positions", "Posições"],
    ["movements", "Movimentações"],
  ] as const)("loads the %s view through the API", async (activeView, text) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => overview }),
    );

    render(<PortfolioClient activeView={activeView} />);

    expect(await screen.findByText(text)).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith("/api/portfolio");
  });

  it("reloads the portfolio after a CDI rate is updated", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => overview,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PortfolioClient activeView="positions" />);
    await screen.findByText("Posições");

    window.dispatchEvent(new Event("portfolio:updated"));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("shows a safe API failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ message: "Erro" }),
      }),
    );

    render(<PortfolioClient activeView="overview" />);

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível carregar a carteira.",
    );
  });
});
