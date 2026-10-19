// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { McpConnectionValues } from "@/app/(public)/mcp/_components/mcp-connection-values";
import { toast } from "sonner";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("McpConnectionValues", () => {
  it("shows the values to enter and the downloadable branded PNG", () => {
    render(
      <McpConnectionValues endpoint="https://investlab.example/api/mcp" />,
    );

    expect(screen.getByText("InvestLab")).toBeTruthy();
    expect(
      screen.getByText(
        "Consulta somente leitura de carteira, operações, objetivos, estratégia, simulações e cotações B3 no InvestLab.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("https://investlab.example/api/mcp")).toBeTruthy();
    expect(screen.getByText("OAuth")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /Baixar ícone PNG/ })
        .getAttribute("href"),
    ).toBe("/investlab-logo.png");
    expect(
      screen
        .getByRole("link", { name: /Baixar ícone PNG/ })
        .getAttribute("download"),
    ).toBe("investlab-logo.png");
  });

  it("copies each connection field and reports copy failures safely", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(
      <McpConnectionValues endpoint="https://investlab.example/api/mcp" />,
    );

    await user.click(screen.getByRole("button", { name: "Copiar Name" }));
    expect(writeText).toHaveBeenCalledWith("InvestLab");
    expect(toast.success).toHaveBeenCalledWith("Name copiado.");

    writeText.mockRejectedValueOnce(new Error("clipboard unavailable"));
    await user.click(
      screen.getByRole("button", { name: "Copiar Description" }),
    );
    expect(toast.error).toHaveBeenCalledWith(
      "Não foi possível copiar. Selecione e copie o valor.",
    );
  });
});
