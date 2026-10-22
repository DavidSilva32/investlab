import { describe, expect, it } from "vitest";
import {
  assetClassLearningContent,
  calculateLearningAssessmentScore,
  getLearningClassHref,
  hasAllLearningAnswers,
  learningAssessmentPassScore,
  resolveLearningClassId,
  shuffleLearningOptions,
} from "@/lib/asset-class-learning";
import {
  strategyAssetClasses,
  type StrategyAssetClassId,
} from "@/lib/strategy-allocation";

describe("asset class learning links", () => {
  const officialClassIds = strategyAssetClasses.map(({ id }) => id);

  it("builds direct links with a stable class query and content anchor", () => {
    expect(getLearningClassHref("fiis")).toBe(
      "/aprender?class=fiis#class-content",
    );
    expect(getLearningClassHref("brazilian_equities")).toBe(
      "/aprender?class=brazilian_equities#class-content",
    );
  });

  it("keeps structured short lessons, comprehension checks, assessment, sources, and media for each class", () => {
    expect(Object.keys(assetClassLearningContent).sort()).toEqual(
      officialClassIds.sort(),
    );

    for (const { id } of strategyAssetClasses) {
      const content = assetClassLearningContent[id];

      expect(content.availability).toBe("available");
      expect(content.imageSrc).toMatch(/^\/images\/asset-classes\/.+\.webp$/);
      expect(content.thumbnailSrc).toBe(content.imageSrc);
      expect(content.videoSrc).toBe(`/videos/${id}.mp4`);
      expect(content.courseLessons.length).toBeGreaterThanOrEqual(3);
      expect(
        content.courseLessons.every(
          (lesson) =>
            lesson.title.length > 0 &&
            lesson.content.length > 0 &&
            lesson.question.options.length === 4,
        ),
      ).toBe(true);
      expect(content.assessment).toHaveLength(5);
      expect(
        content.assessment.every(
          (question) =>
            question.question.length > 0 && question.options.length === 4,
        ),
      ).toBe(true);
      for (const question of [
        ...content.courseLessons.map((lesson) => lesson.question),
        ...content.assessment,
      ]) {
        expect(question.correctOptionIndex).toBeGreaterThanOrEqual(0);
        expect(question.correctOptionIndex).toBeLessThan(
          question.options.length,
        );
        expect(
          question.options.every((option) => option.explanation.length > 0),
        ).toBe(true);
      }
      expect(
        content.courseLessons.every(
          (lesson) =>
            !lesson.visuals ||
            lesson.visuals.every(
              (visual) => visual.title && visual.description && visual.imageSrc,
            ),
        ),
      ).toBe(true);
      expect(
        content.courseLessons.some((lesson) => lesson.visuals?.length),
      ).toBe(id === "fiis");
      expect(content.sources.length).toBeGreaterThan(0);
      expect(
        content.sources.every((source) => source.href.startsWith("https://")),
      ).toBe(true);
    }

    expect(
      new Set(
        strategyAssetClasses.map(
          ({ id }) => assetClassLearningContent[id].imageSrc,
        ),
      ).size,
    ).toBe(strategyAssetClasses.length);
  });

  it("uses final-exam scenarios to practice class-specific analysis steps", () => {
    const appliedPrompts: Record<StrategyAssetClassId, string[]> = {
      fiis: [
        "Você compara dois FIIs",
        "Ao comparar dois fundos",
        "Um informe mostra aumento da vacância.",
        "Um contrato importante está perto do vencimento.",
        "Um FII teve DY alto em um período.",
      ],
      brazilian_equities: [
        "Uma pessoa compra ações de uma companhia.",
        "O relatório de uma empresa mostra receita maior e lucro menor.",
        "Duas empresas têm P/L diferentes.",
        "Uma empresa mostra lucro maior neste ano",
        "Uma estimativa de preço teto ficou abaixo da cotação.",
      ],
      international_etfs: [
        "Dois ETFs têm nomes parecidos.",
        "Um ETF internacional acompanha um índice",
        "Você acompanha um ETF internacional em reais",
        "Um ETF reúne muitos ativos",
        "Dois ETFs seguem mercados diferentes.",
      ],
      fixed_income: [
        "Uma pessoa pode precisar do dinheiro antes do vencimento.",
        "Um produto oferece taxa maior que outro.",
        "Um título permite venda antes do vencimento.",
        "Um título é emitido por uma empresa.",
        "A ficha de um título menciona proteção ao investidor.",
      ],
    };

    for (const { id } of strategyAssetClasses) {
      const prompts = assetClassLearningContent[id].assessment.map(
        ({ question }) => question,
      );
      expect(prompts).toHaveLength(5);

      for (const appliedPrompt of appliedPrompts[id]) {
        expect(prompts.some((prompt) => prompt.startsWith(appliedPrompt))).toBe(
          true,
        );
      }
    }
  });

  it("shuffles every answer once and moves the correct option for a new attempt", () => {
    const options = [
      { text: "A", explanation: "A" },
      { text: "B", explanation: "B" },
      { text: "C", explanation: "C" },
      { text: "D", explanation: "D" },
    ];
    const firstAttempt = shuffleLearningOptions(
      options,
      0,
      () => 0,
      [0, 1, 2, 3],
    );
    const secondAttempt = shuffleLearningOptions(
      options,
      0,
      () => 0,
      firstAttempt.map(({ sourceIndex }) => sourceIndex),
    );

    expect(firstAttempt.map(({ sourceIndex }) => sourceIndex).sort()).toEqual([
      0, 1, 2, 3,
    ]);
    expect(firstAttempt.findIndex(({ isCorrect }) => isCorrect)).not.toBe(0);
    expect(secondAttempt.findIndex(({ isCorrect }) => isCorrect)).not.toBe(
      firstAttempt.findIndex(({ isCorrect }) => isCorrect),
    );
    expect(shuffleLearningOptions(options, 0, () => 0)).toHaveLength(4);
  });

  it("scores the final assessment from zero to ten with a seven-point pass mark", () => {
    expect(calculateLearningAssessmentScore(0, 10)).toBe(0);
    expect(calculateLearningAssessmentScore(7, 10)).toBe(7);
    expect(calculateLearningAssessmentScore(15, 10)).toBe(10);
    expect(calculateLearningAssessmentScore(-1, 10)).toBe(0);
    expect(calculateLearningAssessmentScore(0, 5)).toBe(0);
    expect(calculateLearningAssessmentScore(3, 5)).toBe(6);
    expect(calculateLearningAssessmentScore(4, 5)).toBe(8);
    expect(calculateLearningAssessmentScore(5, 5)).toBe(10);
    expect(calculateLearningAssessmentScore(5, 0)).toBe(0);
    expect(learningAssessmentPassScore).toBe(7);
  });

  it("requires an answer for every assessment question before submission", () => {
    expect(hasAllLearningAnswers([0, 2, 1])).toBe(true);
    expect(hasAllLearningAnswers([0, null, 1])).toBe(false);
  });

  it("resolves only a single official class id", () => {
    expect(resolveLearningClassId("international_etfs")).toBe(
      "international_etfs",
    );
    expect(resolveLearningClassId("unknown")).toBeNull();
    expect(resolveLearningClassId(["fiis", "fixed_income"])).toBeNull();
    expect(resolveLearningClassId(undefined)).toBeNull();
    expect(resolveLearningClassId(undefined, "fiis")).toBe("fiis");
    expect(resolveLearningClassId(["unknown"], "fiis")).toBeNull();
  });
});
