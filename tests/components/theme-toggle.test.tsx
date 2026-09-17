// @vitest-environment jsdom
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  theme: "system" as string | undefined,
  setTheme: vi.fn(),
}));
vi.mock("next-themes", () => ({ useTheme: () => state }));
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onSelect,
  }: {
    children: React.ReactNode;
    onSelect: () => void;
  }) => <button onClick={onSelect}>{children}</button>,
}));

import { ThemeToggle } from "@/components/theme-toggle";

describe("ThemeToggle", () => {
  afterEach(() => {
    cleanup();
    state.theme = "system";
    state.setTheme.mockReset();
  });
  it("renders the selectable themes and changes the preference", () => {
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "Alternar tema" })).toBeTruthy();
    expect(screen.getByText("Tema: Sistema")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Escuro/ }));
    expect(state.setTheme).toHaveBeenCalledWith("dark");
  });
  it("uses the selected option and safely falls back to system", () => {
    state.theme = "dark";
    const { rerender } = render(<ThemeToggle />);
    expect(screen.getByText("Tema: Escuro")).toBeTruthy();
    expect(screen.getByText("Ativo")).toBeTruthy();
    state.theme = undefined;
    rerender(<ThemeToggle />);
    expect(screen.getByText("Tema: Sistema")).toBeTruthy();
  });
});
