// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AssetClassLearningQuiz } from "@/app/(private)/learn/_components/asset-class-learning-quiz";

afterEach(cleanup);

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
  it("keeps labels and radio groups unique when multiple quizzes are rendered", () => {
    render(
      <>
        <AssetClassLearningQuiz {...quiz} />
        <AssetClassLearningQuiz {...quiz} />
      </>,
    );

    const radios = screen.getAllByRole("radio");
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

  it("requires an answer before checking and explains an incorrect choice", () => {
    render(<AssetClassLearningQuiz {...quiz} />);

    const checkButton = screen.getByRole("button", {
      name: "Conferir resposta",
    });
    expect(checkButton.hasAttribute("disabled")).toBe(true);

    fireEvent.click(
      screen.getByRole("radio", { name: /Um rendimento garantido/ }),
    );
    expect(checkButton.hasAttribute("disabled")).toBe(false);
    fireEvent.click(checkButton);

    expect(screen.getByRole("status").textContent).toContain("Ainda não");
    expect(screen.getByRole("status").textContent).toContain(
      "Essa renda não é garantida.",
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Uma participação no fundo.",
    );
    expect(
      screen
        .getByRole("radio", { name: /Uma participação/ })
        .hasAttribute("data-disabled"),
    ).toBe(true);
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
  });

  it("confirms a correct choice and lets the learner retry", () => {
    render(<AssetClassLearningQuiz {...quiz} />);

    fireEvent.click(screen.getByRole("radio", { name: /Uma participação/ }));
    fireEvent.click(screen.getByRole("button", { name: "Conferir resposta" }));

    expect(screen.getByRole("status").textContent).toContain("Resposta certa");
    expect(screen.getByRole("status").textContent).toContain(
      "Certa explicação.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(
      screen
        .getByRole("radio", { name: /Uma participação/ })
        .hasAttribute("data-disabled"),
    ).toBe(false);
    expect(
      screen
        .getByRole("button", { name: "Conferir resposta" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
});
