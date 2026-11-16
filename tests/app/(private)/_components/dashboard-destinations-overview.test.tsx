// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardDestinationsOverview } from "@/app/(private)/_components/dashboard-destinations-overview";

afterEach(cleanup);

describe("DashboardDestinationsOverview", () => {
  it("shows each observed balance and goal without aggregating them as portfolio wealth", () => {
    render(
      <DashboardDestinationsOverview
        objectives={[
          {
            id: "reserve",
            kind: "RESERVE",
            name: "Reserva",
            currentValue: 50000,
            targetAmount: 55800,
            balanceTracking: {
              observedAmountCents: "5000000",
              observedOn: "2026-11-14",
            },
          },
          {
            id: "trip",
            kind: "CUSTOM",
            name: "Viagem",
            currentValue: 12300,
            targetAmount: 16000,
            balanceTracking: {
              observedAmountCents: "1230000",
              observedOn: "2026-11-14",
            },
          },
        ]}
      />,
    );

    expect(screen.getByText("Reserva")).toBeTruthy();
    expect(screen.getByText("Viagem")).toBeTruthy();
    expect(screen.getAllByText(/Informado em 14\/11\/2026/)).toHaveLength(2);
    expect(screen.getByText(/não são somados ao patrimônio/)).toBeTruthy();
    expect(screen.queryByText("Total da carteira")).toBeNull();
  });

  it("clearly asks for a balance when a goal has no observation", () => {
    render(
      <DashboardDestinationsOverview
        objectives={[
          {
            id: "trip",
            kind: "CUSTOM",
            name: "Viagem",
            currentValue: null,
            targetAmount: 16000,
            balanceTracking: null,
          },
        ]}
      />,
    );

    expect(screen.getByText("Saldo não informado")).toBeTruthy();
    expect(screen.getByText(/Informe o saldo do banco/)).toBeTruthy();
  });

  it("keeps the loading skeleton only until objectives are available", () => {
    render(
      <DashboardDestinationsOverview
        loading
        objectives={[
          {
            id: "trip",
            kind: "CUSTOM",
            name: "Viagem",
            currentValue: 250,
            targetAmount: null,
            balanceTracking: null,
          },
        ]}
      />,
    );

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Viagem")).toBeTruthy();
    expect(screen.getByText((text) => text.includes("250,00"))).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("keeps retry, loading, and read-only states accessible", () => {
    const onRetry = vi.fn();
    const onOpen = vi.fn();
    const { rerender } = render(
      <DashboardDestinationsOverview loading onOpenObjectives={onOpen} />,
    );
    expect(screen.getByRole("status")).toBeTruthy();

    rerender(
      <DashboardDestinationsOverview
        unavailable
        onRetry={onRetry}
        onOpenObjectives={onOpen}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(onRetry).toHaveBeenCalledOnce();

    rerender(
      <DashboardDestinationsOverview
        objectives={[]}
        readOnly
        onOpenObjectives={onOpen}
      />,
    );
    expect(screen.queryByRole("button", { name: /Ver objetivos/ })).toBeNull();
  });
});
