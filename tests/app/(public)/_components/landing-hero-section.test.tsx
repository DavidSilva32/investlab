// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
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

import { LandingHeroSection } from "@/app/(public)/_components/landing-hero-section";

afterEach(cleanup);

describe("LandingHeroSection", () => {
  it("shows the main value proposition and clear demonstration and sign-in actions", () => {
    render(<LandingHeroSection />);

    expect(
      screen.getByRole("heading", {
        name: "Entenda o que você tem. Cuide do que importa.",
      }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Explorar a demonstração" })
        .getAttribute("href"),
    ).toBe("/demonstracao");
    expect(
      screen
        .getByRole("link", { name: "Entre na sua conta" })
        .getAttribute("href"),
    ).toBe("/entrar");
  });

  it("clearly marks the sample portfolio as fictional", () => {
    render(<LandingHeroSection />);

    expect(
      screen.getByRole("region", {
        name: "Prévia fictícia da carteira no InvestLab",
      }),
    ).toBeTruthy();
    expect(screen.getByText("R$ 46.000,00")).toBeTruthy();
    expect(screen.getByText("Cenário fictício")).toBeTruthy();
    expect(screen.getByText(/Valores e percentuais fictícios/)).toBeTruthy();
  });
});
