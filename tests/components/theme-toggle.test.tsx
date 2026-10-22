// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  theme: "system" as string | undefined,
  setTheme: vi.fn(),
  palette: "blue" as string,
  setPalette: vi.fn(),
}));
vi.mock("next-themes", () => ({
  useTheme: () => state,
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/theme-provider", () => ({
  useThemePalette: () => ({
    palette: state.palette,
    setPalette: state.setPalette,
  }),
}));

import { ThemeToggle } from "@/components/theme-toggle";

describe("ThemeToggle", () => {
  afterEach(() => {
    cleanup();
    state.theme = "system";
    state.palette = "blue";
    state.setTheme.mockReset();
    state.setPalette.mockReset();
  });
  it("keeps appearance and palette choices independent", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    expect(
      screen.getByRole("button", { name: "Aparência e cores" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Aparência e cores" }));
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(9);
    expect(
      screen
        .getByRole("group", { name: "Aparência" })
        .classList.contains("space-y-1"),
    ).toBe(true);
    for (const palette of [
      "blue",
      "teal",
      "green",
      "violet",
      "orange",
      "rose",
    ]) {
      const radio = screen.getByRole("menuitemradio", {
        name: themeLabel(palette),
      });
      expect(radio.querySelector(`[data-palette="${palette}"]`)).not.toBeNull();
    }
    expect(
      screen
        .getByRole("menuitemradio", { name: "Automático" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    await user.click(screen.getByRole("menuitemradio", { name: "Escuro" }));
    expect(state.setTheme).toHaveBeenCalledWith("dark");
    await user.click(screen.getByRole("button", { name: "Aparência e cores" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Verde" }));
    expect(state.setTheme).toHaveBeenCalledTimes(1);
    expect(state.setPalette).toHaveBeenCalledWith("green");
  });
  it("supports keyboard selection", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    const trigger = screen.getByRole("button", { name: "Aparência e cores" });
    trigger.focus();
    await user.keyboard("{Enter}{ArrowDown}{Enter}");
    expect(state.setTheme).toHaveBeenCalledWith("dark");
  });

  it("uses automatic appearance when next-themes has not resolved it yet", () => {
    state.theme = undefined;
    render(<ThemeToggle />);

    expect(screen.getByText("Aparência: Automático; cor: Azul")).toBeTruthy();
  });

  it("falls back to the first palette when the context value is unsupported", () => {
    state.palette = "unsupported";
    render(<ThemeToggle />);

    expect(screen.getByText("Aparência: Automático; cor: Azul")).toBeTruthy();
  });
  it("changes palette without changing the appearance preference", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole("button", { name: "Aparência e cores" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Rosa" }));
    expect(state.setTheme).not.toHaveBeenCalled();
    expect(state.setPalette).toHaveBeenCalledWith("rose");
  });
});

function themeLabel(palette: string) {
  return {
    blue: "Azul",
    teal: "Turquesa",
    green: "Verde",
    violet: "Violeta",
    orange: "Laranja",
    rose: "Rosa",
  }[palette];
}
