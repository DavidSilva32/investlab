// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AssetClassLearningDetail } from "@/app/(private)/learn/_components/asset-class-learning-detail";
import { assetClassLearningContent } from "@/lib/asset-class-learning";
import {
  strategyAssetClasses,
  type StrategyAssetClassId,
} from "@/lib/strategy-allocation";

afterEach(cleanup);

const posterByClass: Record<StrategyAssetClassId, string> = {
  fixed_income: "/images/asset-classes/fixed-income-office.webp",
  brazilian_equities: "/images/asset-classes/brazilian-equities.webp",
  international_etfs: "/images/asset-classes/international-etfs.webp",
  fiis: "/images/asset-classes/fiis.webp",
};

describe("AssetClassLearningDetail", () => {
  it("shows the coming-soon status without a player when a class has no video", () => {
    const originalContent = assetClassLearningContent.fiis;

    try {
      assetClassLearningContent.fiis = {
        imageSrc: originalContent.imageSrc,
        thumbnailSrc: originalContent.thumbnailSrc,
        description: originalContent.description,
        courseLessons: originalContent.courseLessons,
        quiz: originalContent.quiz,
        sources: originalContent.sources,
        availability: "coming-soon",
      };

      render(<AssetClassLearningDetail selectedClass="fiis" />);

      expect(screen.getByRole("status").textContent).toContain("em breve");
      expect(
        screen.getByRole("heading", {
          name: originalContent.courseLessons[0].title,
        }),
      ).toBeTruthy();
      expect(screen.queryByRole("radio")).toBeNull();
      expect(document.querySelector("video")).toBeNull();
    } finally {
      assetClassLearningContent.fiis = originalContent;
    }
  });

  it.each(strategyAssetClasses)(
    "renders the $id accessible video player with its class poster and MP4 source",
    ({ id, label }) => {
      render(<AssetClassLearningDetail selectedClass={id} />);

      const detail = screen.getByRole("region", { name: label });
      const video = detail.querySelector("video") as HTMLVideoElement;
      const source = video.querySelector("source");

      expect(detail.id).toBe("class-content");
      expect(video.getAttribute("aria-label")).toContain(label);
      expect(video.controls).toBe(true);
      expect(video.playsInline).toBe(true);
      expect(video.preload).toBe("none");
      expect(video.autoplay).toBe(false);
      expect(video.getAttribute("poster")).toBe(posterByClass[id]);
      expect(source?.getAttribute("src")).toBe(`/videos/${id}.mp4`);
      expect(source?.getAttribute("type")).toBe("video/mp4");
      expect(
        screen.getByRole("heading", { name: contentCourseLesson(id) }),
      ).toBeTruthy();
      expect(screen.queryByRole("radio")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Próxima aula" }));
      fireEvent.click(screen.getByRole("button", { name: "Próxima aula" }));
      fireEvent.click(
        screen.getByRole("button", { name: "Ir para a pergunta" }),
      );
      expect(
        screen.getByRole("heading", { name: contentQuestion(id) }),
      ).toBeTruthy();
      expect(screen.getAllByRole("radio")).toHaveLength(4);
      expect(
        screen.getByRole("button", { name: `Fontes oficiais sobre ${label}` }),
      ).toBeTruthy();
      expect(screen.queryByText(/em breve/i)).toBeNull();
      expect(screen.queryByRole("status")).toBeNull();
    },
  );

  it("prompts for a selection when no class is requested", () => {
    render(<AssetClassLearningDetail selectedClass={null} />);
    expect(screen.getByText(/Selecione uma classe para abrir/)).toBeTruthy();
    expect(document.getElementById("class-content")).toBeNull();
    expect(document.querySelector("video")).toBeNull();
  });

  it("keeps official references collapsed until requested", async () => {
    render(<AssetClassLearningDetail selectedClass="fiis" />);

    const trigger = screen.getByRole("button", {
      name: "Fontes oficiais sobre Fundos imobiliários (FIIs)",
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(
      screen.queryByRole("link", { name: /Portal do Investidor/ }),
    ).toBeNull();

    fireEvent.click(trigger);

    await waitFor(() => {
      expect(trigger.getAttribute("aria-expanded")).toBe("true");
      expect(
        screen.getAllByRole("link", { name: /Portal do Investidor/ }),
      ).toHaveLength(2);
    });
  });
});

function contentCourseLesson(id: StrategyAssetClassId) {
  return assetClassLearningContent[id].courseLessons[0].title;
}

function contentQuestion(id: StrategyAssetClassId) {
  return assetClassLearningContent[id].quiz.question;
}
