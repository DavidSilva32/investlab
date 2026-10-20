// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("next/image", () => ({
  default: ({
    unoptimized: _unoptimized,
    alt,
    src,
  }: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => (
    <span aria-label={alt} data-src={src} role="img" />
  ),
}));

import { McpConnectionValues } from "@/app/(public)/mcp/_components/mcp-connection-values";
import { toast } from "sonner";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("McpConnectionValues", () => {
  it("shows localized connection values and a visible branded icon download", () => {
    render(
      <McpConnectionValues endpoint="https://investlab.example/api/mcp" />,
    );

    expect(screen.getByText("InvestLab")).toBeTruthy();
    expect(screen.getByText("Nome do servidor (Name)")).toBeTruthy();
    expect(screen.getByText("Descrição (Description)")).toBeTruthy();
    expect(screen.getByText("Endereço do servidor (Server URL)")).toBeTruthy();
    expect(screen.getByText("Autenticação (Authentication)")).toBeTruthy();
    expect(
      screen.getByText(
        "Consulta somente leitura de carteira, operações, objetivos, estratégia, simulações e cotações B3 no InvestLab.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("https://investlab.example/api/mcp")).toBeTruthy();
    expect(screen.getByText("OAuth · descoberta automática")).toBeTruthy();
    expect(
      screen
        .getByRole("img", { name: "Logo do InvestLab" })
        .getAttribute("data-src"),
    ).toBe("/investlab-logo.png");
    expect(
      screen
        .getByRole("link", { name: /Baixar logo do InvestLab/ })
        .getAttribute("href"),
    ).toBe("/investlab-logo.png");
    expect(
      screen
        .getByRole("link", { name: /Baixar logo do InvestLab/ })
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

    await user.click(
      screen.getByRole("button", { name: "Copiar nome do servidor" }),
    );
    expect(writeText).toHaveBeenCalledWith("InvestLab");
    expect(toast.success).toHaveBeenCalledWith("Nome do servidor copiado.");

    writeText.mockRejectedValueOnce(new Error("clipboard unavailable"));
    await user.click(screen.getByRole("button", { name: "Copiar descrição" }));
    expect(toast.error).toHaveBeenCalledWith(
      "Não foi possível copiar. Selecione e copie o valor.",
    );

    writeText.mockResolvedValueOnce(undefined);
    await user.click(
      screen.getByRole("button", { name: "Copiar endereço do servidor" }),
    );
    expect(writeText).toHaveBeenLastCalledWith(
      "https://investlab.example/api/mcp",
    );
    expect(toast.success).toHaveBeenCalledWith("Endereço do servidor copiado.");
  });
});
