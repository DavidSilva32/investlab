// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetClassLearningAssessment } from "@/app/(private)/learn/_components/asset-class-learning-assessment";
import { assetClassLearningContent } from "@/lib/asset-class-learning";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const questions = assetClassLearningContent.fiis.assessment;

async function answerQuestion(index: number, correctly: boolean) {
  const question = questions[index];
  const answerIndex = correctly
    ? question.correctOptionIndex
    : (question.correctOptionIndex + 1) % question.options.length;
  fireEvent.click(
    await screen.findByRole("radio", {
      name: question.options[answerIndex].text,
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Conferir resposta" }));
}

describe("AssetClassLearningAssessment", () => {
  it("calculates a passing score, awards a medal, and reports the completion", async () => {
    const onComplete = vi.fn().mockResolvedValue({ score: 8, passed: true });
    render(
      <AssetClassLearningAssessment
        questions={questions}
        onComplete={onComplete}
      />,
    );

    for (const [index] of questions.entries()) {
      await answerQuestion(index, index < 4);
      fireEvent.click(
        screen.getByRole("button", {
          name:
            index === questions.length - 1
              ? "Ver resultado"
              : "Próxima pergunta",
        }),
      );
    }

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        "Curso concluído!",
      ),
    );
    expect(screen.getByRole("status").textContent).toContain("8,0/10");
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: expect.any(String),
        answers: expect.any(Array),
      }),
    );
    expect(screen.getByRole("button", { name: "Refazer prova" })).toBeTruthy();
  });

  it("restores a failed result without a recorded best score", () => {
    render(
      <AssetClassLearningAssessment
        questions={questions}
        initialResult={{ score: 6, passed: false }}
      />,
    );

    expect(screen.getByRole("status").textContent).toContain(
      "Você está quase lá",
    );
    expect(screen.getByRole("status").textContent).toContain("6,0/10");
  });

  it("uses a passing result as the best score when no explicit best is saved", () => {
    render(
      <AssetClassLearningAssessment
        questions={questions}
        initialResult={{ score: 8, passed: true }}
      />,
    );

    expect(screen.getByRole("status").textContent).toContain(
      "Curso concluído!",
    );
    expect(screen.getByRole("status").textContent).toContain("8,0/10");
  });

  it("keeps a retry available below seven and resets the exam", async () => {
    render(<AssetClassLearningAssessment questions={questions} />);

    for (const [index] of questions.entries()) {
      await answerQuestion(index, index < 3);
      fireEvent.click(
        screen.getByRole("button", {
          name:
            index === questions.length - 1
              ? "Ver resultado"
              : "Próxima pergunta",
        }),
      );
    }

    expect(screen.getByRole("status").textContent).toContain(
      "Você está quase lá",
    );
    expect(screen.getByRole("status").textContent).toContain("6,0/10");
    fireEvent.click(screen.getByRole("button", { name: "Refazer prova" }));
    expect(screen.getByText("1 de 5")).toBeTruthy();
    await screen.findAllByRole("radio");
    expect(
      screen
        .getByRole("button", { name: "Conferir resposta" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.queryByText("6,0/10")).toBeNull();
  });

  it("keeps answers and the attempt id when saving fails, then retries", async () => {
    const onComplete = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce({ score: 10, passed: true });
    render(
      <AssetClassLearningAssessment
        questions={questions}
        onComplete={onComplete}
      />,
    );

    for (const [index] of questions.entries()) {
      await answerQuestion(index, true);
      fireEvent.click(
        screen.getByRole("button", {
          name:
            index === questions.length - 1
              ? "Ver resultado"
              : "Próxima pergunta",
        }),
      );
    }

    expect((await screen.findByRole("alert")).textContent).toContain(
      "suas respostas foram mantidas",
    );
    expect(screen.getByRole("button", { name: "Ver resultado" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ver resultado" }));

    await screen.findByText("Curso concluído!");
    expect(onComplete).toHaveBeenCalledTimes(2);
    expect(onComplete.mock.calls[0][0].attemptId).toBe(
      onComplete.mock.calls[1][0].attemptId,
    );
  });

  it("keeps a permanent approval after a lower retry and restores it after reload", async () => {
    const onComplete = vi
      .fn()
      .mockResolvedValueOnce({ score: 10, passed: true })
      .mockResolvedValueOnce({
        score: 6,
        passed: false,
        bestScore: 10,
        coursePassed: true,
      });
    const { rerender } = render(
      <AssetClassLearningAssessment
        questions={questions}
        onComplete={onComplete}
      />,
    );

    for (const [index] of questions.entries()) {
      await answerQuestion(index, true);
      fireEvent.click(
        screen.getByRole("button", {
          name:
            index === questions.length - 1
              ? "Ver resultado"
              : "Próxima pergunta",
        }),
      );
    }
    await screen.findByText("Curso concluído!");
    fireEvent.click(screen.getByRole("button", { name: "Refazer prova" }));

    for (const [index] of questions.entries()) {
      await answerQuestion(index, index < 3);
      fireEvent.click(
        screen.getByRole("button", {
          name:
            index === questions.length - 1
              ? "Ver resultado"
              : "Próxima pergunta",
        }),
      );
    }
    await screen.findByText("Sua aprovação continua registrada");
    expect(screen.getByRole("status").textContent).toContain("6,0/10");
    expect(screen.getByRole("status").textContent).toContain(
      "Melhor nota aprovada: 10,0/10",
    );

    rerender(
      <AssetClassLearningAssessment
        questions={questions}
        initialResult={{
          score: 6,
          passed: true,
          attemptPassed: false,
          bestScore: 10,
        }}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Curso concluído!",
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Melhor nota aprovada: 10,0/10",
    );
  });

  it("reshuffles the correct answer between question attempts without changing order while answering", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    render(<AssetClassLearningAssessment questions={questions.slice(0, 1)} />);

    await screen.findAllByRole("radio");
    const firstCorrectPosition = screen
      .getAllByRole("radio")
      .findIndex((radio) =>
        radio
          .closest("label")
          ?.textContent?.includes(questions[0].options[0].text),
      );
    await answerQuestion(0, false);
    const answeredCorrectPosition = screen
      .getAllByRole("radio")
      .findIndex((radio) =>
        radio
          .closest("label")
          ?.textContent?.includes(questions[0].options[0].text),
      );
    expect(answeredCorrectPosition).toBe(firstCorrectPosition);
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    const retryCorrectPosition = screen
      .getAllByRole("radio")
      .findIndex((radio) =>
        radio
          .closest("label")
          ?.textContent?.includes(questions[0].options[0].text),
      );
    expect(retryCorrectPosition).not.toBe(firstCorrectPosition);
  });
});
