// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const supportState = vi.hoisted(() => ({
  value: false as boolean | null | "error",
}));

vi.mock("@/components/app-shell", () => ({
  useAdminSupportView: () => supportState.value,
}));
vi.mock("@/components/portfolio-import", () => ({
  PortfolioImport: () => <p>Prévia da importação da carteira</p>,
}));

import { PortfolioNavigation } from "@/app/(private)/portfolio/_components/portfolio-navigation";

afterEach(() => {
  cleanup();
  supportState.value = false;
  vi.restoreAllMocks();
});

describe("PortfolioNavigation", () => {
  it("links the three portfolio views and marks the current one", () => {
    const html = renderToStaticMarkup(
      <PortfolioNavigation activeView="movements" />,
    );
    expect(html).toContain('href="/carteira"');
    expect(html).toContain('href="/carteira?view=positions"');
    expect(html).toContain('href="/carteira?view=movements"');
    expect(html).toContain("Movimentações");
    expect(html).toContain("border-primary text-primary");
    expect(html).toContain('aria-current="page"');
  });

  it("opens the existing import drawer without leaving the portfolio", async () => {
    render(<PortfolioNavigation activeView="positions" />);

    const importButton = screen.getByRole("button", { name: "Importar dados" });
    expect(importButton.getAttribute("aria-haspopup")).toBe("dialog");
    expect(importButton.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(importButton);

    expect(
      await screen.findByText("Prévia da importação da carteira"),
    ).toBeTruthy();
    expect(importButton.getAttribute("aria-expanded")).toBe("true");
    expect(
      screen.getByRole("region", { name: "Importação e conciliação" }),
    ).toBeTruthy();
    expect(
      document
        .querySelector('a[href="/carteira?view=positions"]')
        ?.getAttribute("aria-current"),
    ).toBe("page");
  });

  it("hides import while support view is checking, read-only, or unavailable", () => {
    const { rerender } = render(<PortfolioNavigation activeView="overview" />);
    expect(screen.getByRole("button", { name: "Importar dados" })).toBeTruthy();

    supportState.value = null;
    rerender(<PortfolioNavigation activeView="overview" />);
    expect(screen.queryByRole("button", { name: "Importar dados" })).toBeNull();

    supportState.value = true;
    rerender(<PortfolioNavigation activeView="overview" />);
    expect(screen.queryByRole("button", { name: "Importar dados" })).toBeNull();

    supportState.value = "error";
    rerender(<PortfolioNavigation activeView="overview" />);
    expect(screen.queryByRole("button", { name: "Importar dados" })).toBeNull();
  });
});
