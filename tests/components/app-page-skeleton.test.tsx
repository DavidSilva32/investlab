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
import { AppPageSkeleton } from "@/components/app-page-skeleton";

describe("AppPageSkeleton", () => {
  it.each([
    ["Dashboard", "dashboard"],
    ["Carteira", "portfolio"],
    ["Importações", "form"],
    ["Análises", "placeholder"],
  ] as const)("renders the %s %s skeleton", (title, variant) => {
    const html = renderToStaticMarkup(
      <AppPageSkeleton title={title} variant={variant} />,
    );
    expect(html).toContain(`data-title="${title}"`);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain(`Carregando ${title.toLowerCase()}`);
    expect(html).toContain("animate-pulse");
  });
});
