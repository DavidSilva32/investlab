// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/components/logout-button", () => ({
  LogoutButton: () => <button>Sair</button>,
}));
vi.mock("@/app/(private)/_components/dashboard-client", () => ({
  DashboardClient: ({ openImportOnLoad }: { openImportOnLoad?: boolean }) => (
    <p>openImport:{String(openImportOnLoad)}</p>
  ),
}));

import DashboardPage, { dynamic } from "@/app/(private)/dashboard/page";
import { ShellUserProvider } from "@/components/app-shell";
import { QueryClientWrapper } from "../../../utils/query-client-wrapper";

describe("DashboardPage", () => {
  it("renders only the API-backed dashboard shell", async () => {
    const page = await DashboardPage({
      searchParams: Promise.resolve({ openImport: "1" }),
    });
    const html = renderToStaticMarkup(
      <ShellUserProvider
        user={{
          name: "Test User",
          email: "user@example.com",
          role: "USER",
        }}
      >
        <QueryClientWrapper>{page}</QueryClientWrapper>
      </ShellUserProvider>,
    );
    expect(dynamic).toBe("force-dynamic");
    expect(html).toContain("Dashboard");
    expect(html).toContain("openImport:true");
    expect(html).not.toContain('href="/imports"');
  });
});
