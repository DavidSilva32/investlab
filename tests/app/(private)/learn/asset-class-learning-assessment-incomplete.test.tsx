// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetClassLearningAssessment } from "@/app/(private)/learn/_components/asset-class-learning-assessment";
import { assetClassLearningContent } from "@/lib/asset-class-learning";

vi.mock("@/app/(private)/learn/_components/asset-class-learning-quiz", () => ({
  AssetClassLearningQuiz: ({
    onAnswered,
  }: {
    onAnswered?: (
      correct: boolean | null,
      selectedAnswerIndex?: number,
    ) => void;
  }) => (
    <button type="button" onClick={() => onAnswered?.(true)}>
      Simular resposta sem opção registrada
    </button>
  ),
}));

afterEach(cleanup);

describe("AssetClassLearningAssessment incomplete answer guard", () => {
  it("keeps the result hidden when no answer choice was recorded", () => {
    render(
      <AssetClassLearningAssessment
        questions={assetClassLearningContent.fiis.assessment.slice(0, 1)}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Simular resposta sem opção registrada",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Ver resultado" }));

    expect(screen.getByRole("button", { name: "Ver resultado" })).toBeTruthy();
    expect(
      screen.queryByRole("status", { name: "Conferindo suas respostas" }),
    ).toBeNull();
    expect(screen.queryByText("Você conquistou sua medalha!")).toBeNull();
  });
});
