import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import AdminUsersPage from "@/app/(private)/admin/users/page";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({
    title,
    children,
  }: React.PropsWithChildren<{ title: string }>) => (
    <main data-title={title}>{children}</main>
  ),
}));
vi.mock("@/app/(private)/admin/users/_components/admin-users-client", () => ({
  AdminUsersClient: () => <section>Gestão de usuários</section>,
}));

describe("AdminUsersPage", () => {
  it("renders the minimal user administration inside the application shell", () => {
    const html = renderToStaticMarkup(<AdminUsersPage />);
    expect(html).toContain('data-title="Usuários e acessos"');
    expect(html).toContain("Gestão de usuários");
  });
});
