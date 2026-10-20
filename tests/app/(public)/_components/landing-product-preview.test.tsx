// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { LandingProductPreview } from "@/app/(public)/_components/landing-product-preview";

afterEach(cleanup);

describe("LandingProductPreview", () => {
  it("shows the fictional position sample by default", () => {
    render(<LandingProductPreview />);

    expect(
      screen
        .getByRole("tab", { name: "Posições" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByText("R$ 46.000,00")).toBeTruthy();
    expect(screen.getByText("CDB de exemplo")).toBeTruthy();
    expect(
      screen.getByText(
        /Dados, pessoas, instituições e percentuais são fictícios/,
      ),
    ).toBeTruthy();
  });

  it("switches between objectives and strategy with accessible tabs", async () => {
    const user = userEvent.setup();
    render(<LandingProductPreview />);

    await user.click(screen.getByRole("tab", { name: "Objetivos" }));
    expect(
      screen
        .getByRole("tab", { name: "Objetivos" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByText("Reserva de exemplo")).toBeTruthy();
    expect(screen.getByText("R$ 12.600,00")).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Estratégia" }));
    expect(
      screen
        .getByRole("tab", { name: "Estratégia" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByText("Ações e BDRs")).toBeTruthy();
    expect(screen.getByText(/Não é uma sugestão de investimento/)).toBeTruthy();
  });

  it("links the preview to the public interactive demonstration", () => {
    render(<LandingProductPreview />);

    expect(
      screen
        .getByRole("link", { name: /Abrir demonstração/ })
        .getAttribute("href"),
    ).toBe("/demonstracao");
  });
});
