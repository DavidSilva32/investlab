// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-themes", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { ThemeProvider, useThemePalette } from "@/components/theme-provider";

function PaletteValue() {
  const { palette } = useThemePalette();
  return <span>{palette}</span>;
}

describe("ThemeProvider palette preference", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    delete document.documentElement.dataset.palette;
  });

  it("restores a valid palette from local storage", async () => {
    window.localStorage.setItem("investlab-palette", "teal");
    render(
      <ThemeProvider>
        <PaletteValue />
      </ThemeProvider>,
    );
    expect(await screen.findByText("teal")).toBeTruthy();
    expect(document.documentElement.dataset.palette).toBe("teal");
  });

  it("falls back to blue for invalid saved values", async () => {
    window.localStorage.setItem("investlab-palette", "dark");
    render(
      <ThemeProvider>
        <PaletteValue />
      </ThemeProvider>,
    );
    expect(await screen.findByText("blue")).toBeTruthy();
    expect(document.documentElement.dataset.palette).toBe("blue");
  });

  it("updates the active palette when another tab changes local storage", async () => {
    render(
      <ThemeProvider>
        <PaletteValue />
      </ThemeProvider>,
    );
    await screen.findByText("blue");
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "investlab-palette",
          newValue: "orange",
        }),
      );
    });
    expect(await screen.findByText("orange")).toBeTruthy();
    expect(document.documentElement.dataset.palette).toBe("orange");
  });
});
