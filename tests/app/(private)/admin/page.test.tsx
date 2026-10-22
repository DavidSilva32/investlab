import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import AdminDashboardPage from "@/app/(private)/admin/page";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({
    title,
    children,
  }: React.PropsWithChildren<{ title: string }>) => (
    <main data-title={title}>{children}</main>
  ),
}));
vi.mock("@/app/(private)/admin/users/_components/admin-users-client", () => ({
  AdminUsersClient: ({ initialTab }: { initialTab: string }) => (
    <section data-tab={initialTab}>Administração centralizada</section>
  ),
}));

describe("AdminDashboardPage", () => {
  it("renders the administration hub with the overview selected", () => {
    const html = renderToStaticMarkup(<AdminDashboardPage />);
    expect(html).toContain('data-title="Administração"');
    expect(html).toContain('data-tab="overview"');
    expect(html).toContain("Administração centralizada");
  });
});
