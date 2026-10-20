// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PresentationPage from "@/app/(public)/apresentacao/page";

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

describe("public presentation route", () => {
  it("reuses the public landing content and keeps its demo and sign-in paths", () => {
    render(<PresentationPage />);

    expect(
      screen.getByRole("heading", {
        name: "Mais clareza para cuidar do seu patrimônio inteiro.",
      }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /Conhecer a demonstração/ })
        .getAttribute("href"),
    ).toBe("/demonstracao");
    expect(
      screen
        .getByRole("link", { name: /Acessar minha conta/ })
        .getAttribute("href"),
    ).toBe("/entrar");
  });
});
