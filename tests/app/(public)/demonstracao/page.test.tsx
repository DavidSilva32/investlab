// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

import DemoPage from "@/app/(public)/demonstracao/page";

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: class {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.callback(
        [
          {
            target,
            contentRect: { width: 500, height: 220 },
          } as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  },
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("fictional portfolio demonstration page", () => {
  it("introduces the interactive product preview and offers account access", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<DemoPage />);

    expect(
      screen.getByRole("heading", {
        name: "Sua carteira, objetivos e estratégia em contexto.",
      }),
    ).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Posições/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Objetivos/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Estratégia/ })).toBeTruthy();
    expect(screen.getByText(/cenário é totalmente fictício/)).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
    expect(
      screen
        .getByRole("link", { name: /Acessar a plataforma/ })
        .getAttribute("href"),
    ).toBe("/entrar");
  });
});
