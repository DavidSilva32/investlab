// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FundamentalIndicatorCard } from "@/app/analyses/_components/fundamental-indicator-card";

describe("FundamentalIndicatorCard", () => {
  it("formats multiples as x and opens its explanation by click", async () => {
    render(
      <FundamentalIndicatorCard
        indicator={{
          key: "pe",
          value: 8.4,
          unavailableReason: null,
          referenceDate: "2025-12-31",
          sourceDocument: "DFP",
        }}
      />,
    );
    expect(screen.getByText("8.4x")).toBeTruthy();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Ajuda sobre P/L" }));
    expect(
      await screen.findByText(/valor de mercado ao lucro líquido/i),
    ).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByText(/valor de mercado ao lucro líquido/i)).toBeNull();
  });

  it("keeps a precise unavailable reason", () => {
    render(
      <FundamentalIndicatorCard
        indicator={{
          key: "roe",
          value: null,
          unavailableReason: "São necessários dois DFPs anuais.",
          referenceDate: null,
          sourceDocument: null,
        }}
      />,
    );
    expect(screen.getByText("Indisponível")).toBeTruthy();
    expect(screen.getByText("São necessários dois DFPs anuais.")).toBeTruthy();
  });
});
