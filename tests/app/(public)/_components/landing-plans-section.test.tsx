// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LandingPlansSection } from "@/app/(public)/_components/landing-plans-section";

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

afterEach(cleanup);

describe("LandingPlansSection", () => {
  it("shows the free beta terms and a non-purchasable provisional Pro price", () => {
    render(<LandingPlansSection />);

    expect(screen.getByText("Beta gratuito")).toBeTruthy();
    expect(screen.getByText("R$ 0")).toBeTruthy();
    expect(screen.getByText(/30 dias após criar a conta/)).toBeTruthy();
    expect(screen.getByText(/somente para consulta/)).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /Criar conta beta gratuita/ })
        .getAttribute("href"),
    ).toBe("/cadastro");
    expect(screen.getByText("R$ 19,90")).toBeTruthy();
    expect(
      screen.getByText(/hipótese inicial, ainda sujeita a validação/i),
    ).toBeTruthy();
    expect(
      screen.getByText(/não há pagamento nem cobrança ativa/i),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Indisponível no momento" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
});
