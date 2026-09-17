// @vitest-environment jsdom
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ usePathname: () => "/portfolio" }));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/logout-button", () => ({
  LogoutButton: () => <button>Sair</button>,
}));
import { AppShell } from "@/components/app-shell";
describe("AppShell", () => {
  it("renders navigation, title and user context", () => {
    render(
      <AppShell title="Carteira">
        <p>Conteúdo</p>
      </AppShell>,
    );
    expect(screen.getByText("Dashboard")).toBeTruthy();
    expect(screen.getAllByText("Carteira")).toHaveLength(2);
    expect(screen.getByText("Usuário autorizado")).toBeTruthy();
  });
});
