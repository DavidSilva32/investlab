// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useReducedMotion } from "@/lib/use-reduced-motion";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useReducedMotion", () => {
  it("disables animation when the browser cannot report the preference", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(renderHook(useReducedMotion).result.current).toBe(true);
  });

  it("uses a safe server snapshot without reading browser APIs", () => {
    const matchMedia = vi.fn();
    vi.stubGlobal("matchMedia", matchMedia);
    function Probe() {
      return <span>{String(useReducedMotion())}</span>;
    }
    expect(renderToString(<Probe />)).toContain("true");
    expect(matchMedia).not.toHaveBeenCalled();
  });

  it("updates when the operating system changes preference and unsubscribes", () => {
    const listeners = new Set<() => void>();
    const removeEventListener = vi.fn((_event, callback) =>
      listeners.delete(callback),
    );
    const media = {
      matches: false,
      addEventListener: vi.fn((_event, callback) => listeners.add(callback)),
      removeEventListener,
    };
    const matchMedia = vi.fn(() => media);
    vi.stubGlobal("matchMedia", matchMedia);
    const { result, unmount } = renderHook(useReducedMotion);
    expect(result.current).toBe(false);
    expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
    act(() => {
      media.matches = true;
      listeners.forEach((listener) => listener());
    });
    expect(result.current).toBe(true);
    act(() => {
      media.matches = false;
      listeners.forEach((listener) => listener());
    });
    expect(result.current).toBe(false);
    unmount();
    expect(removeEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
    expect(listeners.size).toBe(0);
  });
});
