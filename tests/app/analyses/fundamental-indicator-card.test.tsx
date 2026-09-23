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
      await screen.findByText(/Compara o valor de mercado da empresa/i),
    ).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(
      screen.queryByText(/Compara o valor de mercado da empresa/i),
    ).toBeNull();
  });

  it("keeps a precise unavailable reason", () => {
    render(
      <FundamentalIndicatorCard
        indicator={{
          key: "roe",
          value: null,
          unavailableReason:
            "Indisponível: são necessárias demonstrações financeiras anuais de dois anos consecutivos, com lucro líquido e patrimônio líquido informados.",
          referenceDate: null,
          sourceDocument: null,
        }}
      />,
    );
    expect(screen.getByText("Indisponível")).toBeTruthy();
    expect(
      screen.getByText(
        "Indisponível: são necessárias demonstrações financeiras anuais de dois anos consecutivos, com lucro líquido e patrimônio líquido informados.",
      ),
    ).toBeTruthy();
  });
});
