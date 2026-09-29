// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));

vi.mock("sonner", () => ({
  toast: { error: toastError },
}));
vi.mock("@/components/app-page-skeleton", () => ({
  AppContentSkeleton: () => <p>Carregando carteira...</p>,
}));
vi.mock("@/components/reference-rates", () => ({
  ReferenceRates: () => <p>Taxas de referência</p>,
}));
vi.mock("@/app/portfolio/_components/emergency-reserve-editor", () => ({
  EmergencyReserveEditor: () => <div>Editor da reserva</div>,
}));
vi.mock("@/app/portfolio/_components/portfolio-allocation", () => ({
  PortfolioAllocation: ({
    nextContributionGuidance,
  }: {
    nextContributionGuidance?: { title: string };
  }) => <p>{nextContributionGuidance?.title}</p>,
}));
vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({
    children,
    config: _config,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div {...props}>{children}</div>
  ),
}));
vi.mock("recharts", () => ({
  Bar: () => null,
  BarChart: () => <div data-testid="bar-chart" />,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
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
  nextContributionGuidance: {
    status: "target_gap" as const,
    title: "Considere Renda fixa para o próximo aporte",
    explanation: "Sua carteira está abaixo da meta pessoal registrada.",
  },
};

describe("PortfolioClient", () => {
  afterEach(() => {
    cleanup();
    toastError.mockReset();
    vi.restoreAllMocks();
  });

  it.each([
    ["overview", "Valor conhecido da carteira"],
    ["positions", "Posições"],
    ["movements", "Movimentações"],
  ] as const)("loads the %s view through the API", async (activeView, text) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => overview })
        .mockResolvedValue({ ok: true, json: async () => ({ positions: [] }) }),
    );

    render(<PortfolioClient activeView={activeView} />);

    expect(await screen.findByText(text)).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith("/api/portfolio");
    if (activeView === "overview") {
      expect(fetch).toHaveBeenCalledWith("/api/portfolio/allocation");
    }
  });

  it("keeps reference rates by the summary and puts personal goals in a separate sheet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => overview }),
    );

    render(<PortfolioClient activeView="overview" />);

    expect(await screen.findByText("Taxas de referência")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Configurar reserva" }),
    ).toBeTruthy();
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Metas pessoais e detalhes" }),
    );
    expect(
      await screen.findByText("Considere Renda fixa para o próximo aporte"),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", {
        name: "Metas pessoais e dados detalhados",
      }),
    ).toBeTruthy();
  });

  it("contains reserve scrolling inside the editor while keeping the sheet viewport-sized", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => overview }),
    );

    render(<PortfolioClient activeView="overview" />);

    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Metas pessoais e detalhes" }),
    );
    const goalsSheet = await screen.findByRole("dialog");
    expect(goalsSheet.className).toContain("inset-y-0");
    expect(goalsSheet.className).toContain("h-full");
    expect(goalsSheet.className).toContain("w-full");
    expect(goalsSheet.className).toContain("overflow-y-auto");
    expect(goalsSheet.className).toContain("sm:max-w-5xl");

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(
      screen.getByRole("button", { name: "Configurar reserva" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Configuração da reserva" }),
    ).toBeTruthy();
    const sheet = screen.getByRole("dialog");
    expect(sheet.className).toContain("inset-y-0");
    expect(sheet.className).toContain("h-dvh");
    expect(sheet.className).toContain("max-h-dvh");
    expect(sheet.className).toContain("flex-col");
    expect(sheet.className).toContain("overflow-hidden");
    expect(sheet.className).not.toContain("overflow-y-auto");
    expect(sheet.className).toContain("w-full");
    expect(sheet.className).toContain("sm:max-w-5xl");
    expect(sheet.className).not.toMatch(/inset-y-auto|top-4|h-auto/);
    const scrollRegion = screen.getByRole("region", {
      name: "Conteúdo da configuração da reserva",
    });
    expect(scrollRegion.className).toContain("min-h-0");
    expect(scrollRegion.className).toContain("flex-1");
    expect(scrollRegion.className).toContain("overflow-y-auto");
    expect(scrollRegion.className).toContain("overscroll-contain");
    expect(scrollRegion.textContent).toContain("Editor da reserva");
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

  it("announces an initial API failure and allows a retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ positions: [] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<PortfolioClient activeView="overview" />);

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível carregar a carteira.",
    );
    expect(toastError).toHaveBeenCalledWith(
      "Não foi possível carregar a carteira.",
    );

    await screen
      .findByRole("button", { name: "Tentar novamente" })
      .then((button) => button.click());

    expect(await screen.findByText("Valor conhecido da carteira")).toBeTruthy();
  });

  it("keeps the loaded portfolio visible when a refresh fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ positions: [] }),
      })
      .mockRejectedValueOnce(new Error("network"));
    vi.stubGlobal("fetch", fetchMock);

    render(<PortfolioClient activeView="overview" />);
    await screen.findByText("Valor conhecido da carteira");

    window.dispatchEvent(new Event("portfolio:updated"));

    await vi.waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Valor conhecido da carteira")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows class distribution as unavailable in the rendered chart when allocation fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(<PortfolioClient activeView="overview" />);

    expect(
      await screen.findByText("Não foi possível carregar esta distribuição."),
    ).toBeTruthy();
  });

  it("shows an empty distribution when allocation succeeds without positions", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(<PortfolioClient activeView="overview" />);

    expect(
      await screen.findByText("Não há valores classificados disponíveis."),
    ).toBeTruthy();
  });
});
