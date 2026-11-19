// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  query: {
    isPending: false,
    isError: false,
    data: undefined as unknown,
    refetch: vi.fn(),
  },
}));

vi.mock("@/lib/queries/portfolio", () => ({
  usePortfolioProventos: () => state.query,
}));

import { PortfolioProventos } from "@/app/(private)/portfolio/_components/portfolio-proventos";

const emptyData = {
  items: [],
  latestImports: { received: null, upcoming: null },
};

afterEach(cleanup);
beforeEach(() => {
  state.query.isPending = false;
  state.query.isError = false;
  state.query.data = emptyData;
  state.query.refetch.mockReset();
});

describe("PortfolioProventos", () => {
  it("shows a loading status while the proventos query is pending", () => {
    state.query.isPending = true;

    render(<PortfolioProventos />);

    expect(screen.getByLabelText("Carregando proventos")).toBeTruthy();
  });

  it("offers retry on a query error and requests data again", () => {
    state.query.isError = true;

    render(<PortfolioProventos />);
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(screen.getByRole("alert").textContent).toContain(
      "Não foi possível carregar os proventos",
    );
    expect(state.query.refetch).toHaveBeenCalledOnce();
  });

  it("renders an empty state when no proventos have been imported", () => {
    render(<PortfolioProventos />);

    expect(screen.getAllByText("R$ 0,00")).toHaveLength(2);
    expect(
      screen.getByText("Importe seus relatórios de proventos"),
    ).toBeTruthy();
    expect(
      screen.getByText("Nenhum provento recebido foi importado ainda."),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "A B3 não informou proventos previstos nos arquivos importados.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "Simular como próximo aporte" }),
    ).toBeNull();
  });

  it("separates received and upcoming rows and links the latest received total to strategy", () => {
    state.query.data = {
      items: [
        {
          id: "received",
          fileName: "recebidos.xlsx",
          status: "RECEIVED",
          product: "HGLG11",
          eventType: "Rendimento",
          paymentDate: "2026-11-16",
          institution: "Inter",
          quantity: "2",
          unitPrice: "1.17",
          netValue: "2.34",
          importedAt: "2026-11-17T12:00:00.000Z",
        },
        {
          id: "upcoming",
          fileName: "a-receber.xlsx",
          status: "UPCOMING",
          product: "XPMI11",
          eventType: "Rendimento",
          paymentDate: "2026-12-01",
          institution: null,
          quantity: "1",
          unitPrice: "0.92",
          netValue: "0.92",
          importedAt: "2026-11-17T12:00:00.000Z",
        },
      ],
      latestImports: {
        received: {
          fileName: "recebidos.xlsx",
          importedAt: "2026-11-17T12:00:00.000Z",
          count: 1,
          total: 2.34,
        },
        upcoming: {
          fileName: "a-receber.xlsx",
          importedAt: "2026-11-17T12:00:00.000Z",
          count: 2,
          total: 1.84,
        },
      },
    };

    render(<PortfolioProventos />);

    expect(screen.getByText("HGLG11")).toBeTruthy();
    expect(screen.getByText("XPMI11")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Simular como próximo aporte" })
        .getAttribute("href"),
    ).toBe("/estrategia?aporteCents=234#next-contribution");
    expect(screen.getByText("1 registro · 17/11/2026")).toBeTruthy();
    expect(screen.getByText("2 previsões · 17/11/2026")).toBeTruthy();
    expect(screen.getByText("16/11/2026")).toBeTruthy();
    expect(screen.getByText("01/12/2026")).toBeTruthy();
  });

  it("uses plural and singular labels for the latest received and upcoming imports", () => {
    state.query.data = {
      items: [],
      latestImports: {
        received: {
          fileName: "recebidos.xlsx",
          importedAt: "2026-11-17T12:00:00.000Z",
          count: 2,
          total: 3.5,
        },
        upcoming: {
          fileName: "a-receber.xlsx",
          importedAt: "2026-11-18T12:00:00.000Z",
          count: 1,
          total: 1.25,
        },
      },
    };

    render(<PortfolioProventos />);

    expect(screen.getByText("2 registros · 17/11/2026")).toBeTruthy();
    expect(screen.getByText("1 previsão · 18/11/2026")).toBeTruthy();
  });

  it("refreshes when the import flow announces updated proventos", () => {
    const { unmount } = render(<PortfolioProventos />);

    window.dispatchEvent(new Event("proventos:updated"));
    expect(state.query.refetch).toHaveBeenCalledOnce();

    unmount();
    window.dispatchEvent(new Event("proventos:updated"));
    expect(state.query.refetch).toHaveBeenCalledOnce();
  });
});
