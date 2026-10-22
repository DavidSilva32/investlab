// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-themes", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { ThemeProvider, useThemePalette } from "@/components/theme-provider";

function PaletteValue() {
  const { palette } = useThemePalette();
  return <span>{palette}</span>;
}

function PaletteControls() {
  const { palette, setPalette } = useThemePalette();
  return (
    <>
      <span>{palette}</span>
      <button onClick={() => setPalette("orange")}>Set palette</button>
      <button onClick={() => setPalette("unknown")}>Set invalid palette</button>
    </>
  );
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

  it("ignores storage events for other keys and resets when storage is cleared", async () => {
    render(
      <ThemeProvider>
        <PaletteValue />
      </ThemeProvider>,
    );
    await screen.findByText("blue");

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "unrelated-setting",
          newValue: "green",
        }),
      );
    });
    expect(screen.getByText("blue")).toBeTruthy();

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(screen.getByText("blue")).toBeTruthy();
    expect(document.documentElement.dataset.palette).toBe("blue");
  });

  it("keeps a selected palette active when browser storage rejects writes", async () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("Storage disabled");
      });
    render(
      <ThemeProvider>
        <PaletteControls />
      </ThemeProvider>,
    );
    await screen.findByText("blue");

    fireEvent.click(screen.getByRole("button", { name: "Set palette" }));
    expect(await screen.findByText("orange")).toBeTruthy();
    expect(document.documentElement.dataset.palette).toBe("orange");
    fireEvent.click(
      screen.getByRole("button", { name: "Set invalid palette" }),
    );
    expect(screen.getByText("orange")).toBeTruthy();
    setItem.mockRestore();
  });

  it("falls back to the default palette when browser storage rejects reads", async () => {
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("Storage disabled");
      });
    render(
      <ThemeProvider>
        <PaletteValue />
      </ThemeProvider>,
    );

    expect(await screen.findByText("blue")).toBeTruthy();
    expect(document.documentElement.dataset.palette).toBe("blue");
    getItem.mockRestore();
  });
});
