// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  PortfolioChatAssetList,
  PortfolioChatThinkingIndicator,
} from "@/components/portfolio-chat-query-result";

vi.mock("next/image", () => ({
  default: ({ alt, className }: { alt: string; className?: string }) => (
    <span data-alt={alt} className={className} />
  ),
}));

describe("portfolio chat query result", () => {
  afterEach(cleanup);

  it("shows an accessible animated assistant status while checking the portfolio", () => {
    render(<PortfolioChatThinkingIndicator />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Conferindo sua carteira");
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
    expect(status.querySelectorAll("[aria-hidden='true'] > span")).toHaveLength(
      3,
    );
    expect(status.querySelector("[data-alt]")?.getAttribute("data-alt")).toBe(
      "",
    );
    expect(status.querySelector("[style]")?.className).toContain(
      "motion-reduce:animate-none",
    );
  });

  it("uses a context-specific label while checking objectives", () => {
    render(
      <PortfolioChatThinkingIndicator message="Conferindo seus objetivos" />,
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Conferindo seus objetivos",
    );
  });

  it("lists source position identity without deriving missing tickers", () => {
    render(
      <PortfolioChatAssetList
        items={[
          {
            id: "itub4",
            product: "Ação preferencial",
            assetCode: "ITUB4",
            issuer: "Itaú Unibanco",
            institution: "Corretora",
            valueCents: "12345",
          },
          {
            id: "unknown-code",
            product: "Fundo imobiliário",
            assetCode: null,
            issuer: null,
            institution: "Administradora",
            valueCents: null,
          },
        ]}
      />,
    );
    expect(screen.getByText("ITUB4").textContent).toContain(
      "Ação preferencial",
    );
    expect(screen.getByText("Itaú Unibanco")).toBeTruthy();
    expect(screen.getByText(/R\$\s*123,45/)).toBeTruthy();
    expect(screen.getByText("Fundo imobiliário")).toBeTruthy();
    expect(screen.queryByText("HGLG11")).toBeNull();
    expect(screen.getByText("Administradora")).toBeTruthy();
  });
});
