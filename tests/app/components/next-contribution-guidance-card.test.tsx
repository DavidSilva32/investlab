// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NextContributionGuidanceCard } from "@/app/_components/next-contribution-guidance-card";

const guidance = {
  status: "target_gap" as const,
  title: "Considere Renda fixa para o próximo aporte",
  explanation: "Está abaixo da meta da sua estratégia pessoal.",
  assetClass: "Renda fixa",
  currentPercentage: 30,
  targetPercentage: 50,
  reserveNote: "A reserva ainda não está configurada.",
};

describe("NextContributionGuidanceCard", () => {
  it("renders the comparison, caveat, and route to review the strategy", () => {
    render(<NextContributionGuidanceCard guidance={guidance} />);
    expect(
      screen.getByRole("heading", { name: "Orientação para o próximo aporte" }),
    ).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(guidance.title);
    expect(screen.getByText(guidance.reserveNote)).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Revisar estratégia e classificações" })
        .getAttribute("href"),
    ).toBe("/portfolio");
  });
  it("renders nothing when the API does not include guidance", () => {
    const { container } = render(<NextContributionGuidanceCard />);
    expect(container.firstChild).toBeNull();
  });
});
