import { describe, expect, it } from "vitest";
import {
  assetClassLearningContent,
  getLearningClassHref,
  resolveLearningClassId,
} from "@/lib/asset-class-learning";
import { strategyAssetClasses } from "@/lib/strategy-allocation";

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

  it("keeps lesson, quiz, image, thumbnail, and video content for every official class", () => {
    expect(Object.keys(assetClassLearningContent).sort()).toEqual(
      officialClassIds.sort(),
    );

    for (const { id } of strategyAssetClasses) {
      const content = assetClassLearningContent[id];

      expect(content.availability).toBe("available");
      expect(content.imageSrc).toMatch(/^\/images\/asset-classes\/.+\.webp$/);
      expect(content.thumbnailSrc).toBe(content.imageSrc);
      expect(content.videoSrc).toBe(`/videos/${id}.mp4`);
      expect(content.lesson.title.length).toBeGreaterThan(0);
      expect(content.lesson.explanation.length).toBeGreaterThan(0);
      expect(content.lesson.takeaway.length).toBeGreaterThan(0);
      expect(content.quiz.question.length).toBeGreaterThan(0);
      expect(content.quiz.options).toHaveLength(4);
      expect(
        content.quiz.options.every((option) => option.explanation.length > 0),
      ).toBe(true);
      expect(content.quiz.correctOptionIndex).toBeGreaterThanOrEqual(0);
      expect(content.quiz.correctOptionIndex).toBeLessThan(
        content.quiz.options.length,
      );
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
