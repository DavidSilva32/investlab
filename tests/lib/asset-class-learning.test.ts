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
      "/learn?class=fiis#class-content",
    );
    expect(getLearningClassHref("brazilian_equities")).toBe(
      "/learn?class=brazilian_equities#class-content",
    );
  });

  it("keeps image, thumbnail, and video metadata keyed by every official class id", () => {
    expect(Object.keys(assetClassLearningContent).sort()).toEqual(
      officialClassIds.sort(),
    );

    for (const { id } of strategyAssetClasses) {
      const content = assetClassLearningContent[id];

      expect(content.availability).toBe("available");
      expect(content.imageSrc).toMatch(/^\/images\/asset-classes\/.+\.webp$/);
      expect(content.thumbnailSrc).toBe(content.imageSrc);
      expect(content.videoSrc).toBe(`/videos/${id}.mp4`);
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
