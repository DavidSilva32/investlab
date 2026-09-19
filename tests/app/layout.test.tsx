// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/sonner", () => ({
  Toaster: () => <div data-testid="toaster" />,
}));

import RootLayout, { metadata } from "@/app/layout";

describe("RootLayout", () => {
  it("declares application metadata, Portuguese document language, and global feedback", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: () => ({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });
    expect(metadata).toMatchObject({ title: "InvestLab" });
    const markup = renderToStaticMarkup(
      <RootLayout>
        <main>content</main>
      </RootLayout>,
    );
    expect(markup).toContain('<html lang="pt-BR">');
    expect(markup).toContain('data-testid="toaster"');
  });
});
