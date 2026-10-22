// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assetClassLearningContent } from "@/lib/asset-class-learning";
import { AssetClassLearningCard } from "@/app/(private)/learn/_components/asset-class-learning-card";
import { LearningLibrary } from "@/app/(private)/learn/_components/learning-library";

vi.mock("next/image", () => ({
  default: ({
    alt,
    src,
    className,
  }: {
    alt: string;
    src: string;
    className?: string;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} className={className} />
  ),
}));

afterEach(cleanup);

describe("LearningLibrary", () => {
  it("shows four class cards and anchors the selected detail below them", () => {
    render(<LearningLibrary selectedClass="fiis" />);

    expect(
      screen
        .getByRole("link", {
          name: "Abrir conteúdo sobre Fundos imobiliários (FIIs)",
        })
        .getAttribute("href"),
    ).toBe("/aprender?class=fiis#class-content");
    const selectedCard = screen.getByRole("link", {
      name: "Abrir conteúdo sobre Fundos imobiliários (FIIs)",
    });
    expect(selectedCard.className).toContain(
      "motion-safe:hover:-translate-y-0.5",
    );
    expect(
      screen
        .getByRole("link", {
          name: "Abrir conteúdo sobre Fundos imobiliários (FIIs)",
        })
        .getAttribute("aria-current"),
    ).toBe("location");
    expect(
      screen.getByRole("heading", {
        name: "Escolha um curso",
      }),
    ).toBeTruthy();
    expect(screen.queryByText("Educação financeira")).toBeNull();
    expect(screen.queryByText(/Explore conceitos de cada classe/)).toBeNull();
    expect(
      screen.getAllByRole("link", { name: /Abrir conteúdo sobre/ }),
    ).toHaveLength(4);
    const courseNavigation = screen.getByRole("navigation", {
      name: "Cursos por classe de ativos",
    });
    expect(courseNavigation.className).toContain("md:grid-cols-2");
    expect(courseNavigation.className).toContain("2xl:grid-cols-4");
    expect(courseNavigation.className).not.toContain("sm:grid-cols-4");
    const detail = screen.getByRole("region", {
      name: "Fundos imobiliários (FIIs)",
    });
    expect(detail.id).toBe("class-content");
    expect(document.getElementById("fiis")).toBeNull();
    expect(
      detail.compareDocumentPosition(
        screen.getByRole("link", {
          name: "Abrir conteúdo sobre Fundos imobiliários (FIIs)",
        }),
      ) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
    expect(
      screen.queryByRole("navigation", {
        name: "Conteúdos por classe de ativo",
      }),
    ).toBeNull();
    expect(
      screen.getByRole("region", { name: "Fundos imobiliários (FIIs)" })
        .textContent,
    ).not.toContain(assetClassLearningContent.fiis.description);
  });
});

describe("AssetClassLearningCard", () => {
  it("shows the coming-soon state when a class has no published video", () => {
    const originalContent = assetClassLearningContent.fiis;

    try {
      assetClassLearningContent.fiis = {
        imageSrc: originalContent.imageSrc,
        thumbnailSrc: originalContent.thumbnailSrc,
        description: originalContent.description,
        courseLessons: originalContent.courseLessons,
        assessment: originalContent.assessment,
        sources: originalContent.sources,
        availability: "coming-soon",
      };

      render(<AssetClassLearningCard id="fiis" selected={false} />);

      const card = screen.getByRole("link");
      expect(card.textContent).toContain("em breve");
      expect(card.textContent).not.toContain("Assistir");
      expect(card.querySelector("video")).toBeNull();
    } finally {
      assetClassLearningContent.fiis = originalContent;
    }
  });

  it("shows compact class selectors with lesson count and preserves official links", () => {
    render(<LearningLibrary selectedClass="fiis" />);

    for (const id of [
      "fiis",
      "brazilian_equities",
      "international_etfs",
      "fixed_income",
    ] as const) {
      const card = screen.getByRole("link", {
        name: `Abrir conteúdo sobre ${
          id === "fiis"
            ? "Fundos imobiliários (FIIs)"
            : id === "brazilian_equities"
              ? "Ações e BDRs"
              : id === "international_etfs"
                ? "ETFs internacionais"
                : "Renda fixa"
        }`,
      });
      expect(card.getAttribute("href")).toBe(
        `/aprender?class=${id}#class-content`,
      );
      expect(card.textContent).toContain(
        assetClassLearningContent[id].availability === "available"
          ? `${assetClassLearningContent[id].courseLessons.length} aulas · prova final`
          : "Vídeo em breve",
      );
      expect(card.querySelector("img")?.getAttribute("src")).toContain(
        assetClassLearningContent[id].imageSrc,
      );
      expect(card.querySelectorAll("img")).toHaveLength(1);
      expect(card.querySelector("video")).toBeNull();
    }
  });
});
