// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StrategyGuidance } from "@/app/portfolio/_components/strategy-guidance";
import type { ContributionGuidance } from "@/lib/next-contribution-guidance";

describe("StrategyGuidance", () => {
  afterEach(() => cleanup());

  it.each([
    {
      status: "target_gap",
      title: "Considere Renda fixa para o próximo aporte",
      explanation: "A carteira está abaixo da meta registrada.",
      reserveNote: "A reserva ainda não está configurada.",
    },
    {
      status: "reserve_below_target",
      title: "Sua reserva está abaixo da meta pessoal",
      explanation: "Faltam R$ 1.000 para a meta que você definiu.",
    },
    {
      status: "unavailable",
      title: "Orientação temporariamente indisponível",
      explanation: "Não foi possível carregar os dados necessários.",
    },
  ] satisfies ContributionGuidance[])(
    "shows the existing $status answer, explanation and reserve note",
    (guidance) => {
      render(<StrategyGuidance nextContributionGuidance={guidance} />);

      expect(screen.getByText(guidance.title)).toBeTruthy();
      expect(screen.getByText(guidance.explanation)).toBeTruthy();
      if (guidance.reserveNote)
        expect(screen.getByText(guidance.reserveNote)).toBeTruthy();
      expect(screen.queryByRole("checkbox")).toBeNull();
      expect(screen.queryByRole("link")).toBeNull();
      expect(screen.queryByRole("button")).toBeNull();
    },
  );

  it("explains when the portfolio response omits next-contribution guidance", () => {
    render(<StrategyGuidance />);

    expect(
      screen.getByText("Orientação temporariamente indisponível"),
    ).toBeTruthy();
    expect(
      screen.getByText(/não chegou com os dados da carteira/i),
    ).toBeTruthy();
  });

  it("labels guidance based on the configured investment strategy", () => {
    render(
      <StrategyGuidance
        nextContributionGuidance={{
          status: "target_gap",
          title: "Considere Renda fixa para o próximo aporte",
          explanation: "A carteira está abaixo da meta registrada.",
          allocationMode: "strategy",
        }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Orientação da Estratégia" }),
    ).toBeTruthy();
  });
});
