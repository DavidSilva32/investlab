// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DashboardQuickActions } from "@/app/_components/dashboard-quick-actions";

afterEach(cleanup);

describe("DashboardQuickActions", () => {
  it("exposes manual-position, import, and objectives links with one primary action", () => {
    render(<DashboardQuickActions />);

    expect(screen.getByRole("region", { name: "Ações rápidas" })).toBeTruthy();
    const manual = screen.getByRole("link", {
      name: "Adicionar posição manual",
    });
    expect(manual.getAttribute("href")).toBe("/portfolio#manual-positions");
    expect(manual.className).toContain("bg-primary");
    expect(
      screen
        .getByRole("link", { name: "Importar e conciliar" })
        .getAttribute("href"),
    ).toBe("/imports");
    expect(
      screen.getByRole("link", { name: "Ver objetivos" }).getAttribute("href"),
    ).toBe("/portfolio?panel=objectives");
    expect(screen.getByText(/quando houver correspondência/)).toBeTruthy();
  });
});
