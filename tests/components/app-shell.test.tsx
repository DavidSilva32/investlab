// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  pathname: "/carteira" as string | null,
}));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    onClick,
    "aria-current": ariaCurrent,
    "aria-label": ariaLabel,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    onClick?: React.MouseEventHandler<HTMLAnchorElement>;
    "aria-current"?: "page";
    "aria-label"?: string;
  }) => (
    <a
      href={href}
      className={className}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
      }}
      aria-current={ariaCurrent}
      aria-label={ariaLabel}
    >
      {children}
    </a>
  ),
}));
vi.mock("@/components/logout-button", () => ({
  LogoutButton: () => <button>Sair</button>,
}));
import { AppShell, ShellUserProvider } from "@/components/app-shell";
import type { ShellUser } from "@/components/app-shell";
import { BrandLogo } from "@/components/brand-logo";

const admin = {
  name: "David Silva",
  email: "david@example.com",
  role: "ADMIN" as const,
};
const regularUser = { ...admin, role: "USER" as const };

function renderShell(user: ShellUser = regularUser) {
  return render(
    <ShellUserProvider user={user}>
      <AppShell title="Carteira">
        <p>Conteúdo</p>
      </AppShell>
    </ShellUserProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AppShell", () => {
  it("renders the authenticated identity and active navigation without fetching the session", () => {
    navigation.pathname = "/carteira";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderShell();

    expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0);
    expect(screen.getAllByText("David Silva").length).toBeGreaterThan(0);
    expect(screen.getAllByText("david@example.com").length).toBeGreaterThan(0);
    expect(screen.queryByText("Usuário autorizado")).toBeNull();
    expect(screen.queryByRole("link", { name: "Configurações" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen
        .getAllByRole("link", { name: "Carteira" })
        .every((link) => link.getAttribute("aria-current") === "page"),
    ).toBe(true);
    expect(
      screen
        .getByRole("link", { name: "InvestLab, página inicial" })
        .getAttribute("href"),
    ).toBe("/");
    const symbol = screen.getByTestId("investlab-symbol");
    expect(symbol.getAttribute("aria-hidden")).toBe("true");
    const gradientIds = Array.from(
      symbol.querySelectorAll("linearGradient"),
    ).map((gradient) => gradient.id);
    const paintReferences = Array.from(
      symbol.querySelectorAll("[fill], [stroke]"),
    )
      .map(
        (shape) => shape.getAttribute("fill") ?? shape.getAttribute("stroke"),
      )
      .filter((paint) => paint?.startsWith("url(#"))
      .map((paint) => paint?.slice(5, -1));
    expect(paintReferences.length).toBeGreaterThan(0);
    paintReferences.forEach((id) => expect(gradientIds).toContain(id));
  });

  it("uses the semantic high-contrast sidebar surface and visible focus ring", () => {
    navigation.pathname = "/carteira";
    renderShell();

    const sidebar = screen.getByRole("complementary");
    expect(sidebar.className).toContain("bg-sidebar-background");
    expect(sidebar.className).toContain("text-sidebar-foreground");
    expect(sidebar.className).toContain("border-sidebar-border");
    expect(
      screen.getAllByRole("link", { name: "Carteira" })[0].className,
    ).toContain("focus-visible:ring-sidebar-ring");
  });

  it("groups administration in a disclosure for admins and keeps the current route open", () => {
    navigation.pathname = "/admin/usuarios";
    renderShell(admin);

    expect(
      screen.getAllByRole("button", { name: "Administração" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: "Usuários" }).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Configurações" })).toHaveLength(
      1,
    );
    expect(
      screen
        .getAllByRole("link", { name: "Usuários" })
        .every((link) => link.getAttribute("aria-current") === "page"),
    ).toBe(true);
  });

  it("allows an admin to open the administration disclosure from another route", async () => {
    navigation.pathname = "/carteira";
    const user = userEvent.setup();
    renderShell(admin);

    expect(screen.queryByRole("link", { name: "Usuários" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Administração" }));
    expect(screen.getByRole("link", { name: "Usuários" })).toBeTruthy();
  });

  it("closes the mobile menu after choosing the users page", async () => {
    navigation.pathname = "/admin/usuarios";
    const user = userEvent.setup();
    renderShell(admin);

    await user.click(screen.getByRole("button", { name: "Abrir menu" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("link", { name: "Usuários" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows the non-active users link in the mobile admin disclosure and closes after selection", async () => {
    navigation.pathname = "/carteira";
    const user = userEvent.setup();
    renderShell(admin);

    await user.click(screen.getByRole("button", { name: "Abrir menu" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Administração" }),
    );
    const usersLink = within(dialog).getByRole("link", { name: "Usuários" });
    expect(usersLink.getAttribute("href")).toBe("/admin/usuarios");
    expect(usersLink.hasAttribute("aria-current")).toBe(false);

    await user.click(usersLink);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("does not show administration for regular users", () => {
    navigation.pathname = "/analises/filtros";
    renderShell();
    expect(screen.queryByRole("button", { name: "Administração" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Usuários" })).toBeNull();
    const links = screen.getAllByRole("link", { name: "Análises" });
    expect(links.length).toBeGreaterThan(0);
    expect(
      links.every((link) => link.getAttribute("aria-current") === "page"),
    ).toBe(true);
  });

  it("supports a null pathname while rendering navigation", () => {
    navigation.pathname = null;
    renderShell();
    expect(
      screen.getAllByRole("navigation", { name: "Navegação principal" }),
    ).toHaveLength(1);
  });

  it("falls back to the account email when the profile has no name", () => {
    navigation.pathname = "/";
    renderShell({ ...regularUser, name: "" });
    expect(screen.getAllByText("david@example.com").length).toBeGreaterThan(0);
  });

  it("requires the authenticated server identity provider", () => {
    expect(() =>
      render(
        <AppShell title="Carteira">
          <p>Conteúdo</p>
        </AppShell>,
      ),
    ).toThrow("AppShell precisa ser renderizado dentro de ShellUserProvider.");
  });

  it("supports the isolated brand symbol variant", () => {
    render(<BrandLogo symbolOnly />);
    expect(screen.getByTestId("investlab-symbol")).toBeTruthy();
    expect(screen.queryByText("InvestLab")).toBeNull();
  });
});
