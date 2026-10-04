// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  pathname: "/portfolio" as string | null,
}));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    "aria-current": ariaCurrent,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    "aria-current"?: "page";
  }) => (
    <a href={href} className={className} aria-current={ariaCurrent}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/logout-button", () => ({
  LogoutButton: () => <button>Sair</button>,
}));
import { AppShell } from "@/components/app-shell";

afterEach(cleanup);

describe("AppShell", () => {
  it("renders navigation, title and user context", () => {
    navigation.pathname = "/portfolio";
    render(
      <AppShell title="Carteira">
        <p>Conteúdo</p>
      </AppShell>,
    );
    expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Carteira").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Usuário autorizado").length).toBeGreaterThan(0);
    expect(
      screen
        .getAllByRole("link", { name: "Carteira" })
        .every((link) => link.getAttribute("aria-current") === "page"),
    ).toBe(true);
  });

  it("keeps the analysis navigation active on nested analysis paths", () => {
    navigation.pathname = "/analyses/screener";
    render(
      <AppShell title="Explorar">
        <p>Conteúdo</p>
      </AppShell>,
    );
    const links = screen.getAllByRole("link", { name: "Análises" });
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((link) => link.className.includes("bg-brand"))).toBe(
      true,
    );
    expect(
      links.every((link) => link.getAttribute("aria-current") === "page"),
    ).toBe(true);
  });

  it("handles a null pathname while rendering the navigation", () => {
    navigation.pathname = null;
    render(
      <AppShell title="Carregando">
        <p>Conteúdo</p>
      </AppShell>,
    );
    expect(
      screen.getAllByRole("navigation", { name: "Navegação principal" }).length,
    ).toBeGreaterThan(0);
  });
});
