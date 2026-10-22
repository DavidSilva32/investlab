import { describe, expect, it } from "vitest";
import {
  assetClassLearningContent,
  assetClassLearningCourseVersion,
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

  it("versions the expanded exam separately from the earlier five-question quiz", () => {
    expect(assetClassLearningCourseVersion).toBe(2);
  });

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
      expect(content.assessment).toHaveLength(10);
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

  it("uses ten final-exam scenarios to practice class-specific analysis steps", () => {
    const appliedPrompts: Record<StrategyAssetClassId, string[]> = {
      fiis: [
        "Um FII investe principalmente em títulos de crédito ligados a imóveis.",
        "Ao comparar dois fundos",
        "Um informe mostra aumento da vacância.",
        "Um contrato importante está perto do vencimento.",
        "O preço de uma cota está abaixo do valor patrimonial por cota.",
        "Um FII anuncia que investe em shoppings e galpões.",
        "Um fundo tem muitos imóveis, mas a maior parte da receita vem de um inquilino.",
        "Um fundo distribuiu valores parecidos por vários meses.",
        "Uma pessoa quer saber se dois FIIs têm exposição parecida a regiões e inquilinos.",
        "Um FII tem patrimônio total maior que outro.",
      ],
      brazilian_equities: [
        "Uma pessoa compra ações de uma companhia.",
        "O relatório de uma empresa mostra receita maior e lucro menor.",
        "Duas empresas têm P/L diferentes.",
        "Uma empresa mostra lucro maior neste ano",
        "Uma estimativa de preço teto ficou abaixo da cotação.",
        "Uma companhia vende alimentos e costuma ter clientes recorrentes.",
        "Uma empresa mostra lucro no relatório.",
        "Uma pessoa lê ‘ação preferencial’ e ‘ação ordinária’.",
        "Uma pessoa quer investir em uma empresa estrangeira pela bolsa brasileira",
        "O preço de uma ação caiu em um dia.",
      ],
      international_etfs: [
        "Dois ETFs têm nomes parecidos.",
        "Um ETF internacional acompanha um índice",
        "Você acompanha um ETF internacional em reais",
        "Um ETF reúne muitos ativos",
        "Dois ETFs seguem mercados diferentes.",
        "Um ETF acompanha um índice de ações.",
        "Uma pessoa quer saber se um ETF distribui exposição a muitas empresas.",
        "Dois ETFs têm exposições parecidas, mas taxas e custos diferentes.",
        "Um ETF internacional caiu em reais enquanto a moeda estrangeira subiu.",
        "Uma pessoa percebe que o ETF segue um setor específico.",
      ],
      fixed_income: [
        "Uma pessoa pode precisar do dinheiro antes do vencimento.",
        "Um produto oferece taxa maior que outro.",
        "Um título permite venda antes do vencimento.",
        "Uma pessoa encontra uma ‘caixinha’ no aplicativo.",
        "A ficha de um título menciona proteção ao investidor.",
        "Qual frase descreve melhor um CDB?",
        "Qual diferença simples ajuda a distinguir LCI e LCA?",
        "Uma pessoa vê uma taxa prefixada e outra ligada a um índice.",
        "Qual situação descreve melhor uma debênture?",
        "Uma pessoa separa dinheiro numa caixinha para usar em alguns meses.",
      ],
    };

    for (const { id } of strategyAssetClasses) {
      const prompts = assetClassLearningContent[id].assessment.map(
        ({ question }) => question,
      );
      expect(prompts).toHaveLength(10);

      for (const appliedPrompt of appliedPrompts[id]) {
        expect(prompts.some((prompt) => prompt.startsWith(appliedPrompt))).toBe(
          true,
        );
      }
    }
  });

  it("teaches accessible, class-specific product concepts with practical examples", () => {
    expect(
      assetClassLearningContent.fixed_income.courseLessons[0].examples?.map(
        ({ title }) => title,
      ),
    ).toEqual([
      "CDB",
      "LCI e LCA",
      "Tesouro Direto",
      "Debênture",
      "A ‘caixinha’ do aplicativo",
    ]);
    expect(
      assetClassLearningContent.fixed_income.courseLessons[0].examples?.[4]
        .description,
    ).toContain("não um tipo único de investimento");
    expect(
      assetClassLearningContent.fiis.courseLessons[1].examples?.map(
        ({ title }) => title,
      ),
    ).toEqual([
      "Imóveis de renda (tijolo)",
      "Títulos imobiliários (papel)",
      "Fundos de fundos",
      "Desenvolvimento",
      "Híbridos",
    ]);
    expect(
      assetClassLearningContent.brazilian_equities.courseLessons[1].content,
    ).toContain("não torna a empresa imune");
    expect(
      assetClassLearningContent.international_etfs.courseLessons[1].content,
    ).toContain("ETFs de ações, renda fixa, setores e mercados diferentes");
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
