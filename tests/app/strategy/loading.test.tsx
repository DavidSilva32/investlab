// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({
    children,
    title,
  }: {
    children: React.ReactNode;
    title: string;
  }) => <main data-title={title}>{children}</main>,
}));

import StrategyLoading from "@/app/strategy/loading";

describe("StrategyLoading", () => {
  it("keeps the Strategy shell and presents an accessible layout skeleton", () => {
    const html = renderToStaticMarkup(<StrategyLoading />);
    expect(html).toContain('data-title="Estrat');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('class="sr-only"');
    expect(html).not.toContain("xl:grid-cols-[minmax");
    expect((html.match(/animate-pulse/g) ?? []).length).toBeGreaterThan(10);
  });
});
