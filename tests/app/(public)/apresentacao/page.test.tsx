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
        name: "Entenda o que você tem. Cuide do que importa.",
      }),
    ).toBeTruthy();
    expect(
      screen
        .getAllByRole("link", { name: /Explorar a demonstração/ })
        .map((link) => link.getAttribute("href")),
    ).toEqual(["/demonstracao", "/demonstracao"]);
    expect(
      screen
        .getByRole("link", { name: /Entre na sua conta/ })
        .getAttribute("href"),
    ).toBe("/entrar");
  });
});
