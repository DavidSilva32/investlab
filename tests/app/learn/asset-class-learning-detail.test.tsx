// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AssetClassLearningDetail } from "@/app/learn/_components/asset-class-learning-detail";

afterEach(cleanup);

describe("AssetClassLearningDetail", () => {
  it("renders the FIIs player at the shared class-content anchor without autoplay", () => {
    render(<AssetClassLearningDetail selectedClass="fiis" />);

    const detail = screen.getByRole("region", {
      name: "Fundos imobiliários (FIIs)",
    });
    const video = screen.getByLabelText(
      "Conteúdo educativo: Fundos imobiliários (FIIs)",
    ) as HTMLVideoElement;

    expect(detail.id).toBe("class-content");
    expect(video.controls).toBe(true);
    expect(video.playsInline).toBe(true);
    expect(video.preload).toBe("none");
    expect(video.autoplay).toBe(false);
    expect(video.getAttribute("poster")).toBe(
      "/images/asset-classes/fiis.webp",
    );
    expect(video.querySelector("source")?.getAttribute("src")).toBe(
      "/videos/fiis.mp4",
    );
    expect(screen.queryByText("Vídeo em breve")).toBeNull();
  });

  it("shows a coming-soon state without a player for each unavailable class", () => {
    for (const id of [
      "fixed_income",
      "brazilian_equities",
      "international_etfs",
    ] as const) {
      const view = render(<AssetClassLearningDetail selectedClass={id} />);
      expect(screen.getByRole("status").textContent).toContain(
        "Vídeo em breve",
      );
      expect(view.container.querySelector("video")).toBeNull();
      view.unmount();
    }
  });

  it("prompts for a selection when no class is requested", () => {
    render(<AssetClassLearningDetail selectedClass={null} />);
    expect(
      screen.getByText("Selecione uma classe para abrir o conteúdo educativo."),
    ).toBeTruthy();
    expect(document.getElementById("class-content")).toBeNull();
    expect(document.querySelector("video")).toBeNull();
  });
});
