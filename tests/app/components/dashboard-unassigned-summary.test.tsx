// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardUnassignedSummary } from "@/app/_components/dashboard-unassigned-summary";

describe("DashboardUnassignedSummary", () => {
  afterEach(cleanup);

  it("shows the known unassigned amount, position count, and objective link", () => {
    const html = renderToStaticMarkup(
      <DashboardUnassignedSummary
        summary={{
          status: "loaded",
          knownValue: 1250,
          positionCount: 2,
          unvaluedPositionCount: 1,
        }}
      />,
    );

    expect(html).toContain("Patrimônio conhecido sem destino");
    expect(html).toContain("2 posições ainda não associadas a um objetivo");
    expect(html).toContain("1 sem valor atual");
    expect(html).toContain('href="/portfolio?panel=objectives"');
    expect(html).toContain("Ver objetivos");
  });

  it("retries an unavailable destination summary", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <DashboardUnassignedSummary
        summary={{ status: "unavailable" }}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole("status").textContent).toContain(
      "Nenhum valor foi presumido",
    );
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("omits the destination card before a result is available", () => {
    expect(
      renderToStaticMarkup(<DashboardUnassignedSummary summary={null} />),
    ).toBe("");
  });

  it("shows a section-shaped skeleton while its independent query is pending", () => {
    render(<DashboardUnassignedSummary summary={null} loading />);
    expect(
      screen
        .getByRole("region", { name: "Carregando patrimônio sem destino" })
        .getAttribute("aria-busy"),
    ).toBe("true");
    expect(
      screen.getByText("Carregando patrimônio conhecido sem destino"),
    ).toBeTruthy();
  });
});
