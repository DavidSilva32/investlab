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
        name: "Organize seus investimentos em um só lugar.",
      }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /Explorar demonstração/ })
        .getAttribute("href"),
    ).toBe("/demonstracao");
    expect(
      screen
        .getByRole("link", { name: "Entrar na plataforma" })
        .getAttribute("href"),
    ).toBe("/entrar");
  });
});
