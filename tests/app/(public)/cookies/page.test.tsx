// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CookiePolicyPage from "@/app/(public)/cookies/page";

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

describe("CookiePolicyPage", () => {
  it("explains the separate cookie choice and shows its draft status", () => {
    render(<CookiePolicyPage />);
    const pageText = screen.getByRole("main").textContent ?? "";

    expect(
      screen.getByRole("heading", { name: "Política de Cookies", level: 1 }),
    ).toBeTruthy();
    expect(screen.getByText("Rascunho em revisão")).toBeTruthy();
    expect(pageText).toMatch(/aceitar cookies ou rejeitar os opcionais/);
    expect(pageText).toMatch(/necessários.*permanecem ativos/i);
    expect(pageText).toMatch(
      /não foram identificadas tecnologias opcionais em uso/i,
    );
    expect(pageText).not.toMatch(/Better Auth|runtime/i);
  });
});
