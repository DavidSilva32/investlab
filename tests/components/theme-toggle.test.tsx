// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  theme: "system" as string | undefined,
  setTheme: vi.fn(),
}));
vi.mock("next-themes", () => ({
  useTheme: () => state,
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";

describe("ThemeToggle", () => {
  afterEach(() => {
    cleanup();
    state.theme = "system";
    state.setTheme.mockReset();
  });
  it("keeps appearance and palette choices independent", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    expect(
      screen.getByRole("button", { name: "Aparência e cores" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Aparência e cores" }));
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(9);
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
    expect(window.localStorage.getItem("investlab-palette")).toBe("green");
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
  it("changes palette without changing the appearance preference", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Aparência e cores" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Rosa" }));
    expect(state.setTheme).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("investlab-palette")).toBe("rose");
    expect(screen.getByText(/cor: Rosa/)).toBeTruthy();
  });
});
