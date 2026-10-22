// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetClassLearningAssessment } from "@/app/(private)/learn/_components/asset-class-learning-assessment";
import { assetClassLearningContent } from "@/lib/asset-class-learning";

vi.mock("@/app/(private)/learn/_components/asset-class-learning-quiz", () => ({
  AssetClassLearningQuiz: ({
    onAnswered,
  }: {
    onAnswered: (correct: boolean | null, selectedAnswerIndex?: number) => void;
  }) => (
    <button type="button" onClick={() => onAnswered(false)}>
      Enviar resposta sem índice
    </button>
  ),
}));

afterEach(cleanup);

describe("AssetClassLearningAssessment incomplete answer guard", () => {
  it("keeps the learner from submitting when an answer index is missing", () => {
    const onComplete = vi.fn();
    render(
      <AssetClassLearningAssessment
        questions={assetClassLearningContent.fiis.assessment.slice(0, 1)}
        onComplete={onComplete}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Enviar resposta sem índice" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Ver resultado" }));

    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Ver resultado" })).toBeTruthy();
  });
});
