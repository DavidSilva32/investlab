import { describe, expect, it } from "vitest";
import {
  assetClassLearningContent,
  getLearningClassHref,
  resolveLearningClassId,
} from "@/lib/asset-class-learning";
import { strategyAssetClasses } from "@/lib/strategy-allocation";

describe("asset class learning links", () => {
  it("builds direct links with a stable class query and content anchor", () => {
    expect(getLearningClassHref("fiis")).toBe(
      "/learn?class=fiis#class-content",
    );
    expect(getLearningClassHref("brazilian_equities")).toBe(
      "/learn?class=brazilian_equities#class-content",
    );
  });

  it("keeps image and availability metadata keyed by the official class ids", () => {
    expect(Object.keys(assetClassLearningContent).sort()).toEqual(
      strategyAssetClasses.map(({ id }) => id).sort(),
    );
    expect(assetClassLearningContent.fiis).toMatchObject({
      imageSrc: "/images/asset-classes/fiis.webp",
      thumbnailSrc: "/images/asset-classes/fiis.webp",
      availability: "available",
      videoSrc: "/videos/fiis.mp4",
    });
    const thumbnailSources = strategyAssetClasses.map(
      ({ id }) => assetClassLearningContent[id].thumbnailSrc,
    );
    expect(thumbnailSources).toEqual(
      strategyAssetClasses.map(
        ({ id }) => assetClassLearningContent[id].imageSrc,
      ),
    );
    expect(new Set(thumbnailSources).size).toBe(strategyAssetClasses.length);
    for (const id of [
      "fixed_income",
      "brazilian_equities",
      "international_etfs",
    ] as const) {
      expect(assetClassLearningContent[id]).toMatchObject({
        availability: "coming-soon",
      });
      expect(assetClassLearningContent[id].imageSrc).toMatch(
        /^\/images\/asset-classes\//,
      );
      expect("videoSrc" in assetClassLearningContent[id]).toBe(false);
    }
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
