// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { ManualPositionManager } from "@/app/portfolio/_components/manual-position-manager";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ManualPositionManager", () => {
  it("opens an accessible form and explains that foreign conversion is explicit", () => {
    render(<ManualPositionManager positions={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /adicionar posição/i }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByLabelText("Ativo ou produto")).toBeTruthy();
    expect(
      screen.getByText(
        /não consulta cotação nem converte moeda automaticamente/i,
      ),
    ).toBeTruthy();
  });
});
