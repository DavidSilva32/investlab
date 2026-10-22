// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { AssetClassLearningQuiz } from "@/app/(private)/learn/_components/asset-class-learning-quiz";

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

afterEach(cleanup);

describe("AssetClassLearningQuiz submit guard", () => {
  it("does not answer when a click arrives without a selected option", async () => {
    const onAnswered = vi.fn();
    render(
      <AssetClassLearningQuiz
        question="Escolha uma opção"
        options={[{ text: "Opção", explanation: "Explicação" }]}
        correctOptionIndex={0}
        onAnswered={onAnswered}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Conferir resposta" }),
    );

    expect(onAnswered).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
