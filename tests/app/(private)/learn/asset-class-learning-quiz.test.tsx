// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetClassLearningQuiz } from "@/app/(private)/learn/_components/asset-class-learning-quiz";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const quiz = {
  question: "O que representa uma cota?",
  options: [
    { text: "Uma participação no fundo.", explanation: "Certa explicação." },
    {
      text: "Um rendimento garantido.",
      explanation: "Essa renda não é garantida.",
    },
    {
      text: "Uma dívida pública.",
      explanation: "Isso descreve outro produto.",
    },
    {
      text: "A propriedade de todo o fundo.",
      explanation: "A cota é uma fração.",
    },
  ],
  correctOptionIndex: 0,
};

describe("AssetClassLearningQuiz", () => {
  it("keeps labels and radio groups unique when multiple quizzes are rendered", async () => {
    render(
      <>
        <AssetClassLearningQuiz {...quiz} />
        <AssetClassLearningQuiz {...quiz} />
      </>,
    );

    const radios = await screen.findAllByRole("radio");
    expect(new Set(radios.map((radio) => radio.id)).size).toBe(radios.length);
    expect(screen.getAllByRole("radiogroup")).toHaveLength(2);
    expect(radios.every((radio) => radio.closest("label") !== null)).toBe(true);

    const quizzes = Array.from(
      document.querySelectorAll("section[aria-labelledby]"),
    );
    expect(quizzes).toHaveLength(2);
    const titleIds = quizzes.map((section) =>
      section.getAttribute("aria-labelledby"),
    );
    expect(new Set(titleIds).size).toBe(2);
    for (const titleId of titleIds) {
      expect(titleId).not.toBeNull();
      expect(document.getElementById(titleId ?? "")).not.toBeNull();
    }
  });

  it("requires an answer and explains an incorrect choice without moving options", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    render(<AssetClassLearningQuiz {...quiz} />);

    const radios = await screen.findAllByRole("radio");
    const correctRadio = radios.find((radio) =>
      radio.closest("label")?.textContent?.includes(quiz.options[0].text),
    );
    const initialCorrectPosition = radios.indexOf(correctRadio!);
    expect(initialCorrectPosition).not.toBe(0);
    const unselectedOption = screen
      .getByRole("radio", { name: quiz.options[2].text })
      .closest("label");
    expect(unselectedOption?.className).toContain("hover:border-primary/45");
    expect(unselectedOption?.className).toContain("hover:bg-primary/5");

    const checkButton = screen.getByRole("button", {
      name: "Conferir resposta",
    });
    expect(checkButton.hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("radio", { name: quiz.options[1].text }));
    const selectedLabel = screen
      .getByRole("radio", { name: quiz.options[1].text })
      .closest("label");
    expect(selectedLabel?.className).toContain("border-primary/60");
    expect(selectedLabel?.className).toContain("bg-primary/10");
    const selectedPosition = screen
      .getAllByRole("radio")
      .findIndex((radio) => radio.getAttribute("data-state") === "checked");
    expect(selectedPosition).toBeGreaterThanOrEqual(0);
    fireEvent.click(checkButton);

    expect(screen.getByRole("status").textContent).toContain("Quase lá");
    expect(screen.getByRole("status").textContent).toContain(
      "Essa renda não é garantida.",
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Uma participação no fundo.",
    );
    const answeredRadios = screen.getAllByRole("radio");
    expect(
      answeredRadios.findIndex(
        (radio) => radio.getAttribute("data-state") === "checked",
      ),
    ).toBe(selectedPosition);
    expect(
      answeredRadios.every((radio) => radio.hasAttribute("data-disabled")),
    ).toBe(true);
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");

    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(screen.queryByRole("status")).toBeNull();
    const retryCorrectPosition = screen
      .getAllByRole("radio")
      .findIndex((radio) =>
        radio.closest("label")?.textContent?.includes(quiz.options[0].text),
      );
    expect(retryCorrectPosition).not.toBe(initialCorrectPosition);
    expect(
      screen
        .getByRole("button", { name: "Conferir resposta" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("confirms a correct choice", async () => {
    render(<AssetClassLearningQuiz {...quiz} />);

    fireEvent.click(
      await screen.findByRole("radio", { name: quiz.options[0].text }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Conferir resposta" }));

    expect(screen.getByRole("status").textContent).toContain(
      "Boa! Você acertou",
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Aprendizado registrado",
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Certa explicação.",
    );
  });
});
