// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetClassLearningVisuals } from "@/app/(private)/learn/_components/asset-class-learning-visuals";
import { assetClassLearningContent } from "@/lib/asset-class-learning";

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} />
  ),
}));

afterEach(cleanup);

describe("AssetClassLearningVisuals", () => {
  it("shows distinct, accessible visual examples of FII property types", () => {
    const visuals = assetClassLearningContent.fiis.courseLessons.find(
      (lesson) => lesson.visuals,
    )?.visuals;

    render(<AssetClassLearningVisuals visuals={visuals ?? []} />);

    expect(
      screen.getByRole("list", { name: "Exemplos de ativos imobiliários" }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Shoppings" })).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Galpões logísticos" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Imóveis residenciais" }),
    ).toBeTruthy();
    expect(screen.getAllByRole("img")).toHaveLength(3);
    expect(
      screen.getAllByRole("img").every((image) => image.getAttribute("alt")),
    ).toBe(true);
  });
});
