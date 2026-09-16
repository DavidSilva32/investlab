// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme: vi.fn() }),
}));

import { ThemeToggle } from "@/components/theme-toggle";

describe("ThemeToggle", () => {
  it("exposes an accessible theme control and current system preference", () => {
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "Alternar tema" })).toBeTruthy();
    expect(screen.getByText("Tema: Sistema")).toBeTruthy();
  });
});
